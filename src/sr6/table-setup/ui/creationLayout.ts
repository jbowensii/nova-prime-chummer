// How the creation rules are laid out on Table setup, a campaign's page and a runner's Creation rules panel (0.13.1): ten
// foldable sections instead of one long table. Presentation only: the settings, their keys and what they do are
// creation.ts's. A toggle goes to Optional rules (book), House rules or App conveniences by RULE_META (else by its hover text); a number that
// needs a toggle (RULE_DEPS) sits under it, in its section.
import { aboutOf, CREATION_KEYS, RULE_DEPS } from '../domain/creation'

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
  'App conveniences',
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
  'App conveniences': 'Not game rules: what the app loads, and which catalog items the rules look for by name.',
}

/** Where a rule toggle is shown and why (the audit: docs/analysis/sr6-optional-rules-audit-2026-11-02.md): book = an
 *  optional rule a book prints (`book`: where), house = no book prints it, app = not a game rule. `about`: one plain line
 *  shown under the row. UI metadata only: never stored in creation.xml. */
export const RULE_META: Record<string, { kind: 'book' | 'house' | 'app'; about: string; book?: string }> = {
  // optional rules printed in a book
  allowAnimalism: { kind: 'book', book: 'Bestial Nature p. 21', about: 'Runners may buy animalism powers.' },
  allowSurge: { kind: 'book', book: 'Sixth World Companion p. 116', about: 'Runners may take metagenic (SURGE) qualities and a SURGE collective.' },
  alternateMysticAdept: {
    kind: 'book',
    book: 'Sixth World Companion p. 148',
    about: 'Mystic adepts get half a power point per Magic but lose Conjuring and Enchanting.',
  },
  availabilityCapIllegalOnly: {
    kind: 'book',
    book: 'Core rulebook, 2019 printing p. 66',
    about: 'The old printing’s reading: the Availability cap only limits illegal gear.',
  },
  cargoWithoutSeats: { kind: 'book', book: 'Double Clutch p. 126', about: 'Taking seats out of a vehicle gives it more cargo space.' },
  expandedContacts: { kind: 'book', book: 'Sixth World Companion p. 161', about: 'Karma buys extra contact points past the free pool.' },
  expandedSpecializations: { kind: 'book', book: 'Sixth World Companion p. 153', about: 'A skill may have any number of specializations.' },
  highStrengthDamage: { kind: 'book', book: 'Sixth World Companion p. 150', about: 'Very strong characters hit harder in melee and unarmed combat.' },
  infectedAllowed: { kind: 'book', book: 'Sixth World Companion p. 104', about: 'Players may make Infected characters (ghouls, vampires and the like).' },
  infectedPowersAtCreation: {
    kind: 'book',
    book: 'Sixth World Companion p. 105',
    about: 'Infected runners may buy their optional powers during creation, not only after.',
  },
  karmaSpellsAtCreation: {
    kind: 'book',
    book: 'Core rulebook, 2019 printing p. 68',
    about: 'The old printing’s reading: extra spells and complex forms can be bought with creation Karma.',
  },
  knowledgeLogicIntuition: { kind: 'book', book: 'Core rulebook p. 98', about: 'Free knowledge points are (Logic + Intuition) × 2 instead of Logic alone.' },
  magicAboveSixByGrade: {
    kind: 'book',
    book: 'CRB Hong Kong p. 167',
    about: 'Initiating at creation lets Magic or Resonance go above the normal maximum.',
  },
  metatypeSizePricing: {
    kind: 'book',
    book: 'Core rulebook p. 64; Sixth World Companion pp. 91–92',
    about: 'Big metatypes (trolls, dwarfs) and some qualities and ware pay more for gear.',
  },
  stackingAdvantage: { kind: 'book', book: 'Sixth World Companion p. 144', about: 'A very large Attack Rating lead earns 2 Edge instead of 1.' },
  strengthInCloseCombat: {
    kind: 'book',
    book: 'Sixth World Companion p. 150',
    about: 'Close Combat rolls Strength; Agility goes into the melee Attack Rating.',
  },
  suprathyroidStacks: { kind: 'book', book: 'Sixth World Companion p. 149', about: 'The suprathyroid gland’s bonuses add to other augmentations’.' },
  transhumanism: {
    kind: 'book',
    book: 'Sixth World Companion p. 146',
    about: 'Mundane runners may buy transhumanist grades, each a free Essence hole for ware.',
  },
  twentyQuestions: { kind: 'book', book: 'Sixth World Companion p. 25', about: 'Bonus Karma at creation for answering the background questions.' },
  unrestrictedSkillRanks: { kind: 'book', book: 'Sixth World Companion p. 153', about: 'No skill rank limit after creation.' },
  workingForTheMan: { kind: 'book', book: 'Sixth World Companion p. 153', about: 'Downtime turns Karma into nuyen after creation.' },
  workingForThePeople: { kind: 'book', book: 'Sixth World Companion p. 153', about: 'Downtime turns nuyen into Karma after creation.' },
  // house rules: no book prints them
  adjustOnLoweredMax: { kind: 'house', about: 'Adjustment points may also go on an attribute whose maximum the metatype lowers.' },
  availabilitySeven: { kind: 'house', about: 'Gear of Availability 7 may be bought at creation (the book stops at 6).' },
  buyPowerPoints: { kind: 'house', about: 'Mystic adepts may buy power points with Karma after creation.' },
  capacityAccessoryEssence: { kind: 'house', about: 'Ware fitted into another piece of ware also costs its own Essence.' },
  dataStructureCaps: { kind: 'house', about: 'Review flags a technomancer’s data structures past the limits you set.' },
  exoticFirstSpecFree: { kind: 'house', about: 'The first Exotic Weapons specialization is free.' },
  gradeCapAtCreation: { kind: 'house', about: 'Review flags initiation, submersion or transhumanist grades at creation past the limits you set.' },
  karmaBuildMethod: { kind: 'house', about: 'Allows the Karma build creation method, which no SR6 book prints.' },
  karmaToNuyenCap: { kind: 'house', about: 'Limits how much Karma can become nuyen at creation.' },
  mentorBothAdvantages: { kind: 'house', about: 'A mystic adept gets both its mentor spirit’s magician and adept advantages.' },
  noUsedCulturedBioware: { kind: 'house', about: 'Cultured bioware can’t be bought used.' },
  ownCarryOver: { kind: 'house', about: 'Your own limits on Karma and nuyen kept after creation replace the book’s.' },
  pointBuyErrataNuyen: { kind: 'house', about: 'Point buy may buy up to 450,000 nuyen instead of the printed 440,000.' },
  positiveQualityMultiplier: { kind: 'house', about: 'Positive qualities cost a multiple of their Karma at creation.' },
  restrictMethods: { kind: 'house', about: 'Only the creation methods you tick can be used.' },
  // not game rules
  cl6OnlyData: { kind: 'app', about: 'Also loads the extra data set the admin added (records no book prints).' },
}
const META_SECTION = { book: 'Optional rules (book)', house: 'House rules', app: 'App conveniences' } as const
/** The rule sections, whose rows sort A–Z. */
export const ALPHA_SECTIONS = new Set<Section>(Object.values(META_SECTION))

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
  const meta = RULE_META[key]
  if (meta) return META_SECTION[meta.kind]
  if (KEY.get(key)?.type === 'quality') return 'App conveniences'
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
