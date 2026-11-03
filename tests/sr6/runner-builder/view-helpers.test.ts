// Small sheet-wording helpers: spell and metamagic flags, bracketed totals, licences in words, and the skills list.
import { expect, test } from 'vitest'
import {
  allSkills,
  attrShown,
  band,
  br,
  effectNotes,
  licenceItem,
  licenceRatingText,
  licenceText,
  pickFlags,
  poolOn,
} from '../../../src/sr6/runner-builder/ui/view'
import { sr6Data } from '../../../src/sr6/catalog/domain/data'
import type { Sr6Entry } from '../../../src/sr6/formats/domain/types'
import type { Sr6Derived } from '../../../src/sr6/runner-builder/domain/creation/derive'
import { fixtureCatalog, buildOf, GLIM } from '../catalog/fixture'

const data = sr6Data(fixtureCatalog())
const e = (kind: string, attrs: Record<string, string>) => ({ kind, attrs }) as unknown as Sr6Entry

test('a spell says opposed and essence; a metamagic says who may take it and whether it stacks; anything else says nothing', () => {
  expect(pickFlags(e('spells', { opposed: 'true', essence: 'true' }))).toEqual(['Opposed', 'Essence threshold'])
  expect(pickFlags(e('spells', {}))).toEqual([])
  expect(pickFlags(e('metamagics', { user: 'adept', perLevel: 'true', maxLevel: '3' }))).toEqual(['Adepts only', 'Taken again (up to 3)'])
  expect(pickFlags(e('metamagics', { user: 'magician', perLevel: 'true' }))).toEqual(['Magicians only', 'Taken again'])
  expect(pickFlags(e('echoes', { user: 'adept' }))).toEqual([])
})

test('a value shows its bracketed total only when the total differs', () => {
  expect([band(null), band(4)]).toEqual(['—', '4'])
  expect([br(6, 9), br(6, 6), br(6), br(null, 3), br(6, null), br(undefined, 2)]).toEqual(['6 (9)', 6, 6, null, 6, undefined])
})

test('an attribute shows its augmented value and the switched-on one in brackets; a pool is found by skill', () => {
  const d = { attrs: { bod: { augmented: 5 } }, on: { attrs: { bod: { augmented: 7 } }, pools: [{ skill: 'x', rank: 1 }] } } as unknown as Sr6Derived
  expect(attrShown(d, 'bod')).toBe('5 (7)')
  expect(poolOn(d, 'x')).toMatchObject({ rank: 1 })
  expect(poolOn(d, 'y')).toBeUndefined()
})

test('every catalog skill is listed A to Z, the runner’s own at their rank and the rest at rank 0', () => {
  const some = Object.values(data.skills)[0]
  const d = { pools: [{ skill: some.id, label: some.name, rank: 3, attr: some.attr }] } as unknown as Sr6Derived
  const list = allSkills(d, data)
  expect(list.find(x => x.skill === some.id)!.rank).toBe(3)
  expect(list.filter(x => x.rank === 0).length).toBe(Object.keys(data.skills).length - 1)
  expect(list.map(x => x.label)).toEqual([...list.map(x => x.label)].sort((a, b) => a.localeCompare(b)))
})

test('a licence reads as its name and rating, with the item it is for; a real SIN’s item licence prints no rating', () => {
  const b = buildOf('priority', { letters: 'CABDA', metatype: GLIM })
  b.purchases.push(
    { uid: 'p1', kind: 'weapons', id: 'crb.zap-gun', qty: 1, accessories: [] },
    { uid: 'p2', kind: 'gear', name: 'Mystery', qty: 1, accessories: [] },
  )
  const fake = { uid: 's1', name: 'F', kind: 'fake' as const, licences: [] }
  const real = { ...fake, uid: 's2', kind: 'real' as const }
  expect(licenceItem(b, data, { name: 'Firearm', rating: 2 })).toBeUndefined()
  expect(licenceItem(b, data, { name: 'Firearm', rating: 2, item: 'gone' })).toBeUndefined()
  expect(licenceItem(b, data, { name: 'Firearm', rating: 2, item: 'p1' })).toContain('Zap Gun')
  expect(licenceItem(b, data, { name: 'x', rating: 1, item: 'p2' })).toBe('Mystery')
  expect(licenceRatingText(fake, { name: 'Firearm', rating: 2, item: 'p1' })).toBe(' 2')
  expect(licenceRatingText(real, { name: 'Firearm', rating: 2, item: 'p1' })).toBe('')
  expect(licenceText(b, data, fake, { name: 'Zap License', rating: 2 })).toBe('Zap License 2')
  expect(licenceText(b, data, real, { name: 'Firearm license', rating: 2, item: 'p1' })).toMatch(/^Firearm license \(.*Zap Gun.*\)$/)
})

test('a runner with nothing on them has no effect notes', () => {
  expect(effectNotes(buildOf('priority', { letters: 'CABDA', metatype: GLIM }), data)).toEqual([])
})
