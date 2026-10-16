// Licensed availability (owner 2026-10-15): a nuyen price under AVAIL is a licence fee, listed and flagged with a heads-up,
// never enforced: the item is bought, priced and counted like any other (licences are for the GM). All names made up.
import { expect, test } from 'vitest'
import { apply } from '../../src/sr6/engine/actions'
import { priced } from '../../src/sr6/engine/purchases'
import { allBudgets } from '../../src/sr6/engine/budgets'
import { makeProvider } from '../../src/sr6/engine/providers'
import { availNote } from '../../src/sr6/engine/values'
import { balances, currentBuild, preview, record, voidEntry } from '../../src/sr6/engine/career'
import { sr6ToXml, xmlToSr6 } from '../../src/sr6/engine/charxml'
import { priceAt } from '../../src/sr6/ui/Picker'
import { blankSr6 } from '../../src/sr6/model/character'
import { buildOf, GLIM, made } from './fixture'

test('a pure licence fee is listed in words and earns a warning; a rating plus a fee shows both', () => {
  expect(availNote('15,000¥')).toEqual({
    text: 'available with licence (fee 15,000¥)',
    warn: 'Needs a licence (fee 15,000¥) on each SIN it’s carried under — or carry it unlicensed; settle it with your GM.',
  })
  expect(availNote('2(L), 500¥').text).toBe('2(L), licence fee 500¥')
  expect(availNote('2(L), 500¥').warn).toMatch(/^Needs a licence/)
  expect(availNote('6(L)')).toEqual({ warn: 'Legality L: licences and legality are for your GM; not enforced here.' })
  expect(availNote('2, 15,000¥').text).toBe('2, licence fee 15,000¥') // (a rating and a fee, no legality letter)
  expect(availNote('4')).toEqual({ warn: undefined })
  expect(availNote(undefined)).toEqual({ warn: undefined })
})

test('buying a licence item still succeeds, is priced as free of availability and reads without a warning from the engine', () => {
  const { data, cr } = made({
    data: d => {
      d.entry('gear', 'crb.tangle-rope.1')!.attrs.avail = '15,000¥'
    },
  })
  const ch = blankSr6('priority', 'r1', '2026-10-03T00:00:00Z')
  ch.build = buildOf('priority', { letters: 'CABDA', metatype: GLIM, magic: 'mundane' })
  expect(apply(ch.build, { op: 'purchase', kind: 'gear', id: 'crb.tangle-rope.1' }, data, cr)).toEqual({ ok: true })
  expect(priced(ch.build.purchases.at(-1)!, data, cr)).toMatchObject({ avail: 0, ok: true })
  expect(priceAt(data.entry('gear', 'crb.tangle-rope.1')!, 1, cr, undefined, data).avail).toBe('available with licence (fee 15,000¥)')
})

test('an item licensed on SINs lists them with no warning; on none, the one warning stays', () => {
  expect(availNote('2(L), 500¥', 1, ['Pat Roe', 'Pat Doe'])).toEqual({ text: '2(L), licence fee 500¥ · licensed on: Pat Roe, Pat Doe' })
  expect(availNote('2(L), 500¥', 1, [])).toEqual(availNote('2(L), 500¥'))
  // (no fee printed: nothing to license)
  expect(availNote('6(L)', 1, ['Pat Roe'])).toEqual(availNote('6(L)'))
})

/** a priority runner with two made-up SINs and a Tangle Rope whose Availability prints a 500¥ fee */
function licensable() {
  const { data, cr } = made({
    data: d => {
      d.entry('gear', 'crb.tangle-rope.1')!.attrs.avail = '2, 500¥'
    },
  })
  const ch = blankSr6('priority', 'r1', '2026-10-03T00:00:00Z')
  ch.build = buildOf('priority', { letters: 'CABDA', metatype: GLIM, magic: 'mundane' })
  ch.build.sins = [
    { uid: 's1', name: 'Pat Roe', kind: 'fake', rating: 3, licences: [] },
    { uid: 's2', name: 'Pat Doe', kind: 'real', licences: [] },
  ]
  return { data, cr, ch, b: ch.build }
}

