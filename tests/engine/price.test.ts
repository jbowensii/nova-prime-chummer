import { test, expect } from 'vitest'
import { attrCost, packageGuide, price, skillCost } from '../../src/engine/price'
import { cat, sample } from '../helpers'

const P = cat.pricing

test('attribute last point surcharge', () => {
  expect(attrCost(P, 0, 2, 4)).toBe(20000)
  expect(attrCost(P, 0, 4, 4)).toBe(50000) // 3 x 10,000 + 20,000
  expect(attrCost(P, 0, 4, 5)).toBe(40000) // elf CHA 4 is not the max
})

test('skill breakpoint at rating 5 (CRB p.83 examples)', () => {
  expect(skillCost(P, 0, 2)).toBe(5000)
  expect(skillCost(P, 4, 6)).toBe(7500)
})

test.each(['ganger', 'runner', 'prime'].flatMap(l => ['balanced', 'magician', 'fighter'].map(a => `${l}-${a}`)))(
  '%s package totals its level budget', id => {
    const g = packageGuide(cat, id)!
    const level = cat.levels.get(cat.packages.get(id)!.level)!
    expect(g.attributes + g.skills + g.amps + g.gear + g.spells).toBe(level.nuyen)
  })

test('Lightning prices to exactly 375,000 (CRB p.85)', () => {
  const b = price(cat, sample('lightning'))
  expect(b).toMatchObject({ attributes: 150000, skills: 90000, amps: 85000, gear: 15000, spells: 35000 })
  expect(b.total).toBe(375000)
  expect(b.remaining).toBe(0)
})
