// Licensed availability (owner 2026-10-15): a nuyen price under AVAIL is a licence fee, listed and flagged with a heads-up,
// never enforced: the item is bought, priced and counted like any other (licences are for the GM). Every licence is one of
// a SIN's (owner 2026-10-16), rated as the SIN and named after the licence type covering the item: on a fake SIN one of
// its fake licences, on a real SIN at the printed fee.
// All names made up.
import { expect, test } from 'vitest'
import { apply } from '../../src/sr6/engine/actions'
import { licenceName, priced } from '../../src/sr6/engine/purchases'
import { allBudgets } from '../../src/sr6/engine/budgets'
import { makeProvider } from '../../src/sr6/engine/providers'
import { availNote } from '../../src/sr6/catalog/domain/values'
import { balances, currentBuild, preview, record, voidEntry } from '../../src/sr6/engine/career'
import { sr6ToXml, xmlToSr6 } from '../../src/sr6/formats/domain/charxml'
import { priceAt } from '../../src/sr6/ui/Picker'
import { blankSr6, type Sr6Build, type Sr6Purchase } from '../../src/sr6/formats/domain/character'
import { buildOf, GLIM, made } from './catalog/fixture'

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

/** a priority runner with two made-up SINs (a fake one, rating 3, and a real one) and a Tangle Rope whose Availability
 *  prints a 500¥ fee; the fixture's licencePerRating is 300 */
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
const sinLine = (b: Sr6Build, { data, cr }: ReturnType<typeof licensable>, uid: string) =>
  allBudgets(b, data, cr, makeProvider(b.method, data, cr)).nuyen.breakdown?.find(l => l.key === `sin:${uid}`)

test('an item licence is named after the licence type covering it and rated as its SIN: on a fake SIN priced by rating, on a real SIN its fee; never on the item', () => {
  const t = licensable(),
    { data, cr, b } = t
  expect(apply(b, { op: 'purchase', kind: 'gear', id: 'crb.tangle-rope.1', qty: 2 }, data, cr)).toEqual({ ok: true })
  const x = b.purchases[0],
    base = priced(x, data, cr).cost
  const fake0 = sinLine(b, t, 's1')!.amount // (rating 3 × fakeSinPerRating)
  expect(apply(b, { op: 'licensed', uid: x.uid, sin: 's1', on: true }, data, cr)).toEqual({ ok: true })
  // (gear the table names no licence type for: Licence (<its category>))
  expect(b.sins[0].licences).toEqual([{ name: 'Licence (tools)', rating: 3, item: x.uid }])
  expect(sinLine(b, t, 's1')).toMatchObject({ amount: fake0 + 3 * 300, label: 'Pat Roe (fake SIN, rating 3) · 1 licence' })
  expect(priced(x, data, cr).cost).toBe(base) // (no double charge: the fee isn't on the item)
  expect(apply(b, { op: 'licensed', uid: x.uid, sin: 's1', on: true }, data, cr)).toEqual({ ok: true }) // (once a SIN)
  expect(b.sins[0].licences).toHaveLength(1)
  // a real SIN: the printed fee, rated 1
  expect(apply(b, { op: 'licensed', uid: x.uid, sin: 's2', on: true }, data, cr)).toEqual({ ok: true })
  expect(b.sins[1].licences).toEqual([{ name: 'Licence (tools)', rating: 1, item: x.uid }])
  expect(sinLine(b, t, 's2')?.amount).toBe(500)
  // renamed, and back
  expect(apply(b, { op: 'licence', sin: 's1', name: 'Rope permit', at: 0 }, data, cr)).toEqual({ ok: true })
  expect(b.sins[0].licences[0].name).toBe('Rope permit')
  expect(apply(b, { op: 'licence', sin: 's1', name: 'Licence (tools)', at: 0 }, data, cr)).toEqual({ ok: true })
  // the fake SIN's rating changed: its licence follows, re-priced; the real SIN's fee stays
  expect(apply(b, { op: 'sin', uid: 's1', rating: 1 }, data, cr)).toEqual({ ok: true })
  expect(b.sins[0].licences[0].rating).toBe(1)
  expect(sinLine(b, t, 's1')?.amount).toBe(fake0 / 3 + 300)
  expect(sinLine(b, t, 's2')?.amount).toBe(500)
  // a removed SIN takes its licences; a removed item its licences on every SIN
  expect(apply(b, { op: 'sin', remove: 's2' }, data, cr)).toEqual({ ok: true })
  expect(apply(b, { op: 'purchase', remove: x.uid }, data, cr)).toEqual({ ok: true })
  expect(b.sins[0].licences).toEqual([])
  // (an unknown line or SIN is refused; so is an item printing no fee)
  expect(apply(b, { op: 'licensed', uid: 'gone', sin: 's1', on: true }, data, cr)).toEqual({ ok: false, reason: 'unknown-line' })
  expect(apply(b, { op: 'purchase', kind: 'gear', id: 'crb.tangle-rope.1' }, data, cr)).toEqual({ ok: true })
  expect(apply(b, { op: 'licensed', uid: b.purchases[0].uid, sin: 's2', on: true }, data, cr)).toEqual({ ok: false, reason: 'unknown-line' })
  data.entry('gear', 'crb.tangle-rope.1')!.attrs.avail = '2'
  expect(apply(b, { op: 'licensed', uid: b.purchases[0].uid, sin: 's1', on: true }, data, cr)).toEqual({ ok: false, reason: 'no-licence' })
})

