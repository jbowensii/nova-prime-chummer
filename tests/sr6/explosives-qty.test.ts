// Explosives, grenades, rockets and detonators as the importer writes them: N of one is one line with a count, at creation
// and on the career Ledger, priced unit x qty (a rated package at its rating's tier).
import { expect, test } from 'vitest'
import { apply } from '../../src/sr6/runner-builder/domain/creation/actions'
import { balances, currentBuild, preview, record } from '../../src/sr6/runner-builder/domain/career/career'
import { sr6Data } from '../../src/sr6/catalog/domain/data'
import { stacks } from '../../src/sr6/catalog/domain/categories'
import { blankSr6, type Sr6Advance } from '../../src/sr6/formats/domain/character'
import { buildOf, fixtureCatalog, fixtureCreation, GLIM } from './catalog/fixture'

const TIER = 'tier(R; 1-3: R*10; 4-6: R*50; 7-9: R*100; 10-12: R*250; 13-15: R*500; 16-18: R*1000; 19-20: R*5000)'
const BOOM = {
  file: 'custom/sr6/imported/zz/weapons.xml',
  xml:
    '<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="weapons" version="1">' +
    `<weapon id="zz.plastic-explosives" source="CRB" page="264" category="Explosive Package" rating="1–20" cost="By rating (Explosive Packages)" class="AMMUNITION/EXPLOSIVES"><name>Plastic Explosives</name><formula field="cost">${TIER}</formula></weapon>` +
    '<weapon id="zz.fragmentation" source="CRB" page="263" category="Grenade" avail="4(I)" cost="150" class="AMMUNITION/GRENADES"><name>Fragmentation</name></weapon>' +
    '<weapon id="zz.rocket" source="CRB" page="263" category="Rocket and missile" avail="12(I)" cost="2000" class="AMMUNITION/ROCKETS"><name>Rocket</name></weapon>' +
    '</sr6:data>',
}
const GEAR = {
  file: 'custom/sr6/imported/zz/gear.xml',
  xml:
    '<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="gear" version="1">' +
    '<gear id="zz.detonator-cap" source="CRB" page="264" category="Explosive" avail="4(I)" cost="75" class="AMMUNITION/EXPLOSIVES"><name>Detonator Cap</name></gear>' +
    '</sr6:data>',
}
const world = () => ({ data: sr6Data(fixtureCatalog(undefined, [BOOM, GEAR])), cr: fixtureCreation() })
const NOW = '2026-10-06T10:00:00.000Z'
const CASES = [
  { kind: 'weapons', id: 'zz.fragmentation', qty: 5, unit: 150 },
  { kind: 'weapons', id: 'zz.rocket', qty: 5, unit: 2000 },
  { kind: 'gear', id: 'zz.detonator-cap', qty: 5, unit: 75 },
  { kind: 'weapons', id: 'zz.plastic-explosives', qty: 3, rating: 6, unit: 300 },
  { kind: 'weapons', id: 'zz.plastic-explosives.6', qty: 3, unit: 300 },
] as const

test('creation: N explosives are one line with a count', () => {
  const { data, cr } = world()
  for (const k of CASES) {
    const b = buildOf('priority', { letters: 'CABDA', metatype: GLIM })
    expect(stacks(k.kind, data.entry(k.kind, k.id))).toBe(true)
    expect(apply(b, { op: 'purchase', kind: k.kind, id: k.id, qty: k.qty, ...('rating' in k ? { rating: k.rating } : {}) }, data, cr)).toEqual({ ok: true })
    expect(b.purchases.map(x => x.qty)).toEqual([k.qty])
  }
})

test('career: N explosives cost unit x N', () => {
  const { data, cr } = world()
  for (const k of CASES) {
    const ch = blankSr6('karma', 'c1', NOW)
    ch.build = buildOf('karma', { metatype: GLIM })
    ch.identity.metatype = GLIM
    ch.finalizedAt = NOW
    ch.final = { karma: 100, nuyen: 50000 }
    ch.ledger = [{ id: 'f1', at: NOW, type: 'finalize', karma: 100, nuyen: 50000 }]
    const adv: Sr6Advance = {
      op: 'purchase',
      line: { uid: '', kind: k.kind, id: k.id, qty: k.qty, accessories: [], ...('rating' in k ? { rating: k.rating } : {}) },
    }
    expect(preview(ch, adv, data, cr)).toMatchObject({ ok: true, nuyen: k.unit * k.qty })
    const r = record(ch, adv, data, cr)
    if (!r.ok) throw new Error(r.reason)
    expect(currentBuild(r.ch).purchases.map(x => x.qty)).toEqual([k.qty])
    expect(balances(r.ch).nuyen).toBe(50000 - k.unit * k.qty)
  }
})

test('creation: the quantity stepper works on a grenade and buying again merges; a gun still refuses', () => {
  const { data, cr } = world()
  const b = buildOf('priority', { letters: 'CABDA', metatype: GLIM })
  apply(b, { op: 'purchase', kind: 'weapons', id: 'zz.fragmentation', qty: 2 }, data, cr)
  apply(b, { op: 'purchase', kind: 'weapons', id: 'zz.fragmentation', qty: 3 }, data, cr)
  expect(b.purchases.map(x => x.qty)).toEqual([5])
  expect(apply(b, { op: 'quantity', uid: b.purchases[0].uid, qty: 7 }, data, cr)).toEqual({ ok: true })
  expect(b.purchases[0].qty).toBe(7)
  apply(b, { op: 'purchase', kind: 'weapons', id: 'crb.zap-gun' }, data, cr)
  expect(apply(b, { op: 'quantity', uid: b.purchases[1].uid, qty: 2 }, data, cr)).toEqual({ ok: false, reason: 'own-line' })
})
