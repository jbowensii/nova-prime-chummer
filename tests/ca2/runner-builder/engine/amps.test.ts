import { test, expect } from 'vitest'
import { ampChangeCost, ampEssence, ampRating, effectRating, legalEffects, rawAmpRating } from '../../../../src/ca2/runner-builder/domain/amps'
import type { AmpEntry } from '../../../../src/ca2/formats/domain/types'
import { cat } from '../../../helpers'

const amp = (type: string, ...effects: [string, string?][]): AmpEntry => ({
  uid: 'a',
  type,
  name: 't',
  narrative: '',
  effects: effects.map(([ref, param]) => ({ ref, param })),
})
const first = { isFirstQuality: true }

// made-up core data: an amp point costs 6,000; bases: cyberware 2, quality 1 then 2, adept 2, contact 1, awakened 1;
// ratings: RR on a spec 3, on a Skill 4, Adept option 2; Essence 1.25 (cyberware), 0.25 (bioware)
test('cyberware + RR on a Skill = rating 6 = 36,000', () => {
  const s = amp('cyberware', ['rr-skill', 'ranged-weapons'])
  expect(ampRating(cat, s, first)).toBe(6)
  expect(ampRating(cat, s, first) * cat.pricing.ampPoint).toBe(36000)
})

test('upgrading RR from a spec to the whole Skill costs the rating difference', () => {
  const before = amp('cyberware', ['rr-spec', 'ranged-weapons.pistols'])
  const after = amp('cyberware', ['rr-skill', 'ranged-weapons'])
  expect(ampRating(cat, before, first)).toBe(5)
  expect(ampChangeCost(cat, before, after, first)).toBe(6000)
})

test('removing an effect refunds nothing by default', () => {
  expect(ampChangeCost(cat, amp('cyberware', ['rr-skill', 'stealth']), amp('cyberware'), first)).toBe(0)
})

test('the second Quality starts at its baseAfterFirst rating', () => {
  expect(ampRating(cat, amp('quality'), { isFirstQuality: false })).toBe(2)
  expect(ampRating(cat, amp('quality'), first)).toBe(1)
})

test('Essence by amp type', () => {
  expect(ampEssence(cat, amp('cyberware'))).toBe(1.25)
  expect(ampEssence(cat, amp('bioware'))).toBe(0.25)
})

test('adept, contact and awakened amp ratings', () => {
  expect(ampRating(cat, amp('adept', ['rr-spec', 'perception.social'], ['rr-spec', 'perception.social']), first)).toBe(8) // two RR on one spec
  expect(ampRating(cat, amp('adept', ['rr-spec', 'influence.impersonation']), first)).toBe(5) // one RR on a spec
  expect(ampRating(cat, amp('contact', ['rr-skill', 'network']), first)).toBe(5) // a contact with RR on a skill
  expect(ampRating(cat, amp('awakened', ['awk-adept']), first)).toBe(3)
})

test('catalog amps reproduce their printed rating (the made-up books have no discrepancies)', () => {
  // a mod has no base rating of its own: it adds its effects to an existing amp; the rating as the book adds it up (the
  // SINner house rule prices it at 0 after that)
  const rating = (t: typeof cat.amps extends Map<string, infer V> ? V : never) =>
    t.mod
      ? t.effects.reduce((n, e) => n + effectRating(cat, e), 0)
      : rawAmpRating(cat, { uid: t.id, type: t.type, name: t.name, narrative: '', effects: t.effects }, first)
  const bad = [...cat.amps.values()].filter(t => rating(t) !== t.printedRating)
  expect(bad.map(t => t.id)).toEqual([])
})

test('legalEffects enforces type, max, excludes; a missing required effect is allowed, marked', () => {
  const find = (a: AmpEntry, id: string) => legalEffects(cat, a).find(e => e.effect.id === id)
  expect(find(amp('cyberware'), 'awk-sorcery')).toBeUndefined()
  expect(find(amp('cyberware'), 'init-2')).toMatchObject({ allowed: true, reason: expect.stringMatching(/^requires /) })
  expect(find(amp('cyberware', ['init-1']), 'init-2')!.allowed).toBe(true)
  expect(find(amp('cyberware', ['vr-cold']), 'vr-cold')!.allowed).toBe(false) // max 1
  expect(find(amp('awakened', ['awk-astral-perception']), 'awk-astral-projection')!.allowed).toBe(false)
})
