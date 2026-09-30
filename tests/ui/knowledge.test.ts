import { expect, test } from 'vitest'
import { blankCharacter } from '../../src/engine/file'
import { lapseWarning } from '../../src/ui/tabs/Skills'
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
