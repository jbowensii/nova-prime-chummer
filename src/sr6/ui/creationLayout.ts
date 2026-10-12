// How the creation rules are laid out on Table setup, a campaign's page and a runner's Creation rules panel (0.13.1): nine
// foldable sections instead of one long table. Presentation only: the settings, their keys and what they do are
// creation.ts's. A toggle goes to House rules or Optional rules (book) by what its hover text says it is; a number that
// needs a toggle (RULE_DEPS) sits under it, in its section.
import { aboutOf, CREATION_KEYS, RULE_DEPS } from '../engine/creation'

export const SECTIONS = [
  'Budgets & priorities',
  'Attributes & skills',
  'Qualities',
  'Magic & Resonance',
  'Gear & augmentations',
  'Contacts & lifestyle',
  'Levels of play',
  'Optional rules (book)',
  'House rules',
] as const
export type Section = (typeof SECTIONS)[number]
/** What a section's rows are, under its heading. */
export const SECTION_ABOUT: Record<Section, string> = {
  'Budgets & priorities': 'Karma, nuyen and points: the creation methods’ numbers, the karma prices and the career prices.',
  'Attributes & skills': 'Attribute and skill limits, and the numbers behind the derived values.',
  Qualities: 'How many, how much, and the catalog qualities the rules look for by name.',
  'Magic & Resonance': 'The highest rating, free spells and forms, and foci.',
  'Gear & augmentations': 'Availability, augmentation grades and data structures.',
  'Contacts & lifestyle': 'Contact points and the price of fake SINs and licences.',
  'Levels of play': 'Street level, prime runner and the Sixth World Companion’s levels, one at a time.',
  'Optional rules (book)': 'Rules the books offer: each is off until its switch is on.',
  'House rules': 'Rules no book prints, or options the table chose: each is off until its switch is on.',
}

const G: Record<string, Section> = {
  'Levels of play': 'Levels of play',
  'Karma prices': 'Budgets & priorities',
  Advancement: 'Budgets & priorities',
  Nuyen: 'Budgets & priorities',
  'Sum to ten': 'Budgets & priorities',
  'Point buy': 'Budgets & priorities',
  'Karma build': 'Budgets & priorities',
  Metatypes: 'Budgets & priorities',
  Lifepath: 'Budgets & priorities',
  'Augmentation grades': 'Gear & augmentations',
  'Derived values': 'Attributes & skills',
  'Optional rules': 'House rules',
  General: 'Budgets & priorities',
}
const PUT: [Section, string[]][] = [
  [
    'Attributes & skills',
    [
      'oneAttributeAtMax',
      'attributeBaseMax',
      'skillCap',
      'skillCapAptitude',
      'oneSkillAtMax',
      'skillPointsSpec',
      'skillPointsExpertise',
      'languageMax',
      'knowledgePerLog',
      'essence',
    ],
  ],
  [
    'Qualities',
    [
      'qualityNetBonusCap',
      'qualityMaxCount',
      'aptitudeQuality',
      'exceptionalQuality',
      'incompetentQuality',
      'sensitiveSystemQuality',
      'improvedAbilityPower',
      'mentorSpiritQuality',
      'improvedAbilityFactor',
      'sensitiveSystemEssence',
      'attributeMaxFloor',
      'manyTalentsQuality',
      'manySkillsQuality',
      'builtToughQuality',
      'dermalDepositsQuality',
      'charismaticDefenseQuality',
    ],
  ],
  ['Magic & Resonance', ['magicMax', 'freeSpellsPerMagic', 'freeFormsPerResonance', 'fociForcePerMagic', 'fociBondKarma']],
  ['Gear & augmentations', ['maxAvailability', 'dataStructureNuyen']],
  ['Contacts & lifestyle', ['contactPointsPerCha', 'fakeSinPerRating', 'licencePerRating']],
  // the books' own options that sit among the general settings
  ['Optional rules (book)', ['expandedContacts', 'availabilityCapIllegalOnly', 'karmaSpellsAtCreation', 'magicAboveSixByGrade', 'cargoWithoutSeats']],
]
const FIXED = new Map(PUT.flatMap(([s, keys]) => keys.map(k => [k, s] as const)))
const KEY = new Map(CREATION_KEYS.map(k => [k.key, k]))

/** What the hover text calls a setting: a house rule, a table option (no book; the Karma build's "option (Commlink6
 *  defaults)" too), or neither. */
export const ruleKind = (key: string): 'house' | 'option' | undefined => {
  const m = /\((house rule|option)(?: \([^()]*\))?\)\.$/.exec(aboutOf(key))
  return m ? (m[1] === 'option' ? 'option' : 'house') : undefined
}

/** The section a setting is shown in. `group` is its creation.ts group (the per-metatype and per-magic-kind ones too). */
export function sectionOf(key: string, group: string): Section {
  const parent = RULE_DEPS[key]?.requires?.find(p => KEY.get(p)?.type === 'bool')
  if (parent) return sectionOf(parent, KEY.get(parent)!.group)
  const fixed = FIXED.get(key)
  if (fixed) return fixed
  if (group === 'Levels of play') return 'Levels of play'
  if (KEY.get(key)?.type === 'bool') {
    if (ruleKind(key)) return 'House rules'
    if (group === 'Optional rules') return 'Optional rules (book)'
  }
  return G[group] ?? 'Budgets & priorities'
}

/** A row's short name and the rest of its label, split at its first colon outside the brackets ("Expanded contacts" and
 *  "karma buys contact points…"); a trailing "(house rule)" or "(option)" is the badge's. */
export function splitLabel(label: string): { title: string; hint: string } {
  const text = label.replace(/ \((house rule|option)\)$/, '')
  let depth = 0
  for (let i = 0; i < text.length - 1; i++) {
    const c = text[i]
    if (c === '(') depth++
    else if (c === ')') depth--
    else if (c === ':' && depth === 0 && text[i + 1] === ' ') return { title: text.slice(0, i), hint: text.slice(i + 2) }
  }
  return { title: text, hint: '' }
}
