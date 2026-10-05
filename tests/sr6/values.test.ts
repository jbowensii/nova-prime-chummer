// Book values as the catalog keeps them (strings as printed) read as numbers (src/sr6/engine/values.ts). Made-up strings.
import { expect, test } from 'vitest'
import { attackRatings, formula, legality, rated, ratingRange } from '../../src/sr6/engine/values'

test('rated reads plain numbers, Rating formulas and add-ons; avail suffixes are ignored', () => {
  expect(rated('350')).toEqual({ n: 350, ok: true })
  expect(rated('0.25')).toEqual({ n: 0.25, ok: true })
  expect(rated('Rating', 4)).toEqual({ n: 4, ok: true })
  expect(rated('Rating × 500', 3)).toEqual({ n: 1500, ok: true })
  expect(rated('500 × Rating', 3)).toEqual({ n: 1500, ok: true })
  expect(rated('Rating x 0.1', 3).n).toBeCloseTo(0.3)
  expect(rated('Rating x .3', 2).n).toBeCloseTo(0.6) // the book drops the leading 0
  expect(rated('Rating * 7', 2)).toEqual({ n: 14, ok: true })
  expect(rated('(Rating × 2) + 1', 2)).toEqual({ n: 5, ok: true })
  expect(rated('Rating + 3', 2)).toEqual({ n: 5, ok: true })
  expect(rated('+2')).toEqual({ n: 2, ok: true })
  expect(rated('5(L)')).toEqual({ n: 5, ok: true })
  expect(rated('Rating (F)', 3)).toEqual({ n: 3, ok: true })
  expect(rated('7I')).toEqual({ n: 7, ok: true })
  expect(rated('Rating × 150')).toEqual({ n: 150, ok: true })
})

test('rated: Capacity, Force and Level are the rating, any case; / rounds up; ^ is a power', () => {
  expect(rated('Capacity x 70', 3)).toEqual({ n: 210, ok: true })
  expect(rated('Force x 1500', 2)).toEqual({ n: 3000, ok: true })
  expect(rated('(Force +2) L', 4)).toEqual({ n: 6, ok: true })
  expect(rated('20 + (rating x 5)', 3)).toEqual({ n: 35, ok: true })
  expect(rated('(Rating/3)(L)', 7)).toEqual({ n: 3, ok: true })
  expect(rated('Rating^2 x 100', 3)).toEqual({ n: 900, ok: true })
  expect(rated('(Rating x Rating) x 10', 4)).toEqual({ n: 160, ok: true })
  expect(rated('+1(I)')).toEqual({ n: 1, ok: true })
  for (const s of ['900 + Gizmo', '5/7', 'Rating^', 'Level x']) expect(rated(s, 2), s).toEqual({ n: null, ok: false })
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

test('a value too long to be a printed one is unreadable at once (no quadratic backtracking on a crafted snapshot)', () => {
  const huge = ' '.repeat(200000) + 'x'
  const t = Date.now()
  expect(rated(huge)).toEqual({ n: null, ok: false })
  expect(legality(huge)).toBeUndefined()
  expect(attackRatings(huge)).toEqual({ bands: [null, null, null, null, null], ok: false })
  expect(Date.now() - t).toBeLessThan(200)
})

test('formula reads F and L stats at a rating: × and / first, division rounds up, a trailing dice term kept', () => {
  expect(formula('F × 2 + 2D6', 4, 'F')).toEqual({ n: 8, dice: '2D6', ok: true })
  expect(formula('8 + F/2', 3, 'F')).toEqual({ n: 10, ok: true })
  expect(formula('F+1', 4, 'F')).toEqual({ n: 5, ok: true })
  expect(formula('F-1', 4, 'F')).toEqual({ n: 3, ok: true })
  expect(formula('(L × 2) + 1', 3, 'L')).toEqual({ n: 7, ok: true })
  expect(formula('6 + 1D6', 3, 'F')).toEqual({ n: 6, dice: '1D6', ok: true })
  expect(formula('Rating x 3', 2, 'L')).toEqual({ n: 6, ok: true })
  expect(formula('2 + F * 3 - 1', 2, 'F')).toEqual({ n: 7, ok: true })
  expect(formula('F/0', 2, 'F')).toEqual({ n: null, ok: false })
})

test('formula: an en dash is a minus, square brackets are parentheses', () => {
  expect(formula('F–3', 5, 'F')).toEqual({ n: 2, ok: true })
  expect(formula('F – 1', 5, 'F')).toEqual({ n: 4, ok: true })
  expect(formula('[(F x 3) + 1] + 2D6', 2, 'F')).toEqual({ n: 7, dice: '2D6', ok: true })
  expect(formula('(F/2)+7', 5, 'F')).toEqual({ n: 10, ok: true })
  expect(formula('L–2', 4, 'L')).toEqual({ n: 2, ok: true })
})

test('formula: a dash or nothing is no value; anything else unreadable, never NaN', () => {
  for (const s of ['—', '', undefined]) expect(formula(s, 4, 'F'), String(s)).toEqual({ n: null, ok: true })
  for (const s of ['F+?', 'L + 1', 'F +', '(F × 2', '2D6', 'lots', ' '.repeat(200) + 'F']) expect(formula(s, 4, 'F'), s).toEqual({ n: null, ok: false })
})
