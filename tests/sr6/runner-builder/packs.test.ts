// A starter pack (owner 2026-10-31, option A) expands into its items as separate lines at the pack's price; removing the
// header (creation) or voiding the entry (career) takes all of them away. Made-up pack and items.
import { expect, test } from 'vitest'
import { apply } from '../../../src/sr6/runner-builder/domain/creation/actions'
import { nuyenBudget } from '../../../src/sr6/runner-builder/domain/creation/budgets'
import { makeProvider } from '../../../src/sr6/runner-builder/domain/creation/providers'
import { balances, currentBuild, record, voidEntry } from '../../../src/sr6/runner-builder/domain/career/career'
import { expandPack } from '../../../src/sr6/runner-builder/domain/creation/packs'
import { sr6ToXml, xmlToSr6 } from '../../../src/sr6/formats/domain/charxml'
import { blankSr6 } from '../../../src/sr6/formats/domain/character'
import { sr6Data } from '../../../src/sr6/catalog/domain/data'
import { buildOf, fixtureCatalog, fixtureCreation, GLIM } from '../catalog/fixture'

const PACKS = `<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="packs" version="1"><pack id="tst.kit" source="CRB" page="1" cost="1000"><name>Test Kit</name><item>2 Zap Scope</item><item>Fake SIN (rating 3)</item><item>two fake licenses (rating 3, Firearm, Hunting)</item><item>1 month Cozy lifestyle</item><item>Mystery widget</item></pack></sr6:data>`
const data = sr6Data(fixtureCatalog(undefined, [{ file: 'packs.xml', xml: PACKS }]))
const cr = fixtureCreation()
const NOW = '2026-10-31T10:00:00.000Z'

test('creation: the pack costs its price, expands into editable lines, and undoes whole', () => {
  const b = buildOf('priority', { letters: 'CABDA', metatype: GLIM })
  const spent = () => nuyenBudget(b, data, cr, makeProvider(b.method, data, cr)).spent
  expect(apply(b, { op: 'pack', id: 'tst.kit' }, data, cr)).toEqual({ ok: true })
  expect(spent()).toBe(1000)
  const scope = b.purchases.find(x => x.id === 'crb.zap-scope')
  expect(scope).toMatchObject({ qty: 2 })
  expect(b.purchases.find(x => x.name === 'Mystery widget')).toMatchObject({ cost: 0 })
  expect(b.sins).toHaveLength(1)
  expect(b.sins[0].licences.map(l => l.name)).toEqual(['Firearm', 'Hunting'])
  expect(b.sins[0].lifestyles).toHaveLength(1)
  // an inner item can go on its own; the pack price stays (no refund by default)
  expect(apply(b, { op: 'purchase', remove: scope!.uid }, data, cr)).toEqual({ ok: true })
  expect(spent()).toBe(1000)
  // buying the same item again is its own, priced line (never merged into the free one)
  apply(b, { op: 'pack', id: 'tst.kit' }, data, cr)
  const header = b.purchases.filter(x => x.pack === x.uid)
  expect(header).toHaveLength(2)
  expect(apply(b, { op: 'purchase', remove: header[0].uid }, data, cr)).toEqual({ ok: true })
  expect(spent()).toBe(1000)
  expect(apply(b, { op: 'purchase', remove: header[1].uid }, data, cr)).toEqual({ ok: true })
  expect(b.purchases).toEqual([])
  expect(b.sins).toEqual([])
})

test('career: one ledger entry at the pack price; void removes it all; survives export', () => {
  let ch = blankSr6('karma', 'c1', NOW)
  ch.build = buildOf('karma', { metatype: GLIM })
  ch.identity.metatype = GLIM
  ch.finalizedAt = NOW
  ch.final = { karma: 100, nuyen: 5000 }
  ch.ledger = [{ id: 'f1', at: NOW, type: 'finalize', karma: 100, nuyen: 5000 }]
  const x = expandPack(data, 'tst.kit', ch.build)!
  const r = record(ch, { op: 'pack', ...x }, data, cr)
  if (!r.ok) throw new Error(r.reason)
  ch = r.ch
  expect(balances(ch).nuyen).toBe(4000)
  expect(currentBuild(ch).purchases.length).toBeGreaterThan(1)
  expect(currentBuild(ch).sins[0].lifestyles).toHaveLength(1)
  const back = xmlToSr6(sr6ToXml(ch))
  if (!back.ok) throw new Error(back.reason)
  expect(currentBuild(back.character)).toEqual(currentBuild(ch))
  const v = voidEntry(ch, ch.ledger.at(-1)!.id, 'oops', NOW)
  if (!v.ok) throw new Error(v.reason)
  expect(balances(v.ch).nuyen).toBe(5000)
  expect(currentBuild(v.ch).purchases).toEqual([])
  expect(currentBuild(v.ch).sins).toEqual([])
})

test('two packs at creation, each undone on its own', () => {
  const b = buildOf('priority', { letters: 'CABDA', metatype: GLIM })
  const spent = () => nuyenBudget(b, data, cr, makeProvider(b.method, data, cr)).spent
  apply(b, { op: 'pack', id: 'tst.kit' }, data, cr)
  apply(b, { op: 'pack', id: 'tst.kit' }, data, cr)
  expect(spent()).toBe(2000)
  const heads = b.purchases.filter(x => x.pack === x.uid)
  apply(b, { op: 'purchase', remove: heads[0].uid }, data, cr)
  expect(spent()).toBe(1000)
})
