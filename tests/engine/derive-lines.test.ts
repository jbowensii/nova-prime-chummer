// What the sheets say beyond the numbers (src/engine/derive.ts effectLines, poolMarks, rrNotes, ammoDVs), from hand-made
// derived values: singular and plural wording, each condition, the switched-on extras without repeats.
import { expect, test } from 'vitest'
import { ammoDVs, effectLines, poolMarks, rrNotes, type Derived, type Pool } from '../../src/engine/derive'

const base = { sustain: { free: 1, max: 2, formsFree: 1, formsMax: 2 }, awakened: { sorcery: false }, emerged: false, extraSpirits: 0, effects: [] }
const d = (over: object = {}) => ({ ...base, ...over }) as unknown as Derived

test('nothing special says nothing', () => expect(effectLines(d())).toEqual([]))

test('sustaining: one spell for a sorcerer, several for others; forms the same for the emerged', () => {
  expect(effectLines(d({ awakened: { sorcery: true } }))).toEqual(['Sustains 1 spell without a Disadvantage, 2 at most'])
  expect(effectLines(d({ sustain: { free: 3, max: 5, formsFree: 1, formsMax: 2 } }))).toEqual(['Sustains 3 spells without a Disadvantage, 5 at most'])
  expect(effectLines(d({ emerged: true }))).toEqual(['Sustains 1 complex form without a Disadvantage, 2 at most'])
  expect(effectLines(d({ sustain: { free: 1, max: 2, formsFree: 4, formsMax: 6 } }))).toEqual(['Sustains 4 complex forms without a Disadvantage, 6 at most'])
})

test('spirits, wounds, risk, VR, rigging', () => {
  expect(effectLines(d({ extraSpirits: 1 }))).toEqual(['1 more summoned spirit'])
  expect(effectLines(d({ extraSpirits: 3 }))).toEqual(['3 more summoned spirits'])
  expect(effectLines(d({ ignoreWounds: 'all' }))).toEqual(['Ignores wound modifiers'])
  expect(effectLines(d({ ignoreWounds: 'light' }))).toEqual(['Ignores light wound modifiers'])
  expect(effectLines(d({ forcedRisk: true }))).toEqual(['Must take a High or Extreme Risk'])
  expect(effectLines(d({ vr: 'hot' }))).toEqual(['Hot-sim VR', 'A free cybercombat action per turn in VR (CRB p.212)'])
  expect(effectLines(d({ vr: 'cold' }))[0]).toBe('Cold-sim VR')
  expect(effectLines(d({ rcc: 1 }))).toEqual(['Rigger command console: 1 drone'])
  expect(effectLines(d({ rcc: 3, vcr: true }))).toEqual(['Rigger command console: 3 drones', 'Vehicle control rig'])
})

test('only an item’s or the metatype’s effects are listed here; the amps’ are with each amp', () => {
  const effects = [
    { type: 'item', text: 'Sharper', from: 'Knife', how: 'only sometimes' },
    { type: 'metatype', text: 'Thick hide', from: 'Stonefolk', how: '' },
    { type: 'cyberware', text: 'Ignored', from: 'Arm', how: '' },
  ]
  expect(effectLines(d({ effects }))).toEqual(['Sharper (Knife, only sometimes)', 'Thick hide (Stonefolk)'])
})

test('what switching on adds follows, marked, and nothing is said twice', () => {
  const on = d({ extraSpirits: 1 }),
    switched = d({ extraSpirits: 1, forcedRisk: true })
  expect(effectLines(d({ extraSpirits: 1, switched }))).toEqual(['1 more summoned spirit', 'Must take a High or Extreme Risk (switched on)'])
  expect(on.switched).toBeUndefined()
})

test('a pool’s marks: Advantage, Edge Advantage, Disadvantage and a limited Risk Reduction, each with where and when', () => {
  const p = {
    skill: 's',
    attr: 'agi',
    notes: [
      { ref: 'advantage', text: 'Dark', from: 'Eyes' },
      { ref: 'edge-advantage', text: 'Bold', from: 'Gland', how: 'when hurt' },
      { ref: 'disadvantage', text: 'Slow', from: 'Hip' },
      { ref: 'rr-spec', text: 'Locks', from: 'Tools' },
    ],
  } as unknown as Pool
  expect(poolMarks(p)).toEqual([
    { mark: 'Adv', title: 'Dark: Eyes' },
    { mark: 'Adv (1 Edge)', title: 'Bold: Gland (when hurt)' },
    { mark: 'Dis', title: 'Slow: Hip' },
    { mark: 'RR (spec.)', title: 'Locks: Tools' },
  ])
  expect(poolMarks({ skill: 's', attr: 'agi' } as unknown as Pool)).toEqual([])
})

test('the bracketed Risk Reduction behind a pool: its attribute’s and its skill’s effects, and a limited one', () => {
  const effects = [
    { ref: 'rr-attr', param: 'agi', bracket: true, text: 'Luck', from: 'Charm', how: 'activated' },
    { ref: 'rr-skill', param: 's', bracket: true, text: 'Skill luck', from: 'Ring', how: '' },
    { ref: 'rr-attr', param: 'str', bracket: true, text: 'Other', from: 'X', how: '' },
    { ref: 'rr-attr', param: 'agi', text: 'Not bracketed', from: 'Y', how: '' },
  ]
  const p = {
    skill: 's',
    attr: 'agi',
    notes: [
      { ref: 'rr-spec', text: 'Locks', from: 'Tools', how: 'picking' },
      { ref: 'advantage', text: 'No', from: 'Z' },
    ],
  }
  expect(rrNotes({ effects } as unknown as Derived, p as unknown as Pool)).toEqual(['Luck: Charm (activated)', 'Skill luck: Ring', 'Locks: Tools (picking)'])
})

test('alternative damage by ammunition: only a word in the brackets counts, once each, never a page reference', () => {
  expect(ammoDVs('DV 5 (gel) / 6 (explosive)')).toEqual(['5 (gel)', '6 (explosive)'])
  expect(ammoDVs('DV: 5 (gel), or 6 (explosive); 5 (gel)')).toEqual(['5 (gel)', '6 (explosive)'])
  expect(ammoDVs('DV 5 (p. 12)')).toEqual([])
  expect(ammoDVs('no damage listed')).toEqual([])
  expect(ammoDVs()).toEqual([])
})