test('licences are per SIN: the fee once for each SIN chosen, each taken back, a removed SIN’s licence gone with it', () => {
  const { data, cr, b } = licensable()
  expect(apply(b, { op: 'purchase', kind: 'gear', id: 'crb.tangle-rope.1', qty: 2 }, data, cr)).toEqual({ ok: true })
  const x = b.purchases[0],
    base = priced(x, data, cr).cost
  expect(apply(b, { op: 'licensed', uid: x.uid, sin: 's1', on: true }, data, cr)).toEqual({ ok: true })
  expect(priced(x, data, cr)).toMatchObject({ cost: base + 500, licence: 500 })
  expect(apply(b, { op: 'licensed', uid: x.uid, sin: 's2', on: true }, data, cr)).toEqual({ ok: true })
  expect(apply(b, { op: 'licensed', uid: x.uid, sin: 's2', on: true }, data, cr)).toEqual({ ok: true }) // (once a SIN)
  expect(x.licensedOn).toEqual(['s1', 's2'])
  expect(priced(x, data, cr)).toMatchObject({ cost: base + 1000, licence: 1000 })
  expect(allBudgets(b, data, cr, makeProvider(b.method, data, cr)).nuyen.breakdown?.find(l => l.key === `purchase:${x.uid}`)?.label).toMatch(/with 2 licences$/)
  expect(apply(b, { op: 'licensed', uid: x.uid, sin: 's1', on: false }, data, cr)).toEqual({ ok: true })
  expect(x.licensedOn).toEqual(['s2'])
  expect(apply(b, { op: 'sin', remove: 's2' }, data, cr)).toEqual({ ok: true })
  expect(x.licensedOn).toBeUndefined()
  expect(priced(x, data, cr).cost).toBe(base)
  // (an unknown line or SIN is refused; so is an item printing no fee)
  expect(apply(b, { op: 'licensed', uid: 'gone', sin: 's1', on: true }, data, cr)).toEqual({ ok: false, reason: 'unknown-line' })
  expect(apply(b, { op: 'licensed', uid: x.uid, sin: 's2', on: true }, data, cr)).toEqual({ ok: false, reason: 'unknown-line' })
  data.entry('gear', 'crb.tangle-rope.1')!.attrs.avail = '2'
  expect(apply(b, { op: 'licensed', uid: x.uid, sin: 's1', on: true }, data, cr)).toEqual({ ok: false, reason: 'no-licence' })
})

test('after creation a licence on a SIN is a ledger purchase at its fee, voidable', () => {
  const { data, cr, ch } = licensable()
  ch.build.purchases = [{ uid: 'g1', kind: 'gear', id: 'crb.tangle-rope.1', qty: 1, licensedOn: ['s1'], accessories: [] }]
  Object.assign(ch, { finalizedAt: '2026-10-16T00:00:00Z', final: { karma: 0, nuyen: 600 } })
  ch.ledger = [{ id: 'f1', at: '2026-10-16T00:00:00Z', type: 'finalize', karma: 0, nuyen: 600 }]
  expect(preview(ch, { op: 'licensed', target: 'g1', sin: 's1' }, data, cr)).toEqual({ ok: false, reason: 'already-known' })
  expect(preview(ch, { op: 'licensed', target: 'g1', sin: 's2' }, data, cr)).toEqual({
    ok: true,
    label: 'Licence: Tangle Rope 1 on Pat Doe',
    karma: 0,
    nuyen: 500,
  })
  const r = record(ch, { op: 'licensed', target: 'g1', sin: 's2' }, data, cr)
  if (!r.ok) throw new Error(r.reason)
  expect(currentBuild(r.ch).purchases[0].licensedOn).toEqual(['s1', 's2'])
  expect(balances(r.ch).nuyen).toBe(100)
  const v = voidEntry(r.ch, r.ch.ledger.at(-1)!.id, 'Oops')
  expect(v.ok && currentBuild(v.ch).purchases[0].licensedOn).toEqual(['s1'])
  expect(preview(ch, { op: 'licensed', target: 'g1', sin: 'gone' }, data, cr)).toEqual({ ok: false, reason: 'unknown-line' })
})

test('an older file’s licence choice reads: bought, licensed on the first SIN; unlicensed or no SIN, none', () => {
  const { ch } = licensable()
  ch.build.purchases = [{ uid: 'g1', kind: 'gear', id: 'crb.tangle-rope.1', qty: 1, licensedOn: ['s2'], accessories: [] }]
  const xml = sr6ToXml(ch)
  const old = (choice: string, x = xml) => {
    const r = xmlToSr6(x.replace('licensedOn="s2"', `licence="${choice}"`))
    if (!r.ok) throw new Error(r.reason)
    return r.character.build.purchases[0].licensedOn
  }
  expect(old('bought')).toEqual(['s1'])
  expect(old('unlicensed')).toBeUndefined()
  expect(old('bought', xml.replace(/<sin [\s\S]*?<\/sin>|<sin [^>]*\/>/g, ''))).toBeUndefined()
})