test('the licence type covering an item: by its kind and class, named as the catalog has it; else Licence (<category>)', () => {
  const { data } = made()
  const line = (kind: Sr6Purchase['kind'], id: string): Sr6Purchase => ({ uid: 'x', kind, id, qty: 1, accessories: [] })
  // (the fixture's made-up name for crb.firearm-license: read from the data, not the table)
  expect(licenceName(line('weapons', 'crb.zap-gun'), data)).toBe('Made-up Gun Permit')
  expect(licenceName(line('gear', 'crb.tangle-rope.1'), data)).toBe('Licence (tools)')
  // (a type the catalog lacks: the fallback, never a guess)
  data.entry('gear', 'crb.tangle-rope.1')!.attrs.class = 'ELECTRONICS/CYBERDECK'
  expect(licenceName(line('gear', 'crb.tangle-rope.1'), data)).toBe('Licence (tools)')
  expect(licenceName({ uid: 'c', kind: 'gear', name: 'Mine', qty: 1, accessories: [] }, data)).toBe('Licence (gear)')
})

test('after creation a licence on a SIN is a ledger spend, voidable: a real SIN’s at the fee, a fake one’s by the SIN’s rating', () => {
  const { data, cr, ch } = licensable()
  ch.build.purchases = [{ uid: 'g1', kind: 'gear', id: 'crb.tangle-rope.1', name: 'Tangle Rope', qty: 1, accessories: [] }]
  ch.build.sins[0].licences = [{ name: 'Licence (tools)', rating: 3, item: 'g1' }]
  Object.assign(ch, { finalizedAt: '2026-10-16T00:00:00Z', final: { karma: 0, nuyen: 1000 } })
  ch.ledger = [{ id: 'f1', at: '2026-10-16T00:00:00Z', type: 'finalize', karma: 0, nuyen: 1000 }]
  expect(preview(ch, { op: 'licensed', target: 'g1', sin: 's1' }, data, cr)).toEqual({ ok: false, reason: 'already-known' })
  expect(preview(ch, { op: 'licensed', target: 'g1', sin: 's2' }, data, cr)).toEqual({
    ok: true,
    label: 'Licence: Tangle Rope 1 on Pat Doe',
    karma: 0,
    nuyen: 500,
  })
  const r = record(ch, { op: 'licensed', target: 'g1', sin: 's2' }, data, cr)
  if (!r.ok) throw new Error(r.reason)
  expect(r.ch.ledger.at(-1)).toMatchObject({ advance: { op: 'licensed', target: 'g1', sin: 's2', name: 'Licence (tools)' } })
  expect(currentBuild(r.ch).sins[1].licences).toEqual([{ name: 'Licence (tools)', rating: 1, item: 'g1' }])
  expect(balances(r.ch).nuyen).toBe(500)
  const v = voidEntry(r.ch, r.ch.ledger.at(-1)!.id, 'Oops')
  expect(v.ok && currentBuild(v.ch).sins[1].licences).toEqual([])
  expect(preview(ch, { op: 'licensed', target: 'g1', sin: 'gone' }, data, cr)).toEqual({ ok: false, reason: 'unknown-line' })
  // a fake SIN: one of its fake licences, rated as the SIN, rating × licencePerRating
  ch.build.sins[0].licences = []
  expect(preview(ch, { op: 'licensed', target: 'g1', sin: 's1' }, data, cr)).toMatchObject({
    label: 'Licence: Tangle Rope 1 on Pat Roe (fake licence, rating 3)',
    nuyen: 900,
  })
  const f = record(ch, { op: 'licensed', target: 'g1', sin: 's1' }, data, cr)
  if (!f.ok) throw new Error(f.reason)
  expect(currentBuild(f.ch).sins[0].licences).toEqual([{ name: 'Licence (tools)', rating: 3, item: 'g1' }])
  expect(balances(f.ch).nuyen).toBe(1000 - 900)
  // an item dropped after finalising keeps its licence on the SIN
  const d = record(f.ch, { op: 'drop', target: 'g1' }, data, cr)
  if (!d.ok) throw new Error(d.reason)
  expect(currentBuild(d.ch).sins[0].licences).toEqual([{ name: 'Licence (tools)', rating: 3, item: 'g1' }])
})

