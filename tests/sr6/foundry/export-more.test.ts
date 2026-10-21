// SR6 export values and parts (src/sr6/foundry/domain/export.ts) read off hand-made entries: damage, stun, attack ratings, modes,
// ammunition, a vehicle's numbers, the effects, links and tests an entry exports, aliases of old ids, and the augmentation
// type a Foundry module knows. Invented entries.
import { expect, test } from 'vitest'
import { entryValues, exportAttrs, exportSr6Books } from '../../../src/sr6/foundry/domain/export'
import { sr6Data } from '../../../src/sr6/catalog/domain/data'
import type { Sr6Entry, Sr6Kind, Sr6Part } from '../../../src/sr6/formats/domain/types'
import { fixtureCatalog } from '../catalog/fixture'

const entry = (kind: Sr6Kind, attrs: Record<string, string>, parts: Sr6Part[] = []): Sr6Entry => ({
  id: `x.${kind}`,
  kind,
  name: 'Odd',
  source: 'CRB',
  page: 1,
  attrs,
  parts,
  text: '',
})

test('damage reads as a number and stun; a long or oddly written one is none; a spell’s damage code is its drain, not damage', () => {
  expect(entryValues(entry('weapons', { dv: '5P' }))).toMatchObject({ dv: 5, stun: false })
  expect(entryValues(entry('weapons', { dv: '3S' }))).toMatchObject({ dv: 3, stun: true })
  expect(entryValues(entry('weapons', { dv: 'STR+2' })).dv).toBeUndefined()
  expect(entryValues(entry('weapons', { dv: `5P ${'x'.repeat(50)}` })).dv).toBeUndefined()
  const spell = entryValues(entry('spells', { dv: '4' }, []), 2)
  expect(spell.dv).toBeUndefined()
  expect(spell.drain).toBe(4)
})

test('attack ratings, modes and ammunition are read; unreadable ones leave nothing', () => {
  const v = entryValues(entry('weapons', { ar: '9/7/—/—/—', modes: 'SS/BF, FA zz', ammo: '8(c)' }))
  expect(v.ar).toBeDefined()
  expect(v.modes).toEqual(['SS', 'BF', 'FA'])
  expect(v.ammo).toBe(8)
  const none = entryValues(entry('weapons', { ar: 'nonsense', modes: 'zz', ammo: 'none' }))
  expect(none.ar).toBeUndefined()
  expect(none.modes).toBeUndefined()
  expect(none.ammo).toBeUndefined()
})

test('a vehicle’s numbers are exported when it prints any; a vehicle printing none has no vehicle block', () => {
  const v = entryValues(
    entry('vehicles', { handling: '3/5', accel: '10', body: '5', armor: '2', pilot: '1', sensor: '1', seats: '4', topSpeed: '140', interval: '15' }),
  )
  expect(v.vehicle).toMatchObject({ body: 5, armor: 2, pilot: 1, sensor: 1, seats: 4, topSpeed: 140 })
  expect(entryValues(entry('vehicles', {})).vehicle).toBeUndefined()
})

test('legality, capacity in brackets, defense and karma read as numbers at the rating; a power’s cost is its power cost, not nuyen', () => {
  const v = entryValues(
    entry('augmentations', { avail: '6(L)', capacity: '[Rating]', rating: '1–3', cost: 'Rating × 500', essence: 'Rating × 0.1', karma: '4' }),
    2,
  )
  expect(v).toMatchObject({ rating: 2, capacity: 2, essence: 0.2, karma: 4, legality: 'L' })
  const power = entryValues(entry('adeptpowers', { cost: '0.5' }))
  expect(power).toMatchObject({ powerCost: 0.5 })
  expect(power.cost).toBeUndefined()
  const lowest = entryValues(entry('gear', { rating: '2–4' }))
  expect(lowest.rating).toBe(2)
  expect(entryValues(entry('rituals', { threshold: 'Force' })).threshold).toBeUndefined()
  expect(entryValues(entry('rituals', { threshold: '3' })).threshold).toBe(3)
})

test('an augmentation’s type is cyberware or bioware for the Foundry module, the printed type kept as ware', () => {
  expect(exportAttrs(entry('augmentations', { type: 'cyberware' }))).toEqual({ type: 'cyberware' })
  expect(exportAttrs(entry('augmentations', { type: 'geneware' }))).toEqual({ type: 'bioware', ware: 'geneware' })
  expect(exportAttrs(entry('augmentations', { type: 'nanoware' }))).toEqual({ type: 'cyberware', ware: 'nanoware' })
  expect(exportAttrs(entry('gear', { type: 'geneware' }))).toEqual({ type: 'geneware' })
  expect(exportAttrs(entry('augmentations', {}))).toEqual({})
})

const effect = (attrs: Record<string, string>): Sr6Part => ({ tag: 'effect', attrs, text: '' })

test('a book export lists an entry’s effects, links and tests with their conditions, and the old ids it had', () => {
  const c = fixtureCatalog()
  const knack = c.entries.qualities.get('crb.knack')!
  knack.parts = [
    effect({ target: 'derived:defense', op: 'add', value: '2', confidence: 'low', switch: 'wireless', when: 'in the dark', spec: 'x', affects: 'caster' }),
    effect({ target: 'attr:bod', op: 'add', value: '1', affects: 'others' }),
    effect({ target: 'attr:agi', op: 'add', value: '1', affects: 'everyone' }),
    effect({ target: 'attr:str', op: 'add' }),
    { tag: 'link', attrs: { rel: 'grants', name: 'Stoneskin', kind: 'qualities', ref: 'crb.stoneskin', level: '2', when: 'always' }, text: '' },
    { tag: 'link', attrs: { rel: 'as', name: 'Wanderer' }, text: '' },
    { tag: 'link', attrs: { rel: 'mimics', name: 'Nothing' }, text: '' },
    { tag: 'test', attrs: { skill: 'skill:perception', attr: 'attr:int', threshold: '3' }, text: '' },
    { tag: 'test', attrs: { skill: 'skill:gab', attr: 'attr:cha', threshold: 'half' }, text: '' },
    { tag: 'test', attrs: { skill: 'skill:gab' }, text: '' },
  ]
  c.moved.set('qualities/crb.old-knack', { kind: 'qualities', id: 'crb.knack' })
  c.moved.set('gear/crb.older-knack', { kind: 'qualities', id: 'crb.knack' })
  const file = exportSr6Books(c, sr6Data(c), ['CRB'], { descriptions: false, now: '2026-10-04T09:00:00.000Z', appVersion: 't' })
  const e = file.books![0].entries.find(x => x.id === 'crb.knack')!
  expect(e.effects).toEqual([
    { target: 'derived:defense', op: 'add', value: '2', low: true, switch: 'wireless', when: 'in the dark', spec: 'x', affects: 'caster' },
    { target: 'attr:bod', op: 'add', value: '1', affects: 'others' },
    { target: 'attr:agi', op: 'add', value: '1' },
  ])
  expect(e.links).toEqual([
    { rel: 'grants', name: 'Stoneskin', kind: 'qualities', id: 'crb.stoneskin', level: 2, when: 'always' },
    { rel: 'as', name: 'Wanderer' },
  ])
  expect(e.tests).toEqual([
    { skill: 'skill:perception', attr: 'attr:int', threshold: 3 },
    { skill: 'skill:gab', attr: 'attr:cha' },
  ])
  expect(e.aliases).toEqual([{ id: 'crb.old-knack' }, { id: 'crb.older-knack', kind: 'gear' }])
  expect(file.books![0].entries.find(x => x.id === 'crb.stoneskin')).not.toHaveProperty('aliases')
})
