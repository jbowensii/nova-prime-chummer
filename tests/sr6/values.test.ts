// Book values as the catalog keeps them (strings as printed) read as numbers (src/sr6/engine/values.ts). Made-up strings.
import { expect, test } from 'vitest'
import { attackRatings, legality, rated, ratingRange } from '../../src/sr6/engine/values'

test('rated reads plain numbers, Rating formulas and add-ons; avail suffixes are ignored', () => {
  expect(rated('350')).toEqual({ n: 350, ok: true })
  expect(rated('0.25')).toEqual({ n: 0.25, ok: true })
  expect(rated('Rating', 4)).toEqual({ n: 4, ok: true })
  expect(rated('Rating × 500', 3)).toEqual({ n: 1500, ok: true })
  expect(rated('500 × Rating', 3)).toEqual({ n: 1500, ok: true })
  expect(rated('Rating x 0.1', 3).n).toBeCloseTo(0.3)
  expect(rated('Rating * 7', 2)).toEqual({ n: 14, ok: true })
  expect(rated('(Rating × 2) + 1', 2)).toEqual({ n: 5, ok: true })
  expect(rated('Rating + 3', 2)).toEqual({ n: 5, ok: true })
  expect(rated('+2')).toEqual({ n: 2, ok: true })
  expect(rated('5(L)')).toEqual({ n: 5, ok: true })
  expect(rated('Rating (F)', 3)).toEqual({ n: 3, ok: true })
  expect(rated('7I')).toEqual({ n: 7, ok: true })
  expect(rated('Rating × 150')).toEqual({ n: 150, ok: true })
})

test('a dash or nothing is no value; anything else is unreadable, never NaN', () => {
  for (const s of ['—', '-', '', '  ', undefined]) expect(rated(s), String(s)).toEqual({ n: null, ok: true })
  for (const s of ['12x', 'Rating × ?', '9/x', 'lots', '3 +', '(Rating × 2', 'x']) expect(rated(s, 2), s).toEqual({ n: null, ok: false })
})

test('legality reads the avail suffix', () => {
  expect(legality('5(L)')).toBe('L')
  expect(legality('Rating (F)')).toBe('F')
  expect(legality('7I')).toBe('I')
  expect(legality('3')).toBeUndefined()
  expect(legality(undefined)).toBeUndefined()
})

test('ratingRange lists the ratings an item comes in', () => {
  expect(ratingRange('1–4')).toEqual([1, 2, 3, 4])
  expect(ratingRange('2-3')).toEqual([2, 3])
  expect(ratingRange('6')).toEqual([6])
  for (const s of ['—', '-', '', undefined, 'any']) expect(ratingRange(s), String(s)).toEqual([])
})

test('attackRatings gives five bands, a dash as none; a bad band is none and not ok', () => {
  expect(attackRatings('9/7/—/—/—')).toEqual({ bands: [9, 7, null, null, null], ok: true })
  expect(attackRatings('4/10/8/—/—')).toEqual({ bands: [4, 10, 8, null, null], ok: true })
  expect(attackRatings('9/x/—/—/—')).toEqual({ bands: [9, null, null, null, null], ok: false })
  expect(attackRatings('5')).toEqual({ bands: [5, null, null, null, null], ok: true })
  expect(attackRatings(undefined)).toEqual({ bands: [null, null, null, null, null], ok: true })
})