test('a file’s licence rated other than its SIN reads at the SIN’s rating (a real SIN’s at 1); ledger amounts stay as recorded', () => {
  const { ch } = licensable()
  ch.build.sins[0].licences = [{ name: 'Zap License', rating: 1 }]
  ch.build.sins[1].licences = [{ name: 'Hunting', rating: 4 }]
  Object.assign(ch, { finalizedAt: '2026-10-16T00:00:00Z', final: { karma: 0, nuyen: 1000 } })
  ch.ledger = [
    { id: 'f1', at: '2026-10-16T00:00:00Z', type: 'finalize', karma: 0, nuyen: 1000 },
    {
      id: 'a1',
      at: '2026-10-16T00:00:00Z',
      type: 'advance',
      advance: { op: 'sin', line: { uid: 's3', name: 'Pat Poe', kind: 'fake', rating: 2, licences: [{ name: 'Zap License', rating: 1 }] } },
      label: 'SIN',
      karma: 0,
      nuyen: 300,
    },
  ]
  const r = xmlToSr6(sr6ToXml(ch))
  if (!r.ok) throw new Error(r.reason)
  expect(r.character.build.sins.map(s => s.licences[0].rating)).toEqual([3, 1])
  expect(currentBuild(r.character).sins[2].licences).toEqual([{ name: 'Zap License', rating: 2 }])
  expect(balances(r.character).nuyen).toBe(700)
})

test('an older file’s item licences move onto the SINs they name; one naming none is left out with a note', () => {
  const { ch } = licensable()
  ch.build.purchases = [{ uid: 'g1', kind: 'gear', id: 'crb.tangle-rope.1', name: 'Tangle Rope', qty: 1, accessories: [] }]
  const xml = sr6ToXml(ch).replace(/(<purchase [^>]*?)(\/?>)/, '$1 ATTR$2')
  const old = (attr: string, x = xml) => {
    const fix: string[] = []
    const r = xmlToSr6(x.replace('ATTR', attr), { repair: fix })
    if (!r.ok) throw new Error(r.reason)
    return { sins: r.character.build.sins.map(s => s.licences), fix }
  }
  // (the fake SIN's rated as the SIN; the real SIN's, at the fee)
  expect(old('licensedOn="s1 s2"')).toEqual({
    sins: [[{ name: 'Tangle Rope', rating: 3, item: 'g1' }], [{ name: 'Tangle Rope', rating: 1, item: 'g1' }]],
    fix: [],
  })
  expect(old('licensedOn="gone"')).toEqual({
    sins: [[], []],
    fix: ['Tangle Rope: its licence names no SIN of the runner, so it’s left out (licence it on a SIN on Contacts).'],
  })
  // older still: bought, the first SIN; unlicensed, none; bought with no SIN, left out
  expect(old('licence="bought"').sins).toEqual([[{ name: 'Tangle Rope', rating: 3, item: 'g1' }], []])
  expect(old('licence="unlicensed"')).toEqual({ sins: [[], []], fix: [] })
  expect(old('licence="bought"', xml.replace(/<sin [\s\S]*?<\/sin>|<sin [^>]*\/>/g, '')).fix).toHaveLength(1)
})
