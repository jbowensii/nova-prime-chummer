// Machine conditions (owner, 2026-10-29: calculated, not notes): `attr:str>=6` is decided from the runner; prose
// (`in animal form`) stays a situation, counted only in the bracketed (switched-on) total. Made-up fixture.
import { expect, test } from 'vitest'
import type { Bonus } from '../../../src/sr6/formats/domain/character'
import { augmentBonus, situations } from '../../../src/sr6/runner-builder/domain/creation/budgets'
import { apply } from '../../../src/sr6/runner-builder/domain/creation/actions'
import { buildOf, GLIM, made } from './fixture'

const withBonus = (bonus: Bonus, str: number) => {
  const b = buildOf('priority', { letters: 'CABDA', metatype: GLIM })
  b.attributes.str = { points: str - 1, adjust: 0, karma: 0 }
  b.purchases.push({ uid: 'h1', kind: 'augmentations', name: 'Horns', qty: 1, accessories: [], bonuses: [bonus] })
  return b
}

test('Horns: +2 unarmed AR when Strength is 6 or greater, none below, never a note', () => {
  const { data } = made()
  const horns: Bonus = { target: 'unarmedAR', value: 2, switch: 'conditional', when: 'attr:str>=6' }
  expect(augmentBonus(withBonus(horns, 6), data, 'unarmedAR')).toBe(2)
  expect(augmentBonus(withBonus(horns, 5), data, 'unarmedAR')).toBe(0)
  expect(augmentBonus(withBonus(horns, 5), data, 'unarmedAR', undefined, true)).toBe(0)
})

test('a situational condition is a toggle: off in the plain total, on in the switched-on total', () => {
  const { data } = made()
  const might: Bonus = { target: 'str', value: 1, switch: 'conditional', when: 'animal form' }
  const b = withBonus(might, 3)
  expect(augmentBonus(b, data, 'str')).toBe(0)
  expect(augmentBonus(b, data, 'str', undefined, true)).toBe(1)
})

test('a situational switch turned on counts in the plain total; a per-... one is counted as many times as given', () => {
  const { data } = made()
  const might: Bonus = { target: 'str', value: 1, switch: 'conditional', when: 'animal form' }
  const barrels: Bonus = { target: 'str', value: 2, switch: 'conditional', when: 'per additional barrel' }
  const b = withBonus(might, 3)
  b.purchases[0].bonuses = [might, barrels]
  expect(augmentBonus(b, data, 'str')).toBe(0)
  b.purchases[0].sit = { '0': 1 }
  expect(augmentBonus(b, data, 'str')).toBe(1)
  expect(augmentBonus(b, data, 'str', undefined, true)).toBe(1 + 2) // (the bracket still holds the one left off)
  b.purchases[0].sit = { '0': 1, '1': 3 }
  expect(augmentBonus(b, data, 'str')).toBe(1 + 6)
  b.purchases[0].sit = { '0': 5 } // (a plain switch ignores a count)
  expect(augmentBonus(b, data, 'str')).toBe(1)
})

test('the situational action sets and clears a line’s switch, clamping the count', () => {
  const { data, cr } = made()
  const b = withBonus({ target: 'str', value: 1, switch: 'conditional', when: 'animal form' }, 3)
  expect(situations(b, data, b.purchases[0].bonuses!).map(s => s.i)).toEqual([0])
  expect(apply(b, { op: 'situational', uid: 'h1', index: 0, times: 1 }, data, cr)).toEqual({ ok: true })
  expect(b.purchases[0].sit).toEqual({ '0': 1 })
  apply(b, { op: 'situational', uid: 'h1', index: 0, times: 500 }, data, cr)
  expect(b.purchases[0].sit).toEqual({ '0': 99 })
  apply(b, { op: 'situational', uid: 'h1', index: 0, times: 0 }, data, cr)
  expect(b.purchases[0].sit).toBeUndefined()
  expect(apply(b, { op: 'situational', uid: 'nope', index: 0, times: 1 }, data, cr)).toMatchObject({ ok: false })
})
