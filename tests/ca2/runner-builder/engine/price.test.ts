import { test, expect } from 'vitest'
import { attrCost, packageGuide, skillCost } from '../../../../src/ca2/runner-builder/domain/price'
import { cat } from '../../../helpers'

const P = cat.pricing

// made-up prices (tests/fixtures/mini/custom/imported/core/pricing.xml): 12,000 a point, 24,000 the last; skills 3,000 to 4, then 6,000
test('attribute last point surcharge', () => {
  expect(attrCost(P, 0, 2, 4)).toBe(24000)
  expect(attrCost(P, 0, 4, 4)).toBe(60000) // 3 x 12,000 + 24,000
  expect(attrCost(P, 0, 4, 5)).toBe(48000) // 4 isn't the max here
})

test('skill breakpoint after skillLowMax', () => {
  expect(skillCost(P, 0, 2)).toBe(6000)
  expect(skillCost(P, 4, 6)).toBe(12000)
})

test.each(['ganger', 'runner', 'prime'].flatMap(l => ['balanced', 'magician', 'fighter'].map(a => `${l}-${a}`)))('%s package totals its level budget', id => {
  const g = packageGuide(cat, id)!
  const level = cat.levels.get(cat.packages.get(id)!.level)!
  expect(g.attributes + g.skills + g.amps + g.gear + g.spells).toBe(level.nuyen)
})
