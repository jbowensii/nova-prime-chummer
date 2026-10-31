// How the creation rules are sorted into the nine sections (src/sr6/table-setup/ui/creationLayout.ts): every setting lands in one, a
// number that needs a switch sits in its switch's section, house rules and the books' optional rules apart.
import { expect, test } from 'vitest'
import { expandKeys, RULE_DEPS, RUNNER_RULE_KEYS } from '../../../src/sr6/table-setup/domain/creation'
import { ruleKind, SECTIONS, sectionOf, splitLabel } from '../../../src/sr6/table-setup/ui/creationLayout'
import { fixtureCatalog } from '../catalog/fixture'

const keys = expandKeys({ metatypes: Object.fromEntries(fixtureCatalog().entries.metatypes) })
const at = (key: string) => sectionOf(key, keys.find(k => k.key === key)!.group)

test('every setting is in one of the nine sections, and every section has some', () => {
  const by = new Map<string, string[]>()
  for (const k of keys) by.set(sectionOf(k.key, k.group), [...(by.get(sectionOf(k.key, k.group)) ?? []), k.key])
  expect([...by.keys()].sort()).toEqual([...SECTIONS].sort())
  expect([...by.values()].flat().length).toBe(keys.length)
})

test('a number that needs a switch is in its switch’s section', () => {
  // (one that needs two switches, swcStreet.karmaBuild: the level and the Karma build option, sits under its first)
  for (const k of keys) {
    const p = RULE_DEPS[k.key]?.requires?.find(r => keys.find(x => x.key === r)?.type === 'bool')
    if (p) expect([k.key, at(k.key)]).toEqual([k.key, at(p)])
  }
  expect(at('contactKarma')).toBe('Optional rules (book)')
  expect(at('carryOver.karma')).toBe('House rules')
  expect(at('karmaBuild.start')).toBe('House rules')
  expect(at('swcStreet.letters')).toBe('Levels of play')
  expect(at('swcStreet.karmaBuild')).toBe('Levels of play')
})

test('house rules and options are apart from the books’ optional rules', () => {
  expect(ruleKind('exoticFirstSpecFree')).toBe('house')
  expect(ruleKind('karmaBuildMethod')).toBe('option')
  expect(ruleKind('stackingAdvantage')).toBeUndefined()
  for (const k of ['exoticFirstSpecFree', 'availabilitySeven', 'positiveQualityMultiplier']) expect(at(k)).toBe('House rules')
  // (metatypeSizePricing: a book rule, owner ruling 5, 2026-10-31)
  for (const k of ['metatypeSizePricing', 'stackingAdvantage', 'twentyQuestions', 'highStrengthDamage', 'expandedContacts', 'workingForTheMan'])
    expect(at(k)).toBe('Optional rules (book)')
  for (const k of ['levelStreet', 'levelPrime', 'levelSwcElite', 'priorityLetters', 'eliteSumToThirteen']) expect(at(k)).toBe('Levels of play')
  expect(at('skillCap')).toBe('Attributes & skills')
  expect(at('aptitudeQuality')).toBe('Qualities')
  expect(at('magicMax')).toBe('Magic & Resonance')
  expect(at('grade:alpha:cost')).toBe('Gear & augmentations')
  expect(at('fakeSinPerRating')).toBe('Contacts & lifestyle')
  expect(at('startingKarma')).toBe('Budgets & priorities')
})

test('every optional rule a runner may choose has a section too', () => {
  for (const { key } of RUNNER_RULE_KEYS) expect(SECTIONS).toContain(at(key))
})

test('a label splits into a short name and the rest, outside any brackets; the house-rule tag is dropped', () => {
  expect(splitLabel('Expanded contacts: karma buys contact points past the pool')).toEqual({
    title: 'Expanded contacts',
    hint: 'karma buys contact points past the pool',
  })
  expect(splitLabel('Highest skill rank')).toEqual({ title: 'Highest skill rank', hint: '' })
  expect(splitLabel('Lowest a quality lowers an attribute’s maximum to (Impaired; unset: no floor)')).toEqual({
    title: 'Lowest a quality lowers an attribute’s maximum to (Impaired; unset: no floor)',
    hint: '',
  })
  expect(splitLabel('No used (or omega) grade on cultured bioware (house rule)')).toEqual({ title: 'No used (or omega) grade on cultured bioware', hint: '' })
})
