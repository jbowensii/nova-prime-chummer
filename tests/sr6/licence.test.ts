// Licensed availability (owner 2026-10-15): a nuyen price under AVAIL is a licence fee, listed and flagged with a heads-up,
// never enforced: the item is bought, priced and counted like any other (licences are for the GM). All names made up.
import { expect, test } from 'vitest'
import { apply } from '../../src/sr6/engine/actions'
import { priced } from '../../src/sr6/engine/purchases'
import { allBudgets } from '../../src/sr6/engine/budgets'
import { makeProvider } from '../../src/sr6/engine/providers'
import { availNote } from '../../src/sr6/engine/values'
import { priceAt } from '../../src/sr6/ui/Picker'
import { blankSr6 } from '../../src/sr6/model/character'
import { buildOf, GLIM, made } from './fixture'

test('a pure licence fee is listed in words and earns a warning; a rating plus a fee shows both', () => {
  expect(availNote('15,000¥')).toEqual({
    text: 'available with licence (fee 15,000¥)',
    warn: 'Needs a licence (fee 15,000¥) — or carry it unlicensed; settle it with your GM.',
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

test('a licence bought is listed as licensed with no warning; carried unlicensed, the warning says so', () => {
  expect(availNote('2(L), 500¥', 1, 'bought')).toEqual({ text: '2(L), licence fee 500¥ · licensed' })
  expect(availNote('2(L), 500¥', 1, 'unlicensed')).toEqual({
    text: '2(L), licence fee 500¥',
    warn: 'Carried without a licence (fee 500¥ not paid); settle it with your GM.',
  })
  // (no fee printed: the choice changes nothing)
  expect(availNote('6(L)', 1, 'bought')).toEqual(availNote('6(L)'))
})

test('the licence toggle: bought adds the fee once a line, unlicensed and not chosen add nothing, and it can be taken back', () => {
  const { data, cr } = made({
    data: d => {
      d.entry('gear', 'crb.tangle-rope.1')!.attrs.avail = '2, 500¥'
    },
  })
  const ch = blankSr6('priority', 'r1', '2026-10-03T00:00:00Z')
  ch.build = buildOf('priority', { letters: 'CABDA', metatype: GLIM, magic: 'mundane' })
  const b = ch.build
  expect(apply(b, { op: 'purchase', kind: 'gear', id: 'crb.tangle-rope.1', qty: 2 }, data, cr)).toEqual({ ok: true })
  const x = b.purchases[0],
    base = priced(x, data, cr).cost
  expect(apply(b, { op: 'licensed', uid: x.uid, licence: 'bought' }, data, cr)).toEqual({ ok: true })
  expect(priced(x, data, cr)).toMatchObject({ cost: base + 500, licence: 500 })
  expect(allBudgets(b, data, cr, makeProvider(b.method, data, cr)).nuyen.breakdown?.find(l => l.key === `purchase:${x.uid}`)?.label).toMatch(
    /with its licence$/,
  )
  expect(apply(b, { op: 'licensed', uid: x.uid, licence: 'unlicensed' }, data, cr)).toEqual({ ok: true })
  expect(priced(x, data, cr).cost).toBe(base)
  expect(apply(b, { op: 'licensed', uid: x.uid, licence: null }, data, cr)).toEqual({ ok: true })
  expect(x.licence).toBeUndefined()
  // (an item printing no fee has no licence to choose; an unknown line is refused)
  data.entry('gear', 'crb.tangle-rope.1')!.attrs.avail = '2'
  expect(apply(b, { op: 'licensed', uid: x.uid, licence: 'bought' }, data, cr)).toEqual({ ok: false, reason: 'no-licence' })
  expect(apply(b, { op: 'licensed', uid: 'gone', licence: null }, data, cr)).toEqual({ ok: false, reason: 'unknown-line' })
})
