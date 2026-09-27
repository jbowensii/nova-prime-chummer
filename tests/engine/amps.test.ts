import { readFileSync } from 'node:fs'
import { test, expect } from 'vitest'
import { ampChangeCost, ampCtx, ampEssence, ampRating, legalEffects } from '../../src/engine/amps'
import type { AmpEntry } from '../../src/model/types'
import { cat, sample } from '../helpers'

const amp = (type: string, ...effects: [string, string?][]): AmpEntry =>
  ({ uid: 'a', type, name: 't', narrative: '', effects: effects.map(([ref, param]) => ({ ref, param })) })
const first = { isFirstQuality: true }

test('smartlink: cyberware + RR 1 on a Skill = rating 6 = 30,000 (CRB p.83)', () => {
  const s = amp('cyberware', ['rr-skill', 'ranged-weapons'])
  expect(ampRating(cat, s, first)).toBe(6)
  expect(ampRating(cat, s, first) * cat.pricing.ampPoint).toBe(30000)
})

test('smartlink upgrade from pistols spec to the whole Skill costs +3 rating = 15,000 (CRB p.83)', () => {
  const before = amp('cyberware', ['rr-spec', 'ranged-weapons.pistols'])
  const after = amp('cyberware', ['rr-skill', 'ranged-weapons'])
  expect(ampRating(cat, before, first)).toBe(3)
  expect(ampChangeCost(cat, before, after, first)).toBe(15000)
})

test('removing an effect refunds nothing by default', () => {
  expect(ampChangeCost(cat, amp('cyberware', ['rr-skill', 'stealth']), amp('cyberware'), first)).toBe(0)
})

test("Lightning's amps rate 5, 6, 4, 2 = 17 (CRB p.85)", () => {
  const b = sample('lightning').build
  expect(b.amps.map(a => ampRating(cat, a, ampCtx(b, a)))).toEqual([5, 6, 4, 2])
})

test('the second Quality starts at base rating 3', () => {
  expect(ampRating(cat, amp('quality'), { isFirstQuality: false })).toBe(3)
  expect(ampRating(cat, amp('quality'), first)).toBe(0)
})

test('Essence: cyberware 1, bioware 0.5', () => {
  expect(ampEssence(cat, amp('cyberware'))).toBe(1)
  expect(ampEssence(cat, amp('bioware'))).toBe(0.5)
})

test("Hercules' amps (CRB p.88)", () => {
  expect(ampRating(cat, amp('adept', ['rr-spec', 'perception.social'], ['rr-spec', 'perception.social']), first)).toBe(5) // Empathic Sense
  expect(ampRating(cat, amp('adept', ['rr-spec', 'influence.impersonation']), first)).toBe(3) // Vocal Control
  expect(ampRating(cat, amp('contact', ['rr-skill', 'network']), first)).toBe(5) // Elton Hutchinson
  expect(ampRating(cat, amp('awakened', ['awk-adept']), first)).toBe(1)
})

test('catalog amps reproduce their printed rating unless listed as a book discrepancy', () => {
  const listed = new Set([...readFileSync('docs/book-discrepancies.md', 'utf8')
    .matchAll(/^\| ([a-z0-9-]+) \| (?:CRB|DHSA) p\./gm)].map(m => m[1]))
  const bad = [...cat.amps.values()].filter(t => !listed.has(t.id) &&
    ampRating(cat, { uid: t.id, type: t.type, name: t.name, narrative: '', effects: t.effects }, first) !== t.printedRating)
  expect(bad.map(t => t.id)).toEqual([])
})

test('legalEffects enforces type, max, requires, excludes', () => {
  const find = (a: AmpEntry, id: string) => legalEffects(cat, a).find(e => e.effect.id === id)
  expect(find(amp('cyberware'), 'awk-sorcery')).toBeUndefined()
  expect(find(amp('cyberware'), 'init-2')!.allowed).toBe(false)
  expect(find(amp('cyberware', ['init-1']), 'init-2')!.allowed).toBe(true)
  expect(find(amp('cyberware', ['rr-skill', 'stealth']), 'rr-skill')!.allowed).toBe(false)
  expect(find(amp('awakened', ['awk-astral-perception']), 'awk-astral-projection')!.allowed).toBe(false)
})
