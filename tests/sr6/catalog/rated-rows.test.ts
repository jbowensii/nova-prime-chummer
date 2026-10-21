// A line's per-rating effects (`R`) count at its rating: its own, else its entry's (one row of a book's per-rating split,
// `Zap Wires 3`, carries rating 3), never a blanket 1. Invented entries, invented numbers.
import { expect, test } from 'vitest'
import { apply } from '../../../src/sr6/runner-builder/domain/creation/actions'
import { augmentBonus, bonusSources, hostBonus, priced } from '../../../src/sr6/runner-builder/domain/creation/budgets'
import { sr6Data } from '../../../src/sr6/catalog/domain/data'
import { chosenRating } from '../../../src/sr6/catalog/domain/values'
import { blankBuild } from '../../../src/sr6/formats/domain/character'
import { fixtureCatalog, fixtureCreation } from './fixture'

const NS = 'xmlns:sr6="urn:chummer-sr6:data:1"'
const fx = '<effect target="attr:rea" op="add" value="R"/><effect target="derived:initiative-dice" op="add" value="R"/>'
const AUG = `<sr6:data ${NS} kind="augmentations" version="1">
  <augmentation id="zz.zap-wires-1" source="ZZ" page="1" type="cyberware" category="Bodyware" rating="1" essence="1" avail="2" cost="100"><name>Zap Wires 1</name>${fx}</augmentation>
  <augmentation id="zz.zap-wires-3" source="ZZ" page="1" type="cyberware" category="Bodyware" rating="3" essence="3" avail="6" cost="900"><name>Zap Wires 3</name>${fx}</augmentation>
  <augmentation id="zz.zap-ranged" source="ZZ" page="1" type="cyberware" category="Bodyware" rating="1-4" essence="Rating" avail="2" cost="Rating x 100"><name>Zap Ranged</name>${fx}</augmentation>
  <augmentation id="zz.zap-plate" source="ZZ" page="1" type="cyberware" category="Zaplimb accessory" capacity="[Rating]" avail="2" cost="Rating x 5000"><name>Armor</name><formula field="cost">R*5000</formula><effect target="derived:defense" op="add" value="R"/></augmentation>
  <augmentation id="zz.zap-unrated" source="ZZ" page="1" type="cyberware" category="Bodyware" essence="1" avail="2" cost="100"><name>Zap Unrated</name>${fx}</augmentation>
</sr6:data>`
const world = () => {
  const data = sr6Data(fixtureCatalog(undefined, [{ file: 'custom/sr6/imported/zz/augmentations.xml', xml: AUG }]))
  return { data, cr: fixtureCreation() }
}
const bought = (id: string, rating?: number) => {
  const { data, cr } = world(),
    b = blankBuild('priority')
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

// an entry priced per rating with no range printed (a focus's Force, a cyberlimb add-on's [Rating]): the player picks it
const GEAR = `<sr6:data ${NS} kind="gear" version="1">
  <gear id="zz.zap-focus" source="ZZ" page="2" category="Foci" karma="Force x 2" avail="(Force) L" cost="Force x 4000"><name>Zap focus</name><formula field="cost">R*4000</formula><effect target="attr:log" op="add" value="R"/></gear>
  <gear id="zz.zap-charm" source="ZZ" page="2" category="Charms" avail="2" cost="50"><name>Zap charm</name></gear>
</sr6:data>`
const gearWorld = () => ({ data: sr6Data(fixtureCatalog(undefined, [{ file: 'custom/sr6/imported/zz/gear.xml', xml: GEAR }])), cr: fixtureCreation() })

test('a focus is bought at the Force the player picks, and its effects and price follow it', () => {
  const { data, cr } = gearWorld(),
    b = blankBuild('priority')
  expect(chosenRating(data.entry('gear', 'zz.zap-focus'))).toBe('Force')
  expect(chosenRating(data.entry('gear', 'zz.zap-charm'))).toBeUndefined()
  expect(apply(b, { op: 'purchase', kind: 'gear', id: 'zz.zap-focus', rating: 3 }, data, cr)).toEqual({ ok: true })
  expect(augmentBonus(b, data, 'log')).toBe(3)
  expect(priced(b.purchases[0], data, cr).cost).toBe(12000)
  const uid = b.purchases[0].uid
  expect(apply(b, { op: 'rate', uid, rating: 5 }, data, cr)).toEqual({ ok: true })
  expect(augmentBonus(b, data, 'log')).toBe(5)
  expect(apply(b, { op: 'rate', uid, rating: 0 }, data, cr)).toMatchObject({ ok: false, reason: 'rating-range' })
  expect(apply(b, { op: 'purchase', kind: 'gear', id: 'zz.zap-focus', rating: 1.5 }, data, cr)).toMatchObject({ ok: false, reason: 'rating-range' })
})

test("a cyberlimb add-on rated by the player raises its host's stat by that rating", () => {
  const { data, cr } = world(),
    b = blankBuild('priority')
  expect(apply(b, { op: 'purchase', kind: 'augmentations', id: 'zz.zap-ranged', rating: 1 }, data, cr)).toEqual({ ok: true })
  expect(apply(b, { op: 'accessory', host: b.purchases[0].uid, kind: 'augmentations', id: 'zz.zap-plate', rating: 3 }, data, cr)).toEqual({ ok: true })
  expect(hostBonus(b.purchases[0], data).defense).toBe(3)
})
