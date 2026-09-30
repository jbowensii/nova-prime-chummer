import { expect, test } from 'vitest'
import { blankCharacter } from '../../src/engine/file'
import { lapseWarning, reorderKeys, toggleKey } from '../../src/ui/tabs/Skills'
import { cat } from '../helpers'

test('lowering a skill below 4 asks first only when a renamed entry would become paid', () => {
  const b = blankCharacter().build
  b.skills = [{ id: 'electronics', rating: 4, specs: [] }]
  expect(lapseWarning(cat, b, 'electronics', 3)).toBeNull() // no stored entry: the free slot just goes
  b.knowledge = [{ name: 'Electronics', kind: 'language', from: 'skill:electronics' }]
  expect(lapseWarning(cat, b, 'electronics', 3)).toBeNull() // still named after the skill: goes too
  b.knowledge = [{ name: 'Gadget blogs', kind: 'knowledge', from: 'skill:electronics' }]
  expect(lapseWarning(cat, b, 'electronics', 5)).toBeNull()
  expect(lapseWarning(cat, b, 'electronics', 3)).toMatch(/“Gadget blogs” is no longer free: it becomes a paid knowledge skill/)
  b.skills[0].rating = 3
  expect(lapseWarning(cat, b, 'electronics', 2)).toBeNull() // already paid
})

test('reordering one list keeps the other list’s order; Sort A–Z drops only its own keys', () => {
  const lang = ['language:B', 'language:A', 'keyword:C']
  let order = reorderKeys(['knowledge:X', 'knowledge:Y'], lang, 'language:A', 0)
  expect(order).toEqual(['knowledge:X', 'knowledge:Y', 'language:A', 'language:B', 'keyword:C'])
  order = reorderKeys(order, ['language:A', 'language:B', 'keyword:C'], 'language:A', 2) // dragged to the bottom
  expect(order).toEqual(['knowledge:X', 'knowledge:Y', 'language:B', 'keyword:C', 'language:A'])
  expect(reorderKeys(order, ['language:B', 'keyword:C', 'language:A'])).toEqual(['knowledge:X', 'knowledge:Y'])
  expect(reorderKeys(['language:A'], ['language:A'])).toBeUndefined()
})

test('hide and show toggle a key; the list goes away once empty', () => {
  expect(toggleKey(undefined, 'skill:electronics')).toEqual(['skill:electronics'])
  expect(toggleKey(['skill:electronics', 'x'], 'skill:electronics')).toEqual(['x'])
  expect(toggleKey(['x'], 'x')).toBeUndefined()
})
