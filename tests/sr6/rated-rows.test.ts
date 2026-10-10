// A line's per-rating effects (`R`) count at its rating: its own, else its entry's (one row of a book's per-rating split,
// `Zap Wires 3`, carries rating 3), never a blanket 1. Invented entries, invented numbers.
import { expect, test } from 'vitest'
import { apply } from '../../src/sr6/engine/actions'
import { augmentBonus, bonusSources, hostBonus } from '../../src/sr6/engine/budgets'
import { sr6Data } from '../../src/sr6/engine/data'
import { blankBuild } from '../../src/sr6/model/character'
import { fixtureCatalog, fixtureCreation } from './fixture'

const NS = 'xmlns:sr6="urn:chummer-sr6:data:1"'
const fx = '<effect target="attr:rea" op="add" value="R"/><effect target="derived:initiative-dice" op="add" value="R"/>'
const AUG = `<sr6:data ${NS} kind="augmentations" version="1">
  <augmentation id="zz.zap-wires-1" source="ZZ" page="1" type="cyberware" category="Bodyware" rating="1" essence="1" avail="2" cost="100"><name>Zap Wires 1</name>${fx}</augmentation>
  <augmentation id="zz.zap-wires-3" source="ZZ" page="1" type="cyberware" category="Bodyware" rating="3" essence="3" avail="6" cost="900"><name>Zap Wires 3</name>${fx}</augmentation>
  <augmentation id="zz.zap-ranged" source="ZZ" page="1" type="cyberware" category="Bodyware" rating="1-4" essence="Rating" avail="2" cost="Rating x 100"><name>Zap Ranged</name>${fx}</augmentation>
  <augmentation id="zz.zap-unrated" source="ZZ" page="1" type="cyberware" category="Bodyware" essence="1" avail="2" cost="100"><name>Zap Unrated</name>${fx}</augmentation>
</sr6:data>`
const world = () => {
  const data = sr6Data(fixtureCatalog(undefined, [{ file: 'custom/sr6/imported/zz/augmentations.xml', xml: AUG }]))
  return { data, cr: fixtureCreation() }
}
const bought = (id: string, rating?: number) => {
  const { data, cr } = world(), b = blankBuild('priority')
  expect(apply(b, { op: 'purchase', kind: 'augmentations', id, ...(rating ? { rating } : {}) }, data, cr)).toEqual({ ok: true })
  return { b, data }
}

test('one row of a per-rating split counts its own rating, bought the way the picker buys it (no rating chosen)', () => {
  const { b, data } = bought('zz.zap-wires-3')
  expect(b.purchases[0].rating).toBeUndefined()
  expect(augmentBonus(b, data, 'rea')).toBe(3)
  expect(augmentBonus(b, data, 'initDice')).toBe(3)
  expect(bonusSources(b, data, 'rea')).toEqual([expect.objectContaining({ value: 3 })])
  expect(augmentBonus(bought('zz.zap-wires-1').b, data, 'rea')).toBe(1)
})

test('a ranged entry counts the rating chosen; an entry with no rating at all counts R as 1', () => {
  expect(augmentBonus(bought('zz.zap-ranged', 4).b, world().data, 'rea')).toBe(4)
  expect(augmentBonus(bought('zz.zap-unrated').b, world().data, 'rea')).toBe(1)
})

test("an accessory with no rating of its own counts its entry's", () => {
  const { b, data } = bought('zz.zap-ranged', 2)
  b.purchases[0].accessories.push({ uid: 'a1', kind: 'augmentations', id: 'zz.zap-wires-3', qty: 1, accessories: [] })
  expect(hostBonus(b.purchases[0], data).rea).toBe(3)
})
