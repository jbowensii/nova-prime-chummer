// Machine conditions (owner, 2026-10-29: calculated, not notes): `attr:str>=6` is decided from the runner; prose
// (`in animal form`) stays a situation, counted only in the bracketed (switched-on) total. Made-up fixture.
import { expect, test } from 'vitest'
import type { Bonus } from '../../../src/sr6/formats/domain/character'
import { augmentBonus } from '../../../src/sr6/runner-builder/domain/creation/budgets'
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
