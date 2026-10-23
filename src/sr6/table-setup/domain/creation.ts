// The table's SR6 creation rules (custom/sr6/creation.xml, public/data/sr6/schema/creation.xsd): every number the core
// rulebook prints only in its text (starting karma, caps, exchange rates, point-buy prices, grades…). The app ships the
// standard values with their pages (DEFAULTS_PATH, public/data/sr6/creation-defaults.xml); the admin changes them on the
// Table setup page (#/sr6/table), and their file holds only what they changed: the server's default. A campaign's GM may
// give it its own (server/campaigns.mjs), which its runners use instead, and a runner may choose the optional ones in
// RUNNER_RULE_KEYS. A method whose settings are unset can't be picked (missingFor), and a rule whose setting is unset is
// skipped. Formulas stay in code.
import { MAGIC_KIND_LABELS, LETTERS, SR6_METHODS, SR6_METHOD_LABELS, type MagicKind, type RunnerRule, type Sr6Method } from '../../formats/domain/character'
import { SOURCE_ID } from '../../../core/shared/source'
import type { CreationCatalog } from '../../catalog/domain/types'

export const CREATION_NS = 'urn:chummer-sr6:config:1'
/** The server's switch for the optional data set (custom/sr6/cl6only/, docs/sr6-cl6-optional-package.md): off by default;
 *  on, the catalog loads it (Sr6App, collectSr6Files). A campaign's or runner's value has no effect: the catalog is the
 *  server's. */
export const CL6_ONLY_KEY = 'cl6OnlyData'
/** The most transhumanist grades the Sixth World Companion's Transhumanism allows (p. 146) */
export const TRANSHUMAN_MAX = 20
export type CreationValue = number | boolean | string
/** from: the layer it comes from (runnerRules; unset: the server's); lockedBy: the campaign GM who locked it for its runners;
 *  assumed: a sample runner's, taken from its book's numbers (the book doesn't say). */
export interface CreationSetting {
  key: string
  value: CreationValue
  source?: string
  page?: number
  from?: RuleLayer
  lockedBy?: string
  assumed?: true
}
export type RuleLayer = 'server' | 'campaign' | 'runner'
export type CreationRules = Map<string, CreationSetting>
export type CreationType = 'number' | 'bool' | 'quality' | 'letters'
/** methods: the creation methods that need the setting set ('all': every one; []: optional). */
export interface CreationKey {
  key: string
  label: string
  type: CreationType
  group: string
  methods: Sr6Method[] | 'all'
}

/** The groups, in the order the creation rules form shows them. */
export const CREATION_GROUPS = [
  'General',
  'Levels of play',
  'Karma prices',
  'Advancement',
  'Nuyen',
  'Sum to ten',
  'Point buy',
  'Karma build',
  'Metatypes',
  'Lifepath',
  'Augmentation grades',
  'Derived values',
  'Optional rules',
]
const GRADES = ['standard', 'alpha', 'beta', 'delta', 'used']
const AWAKENED = (Object.keys(MAGIC_KIND_LABELS) as MagicKind[]).filter(k => k !== 'mundane')

const n = (group: string, methods: CreationKey['methods'], rows: [string, string][]): CreationKey[] =>
  rows.map(([key, label]) => ({ key, label, type: 'number', group, methods }))

/** Every fixed setting. Per-metatype and per-magic-kind ones come from expandKeys. */
export const CREATION_KEYS: CreationKey[] = [
  ...n('General', 'all', [
    ['startingKarma', 'Starting karma'],
    ['qualityNetBonusCap', 'Most net karma from qualities'],
    ['qualityMaxCount', 'Most paid qualities'],
  ]),
  { key: 'oneAttributeAtMax', label: 'Only one attribute at its maximum', type: 'bool', group: 'General', methods: 'all' },
  // optional: unset, the adjustment-target rule is skipped with a warning
  ...n('General', [], [['attributeBaseMax', 'Adjustment points go on attributes whose metatype maximum is above']]),
  ...n('General', 'all', [
    ['skillCap', 'Highest skill rank'],
    ['skillCapAptitude', 'Highest skill rank with the aptitude quality'],
  ]),
  { key: 'aptitudeQuality', label: 'Aptitude quality', type: 'quality', group: 'General', methods: 'all' },
  {
    key: 'exceptionalQuality',
    label: 'Exceptional (Attribute) quality: +1 to the maximum of the attribute its note names, once per attribute (unset: none)',
    type: 'quality',
    group: 'General',
    methods: [],
  },
  {
    key: 'incompetentQuality',
    label: 'Incompetent (Skill) quality: no ranks in the skill its note names (unset: none)',
    type: 'quality',
    group: 'General',
    methods: [],
  },
  {
    key: 'sensitiveSystemQuality',
    label: 'Sensitive System quality: no Magic or Resonance; ware Essence times the factor below (unset: none)',
    type: 'quality',
    group: 'General',
    methods: [],
  },
  {
    key: 'improvedAbilityPower',
    label: 'Improved Ability adept power: its skill boosted at most to the factor below (unset: none)',
    type: 'quality',
    group: 'General',
    methods: [],
  },
  ...n(
    'General',
    [],
    [
      ['languageMax', 'Highest language level; Native counts as it (unset: no cap)'],
      ['fociForcePerMagic', 'Foci: their Force together at most Magic times'],
    ],
  ),
  {
    key: 'mentorSpiritQuality',
    label: 'Mentor Spirit quality: choosing a mentor spirit adds it, removing it removes the mentor spirit (unset: none)',
    type: 'quality',
    group: 'General',
    methods: [],
  },
  { key: 'fociBondKarma', label: 'Foci cost their bonding karma at creation', type: 'bool', group: 'General', methods: [] },
  ...n('General', [], [['improvedAbilityFactor', 'Improved Ability: the boosted skill at most its rank times (rounded up)']]),
  ...n(
    'General',
    [],
    [
      ['sensitiveSystemEssence', 'Sensitive System: cyberware, bioware and nanoware Essence times'],
      ['attributeMaxFloor', 'Lowest a quality lowers an attribute’s maximum to (Impaired; unset: no floor)'],
    ],
  ),
  { key: 'manyTalentsQuality', label: 'Many Talents quality: two attributes at their maximum (unset: none)', type: 'quality', group: 'General', methods: [] },
  { key: 'manySkillsQuality', label: 'Many Skills quality: two skills at the highest rank (unset: none)', type: 'quality', group: 'General', methods: [] },
  {
    key: 'availabilityCapIllegalOnly',
    label: 'The Availability cap holds only illegal gear (the core rulebook’s first printing)',
    type: 'bool',
    group: 'General',
    methods: [],
  },
  { key: 'oneSkillAtMax', label: 'Only one skill at the highest rank', type: 'bool', group: 'General', methods: [] },
  { key: 'restrictMethods', label: 'Only the creation methods ticked below can be picked (house rule)', type: 'bool', group: 'General', methods: [] },
  ...SR6_METHODS.map((m): CreationKey => ({
    key: `methodAllowed.${m}`,
    label: `Creation method allowed: ${SR6_METHOD_LABELS[m]}`,
    type: 'bool',
    group: 'General',
    methods: [],
  })),
  // (CRB pp. 285–286's tables print an enhancement's Essence and its Capacity; the books' samples print a host's Essence
  // alone: off, the owner to rule)
  {
    key: 'capacityAccessoryEssence',
    label: 'An accessory fitted into a host’s Capacity costs its own Essence too (option)',
    type: 'bool',
    group: 'Augmentation grades',
    methods: [],
  },
  // optional (CRB p. 66's list of what the customization Karma buys doesn't name them; Commlink6: an option, off)
  {
    key: 'karmaSpellsAtCreation',
    label: 'Extra spells, rituals and complex forms bought with the customization Karma',
    type: 'bool',
    group: 'General',
    methods: [],
  },
  ...n('General', 'all', [['skillPointsSpec', 'Skill points for a specialization']]),
  // optional: unset, an expertise at creation is bought with the customization karma (advance.expertise)
  ...n('General', [], [['skillPointsExpertise', 'Skill points for an expertise (unset: bought with karma at the advancement price)']]),
  ...n('General', 'all', [
    ['magicMax', 'Highest Magic or Resonance'],
    ['essence', 'Starting Essence'],
    ['contactPointsPerCha', 'Contact points per Charisma'],
    ['knowledgePerLog', 'Free knowledge points per point of Logic'],
    ['maxAvailability', 'Highest Availability'],
    ['maxNuyenLeft', 'Most nuyen kept after creation'],
    ['freeSpellsPerMagic', 'Free spells per Magic'],
    ['freeFormsPerResonance', 'Free complex forms per Resonance'],
  ]),
  // optional (the core rulebook prints no number): unset, no limit
  ...n('General', [], [['maxKarmaLeft', 'Most karma kept after creation (unset: no limit)']]),
  // L2 (owner, 2026-10-11): the book's carry-over limits, or the GM's own while this is on
  {
    key: 'ownCarryOver',
    label: 'Own carry-over limits: the Karma and nuyen kept after creation below, in place of the book’s (house rule)',
    type: 'bool',
    group: 'General',
    methods: [],
  },
  ...n(
    'General',
    [],
    [
      ['carryOver.karma', 'Own carry-over limits: most Karma kept'],
      ['carryOver.nuyen', 'Own carry-over limits: most nuyen kept'],
    ],
  ),
  // optional, the Sixth World Companion's expanded contact rules (SWC p. 161; off: each rating up to Charisma, no karma)
  {
    key: 'expandedContacts',
    label: 'Expanded contacts: karma buys contact points past the pool and past a contact’s pair cap',
    type: 'bool',
    group: 'General',
    methods: [],
  },
  ...n(
    'General',
    [],
    [
      ['contactKarma', 'Expanded contacts: karma per contact point past the points or past a contact’s pair cap'],
      ['contactPairPerCha', 'A contact’s connection + loyalty up to Charisma times'],
      ['contactRatingMax', 'Highest contact rating (unset: Charisma)'],
    ],
  ),
  ...n('Karma prices', 'all', [
    ['karmaAttrPerRank', 'Attribute: karma per rank, times the new rating'],
    ['karmaSkillPerRank', 'Skill: karma per rank, times the new rank'],
    ['karmaSpec', 'Specialization'],
    ['karmaKnowledge', 'Knowledge or language rank'],
    ['karmaSpell', 'Extra spell or ritual'],
    ['karmaForm', 'Extra complex form'],
    ['karmaInitiationBase', 'Initiation or submersion: base'],
    ['karmaInitiationPerGrade', 'Initiation or submersion: per grade'],
  ]),
  {
    key: 'positiveQualityMultiplier',
    label: 'Positive qualities cost a multiple of their Karma at creation (option)',
    type: 'bool',
    group: 'Karma prices',
    methods: [],
  },
  ...n('Karma prices', [], [['positiveQualityFactor', 'Positive qualities cost their karma times (unset: 1)']]),
  // optional: unset, a style or technique counts 0 karma (Review warns) and can't be bought after creation
  ...n(
    'Karma prices',
    [],
    [
      ['karmaMartialArt', 'Martial arts style'],
      ['karmaTechnique', 'Martial arts technique (a style’s signature one is free)'],
    ],
  ),
  // career play (S3; the Karma prices above are the career prices too): optional, unset refuses the spend that needs it
  // (a cap: not applied; nuyen to karma: the optional rule is off)
  { key: 'buyPowerPoints', label: 'Mystic adepts buy power points with Karma after creation (house rule)', type: 'bool', group: 'Advancement', methods: [] },
  ...n(
    'Advancement',
    [],
    [
      ['advance.expertise', 'Expertise after creation'],
      ['advance.expertiseRank', 'Lowest skill rank for an expertise (unset: none)'],
      ['advance.qualityFactor', 'A positive quality after creation costs its karma times'],
      ['advance.buyOffFactor', 'Buying off a negative quality costs its karma times'],
      ['advance.skillMax', 'Highest skill rank after creation (unset: no cap)'],
      ['advance.powerPoint', 'Karma per power point (mystic adepts)'],
      ['advance.karmaToNuyenRate', 'Nuyen per karma after creation (unset: not offered)'],
      ['advance.nuyenToKarmaRate', 'Nuyen per karma, nuyen to karma (optional rule; unset: off)'],
    ],
  ),
  ...n('Nuyen', 'all', [
    ['karmaToNuyenRate', 'Nuyen per karma'],
    ['karmaToNuyenRateInDebt', 'Nuyen per karma with the in-debt quality'],
  ]),
  { key: 'inDebtQuality', label: 'In-debt quality', type: 'quality', group: 'Nuyen', methods: 'all' },
  // No Future's Stolen Gear as its errata has it: optional (unset, a runner with the quality converts as any other)
  { key: 'stolenGearQuality', label: 'Stolen Gear quality (unset: none)', type: 'quality', group: 'Nuyen', methods: [] },
  ...n(
    'Nuyen',
    [],
    [
      ['karmaToNuyenRateStolenGear', 'Nuyen per karma with Stolen Gear'],
      ['karmaToNuyenMaxStolenGear', 'Most karma turned into nuyen with Stolen Gear'],
      ['stolenGearBuyOff', 'Karma to buy off one karma of Stolen Gear’s conversion'],
    ],
  ),
  { key: 'karmaToNuyenCap', label: 'A limit on the Karma turned into nuyen at creation (house rule)', type: 'bool', group: 'Nuyen', methods: [] },
  ...n('Nuyen', [], [['karmaToNuyenMax', 'Most karma turned into nuyen (unset: no limit)']]), // optional, as maxKarmaLeft
  ...n('Nuyen', [], [['dataStructureNuyen', 'Data structure: nuyen per level']]),
  ...n('Nuyen', 'all', [
    ['fakeSinPerRating', 'Fake SIN: nuyen per rating'],
    ['licencePerRating', 'Fake licence: nuyen per rating'],
  ]),
  ...n(
    'Sum to ten',
    ['sumtoten'],
    [['sumToTenTarget', 'The letters’ values add up to at most'], ...LETTERS.map(l => [`letterValue:${l}`, `Value of priority ${l}`] as [string, string])],
  ),
  ...n(
    'Point buy',
    ['pointbuy'],
    [
      ['pointBuy.total', 'Character points'],
      ['pointBuy.awakened', 'Character points to be awakened or emerged'],
      ...(['attribute', 'skill', 'adjustment', 'nuyen'] as const).flatMap(
        p =>
          [
            [`pointBuy.free.${p}`, `Free ${p === 'nuyen' ? 'nuyen' : `${p} points`}`],
            [`pointBuy.max.${p}`, `Most ${p === 'nuyen' ? 'nuyen' : `${p} points`}`],
          ] as [string, string][],
      ),
      ['pointBuy.cost.attribute', 'Character points per attribute point'],
      ['pointBuy.cost.skill', 'Character points per skill point'],
      ['pointBuy.cost.adjustment', 'Character points per adjustment point'],
      ['pointBuy.cost.powerPoint', 'Character points per power point'],
      ['pointBuy.cost.mysticPowerPoint', 'Character points per power point (mystic adept)'],
      ['pointBuy.cost.spell', 'Character points per spell'],
      ['pointBuy.cost.complexForm', 'Character points per complex form'],
      ['pointBuy.nuyenPerCp', 'Nuyen per character point'],
    ],
  ),
  { key: 'pointBuy.oneSpecialization', label: 'Only one specialization', type: 'bool', group: 'Point buy', methods: ['pointbuy'] },
  {
    key: 'karmaBuildMethod',
    label: 'Karma build: a creation method no SR6 book describes, with the numbers below (option)',
    type: 'bool',
    group: 'Karma build',
    methods: [],
  },
  ...n(
    'Karma build',
    ['karma'],
    [
      ['karmaBuild.start', 'Starting karma (karma build)'],
      ['karmaBuild.startRating', 'Starting Magic or Resonance (karma build)'],
      ['karmaBuild.freeSpellsPerMagic', 'Free spells per Magic (karma build)'],
      ['karmaBuild.freeFormsPerResonance', 'Free complex forms per Resonance (karma build)'],
    ],
  ),
  ...n(
    'Lifepath',
    ['lifepath'],
    [
      ['lifepath.moduleCount', 'Adult life modules to take'],
      ['lifepath.contactRatingCap', 'Highest contact rating'],
    ],
  ),
  // optional: unset, the rule is off (no raise, no module twice, contact ratings past the points aren't bought)
  ...n(
    'Lifepath',
    [],
    [
      ['lifepath.bestAttributeBonus', 'Best attribute raised by (unset: no raise)'],
      ['lifepath.repeatModules', 'Adult modules that may be taken twice (unset: none)'],
      ['lifepath.contactKarma', 'Karma per contact rating past the contact points (unset: not offered)'],
      ['lifepath.raisedAttributeStart', 'Attributes whose metatype maximum is above the base maximum start at (unset: 1)'],
      ['lifepath.mundaneEdge', 'Edge a runner neither awakened nor emerged gains (unset: none)'],
    ],
  ),
  ...GRADES.flatMap(g =>
    n(
      'Augmentation grades',
      [],
      [
        [`grade:${g}:essence`, `${cap(g)}: Essence times`],
        [`grade:${g}:cost`, `${cap(g)}: cost times`],
        [`grade:${g}:avail`, `${cap(g)}: Availability plus`],
      ],
    ),
  ),
  // the constants in derive.ts's formulas (optional: unset, the value shows empty)
  ...n(
    'Derived values',
    [],
    [
      ['monitorBase', 'Condition monitor: boxes before the attribute'],
      ['monitorDivisor', 'Condition monitor: the attribute divided by (rounded up)'],
      ['initiativeDice', 'Initiative dice'],
      ['initiativeDiceMax', 'Most initiative dice (unset: no cap)'],
      ['astralInitiativeDice', 'Astral initiative dice'],
      ['specDice', 'Dice for a specialization'],
      ['expertiseDice', 'Dice for an expertise'],
      ['untrainedPenalty', 'Dice off the attribute for an untrained skill'],
      ['overflowPerBody', 'Damage Overflow boxes per point of Body'],
      ['attributeAugmentMax', 'Most an attribute’s augmented value is above its natural one (unset: no cap)'],
      ['skillAugmentMax', 'Most a skill’s dice pool is raised by bonuses (unset: no cap)'],
      ['monitorMinimum', 'Fewest boxes a quality can lower a condition monitor to (unset: no floor)'],
      ['matrixColdDice', 'VR initiative, cold sim: dice added to the usual ones'],
      ['matrixHotDice', 'VR initiative, hot sim: dice added to the usual ones'],
      ['moveWalk', 'Metres for a Move'],
      ['moveSprint', 'Metres for a Sprint'],
      ['moveSprintPerHit', 'Sprint: metres more per hit'],
      ['unarmedDV', 'Unarmed Damage Value (Stun)'],
      ['arDrEdgeGap', 'Attack Rating against Defense Rating: the lead that gains a point of Edge'],
    ],
  ),
  // levels of play (each off: the standard level). The core rulebook's (CRB Hong Kong p. 63) and the Sixth World
  // Companion's (pp. 14–15), whose numbers replace sumToTenTarget, pointBuy.total, lifepath.moduleCount and
  // priorityLetters while one is on (levelRules)
  {
    key: 'levelStreet',
    label: 'Street level: each priority gives the values of the row below (E stays E)',
    type: 'bool',
    group: 'Levels of play',
    methods: [],
  },
  { key: 'levelPrime', label: 'Prime runner: twice the customization karma', type: 'bool', group: 'Levels of play', methods: [] },
  {
    key: 'levelSwcStreet',
    label: 'Street-level (Sixth World Companion): the letters, targets and module count below; no illegal gear but cyberdecks',
    type: 'bool',
    group: 'Levels of play',
    methods: [],
  },
  ...n(
    'Levels of play',
    [],
    [
      ['swcStreet.sumToTen', 'Street-level: sum-to-ten target'],
      ['swcStreet.pointBuy', 'Street-level: character points'],
      ['swcStreet.modules', 'Street-level: adult life modules'],
      ['swcStreet.karmaBuild', 'Street-level: Karma build starting karma'],
    ],
  ),
  { key: 'swcStreet.letters', label: 'Street-level: the priority letters', type: 'letters', group: 'Levels of play', methods: [] },
  {
    key: 'levelSwcElite',
    label: 'Elite (Sixth World Companion): the letters, targets and module count below; no Availability cap',
    type: 'bool',
    group: 'Levels of play',
    methods: [],
  },
  ...n(
    'Levels of play',
    [],
    [
      ['swcElite.sumToTen', 'Elite: sum-to-ten target'],
      ['swcElite.pointBuy', 'Elite: character points'],
      ['swcElite.modules', 'Elite: adult life modules'],
      ['swcElite.karmaBuild', 'Elite: Karma build starting karma'],
    ],
  ),
  { key: 'swcElite.letters', label: 'Elite: the priority letters', type: 'letters', group: 'Levels of play', methods: [] },
  {
    key: 'priorityLetters',
    label: 'The priority letters a runner takes, one a column (unset: A, B, C, D and E once each)',
    type: 'letters',
    group: 'Levels of play',
    methods: [],
  },
  { key: 'meleeArStrength', label: 'STR adds to a melee weapon’s Attack Rating', type: 'bool', group: 'Derived values', methods: [] },
  // the books' optional rules (each off unless the table turns it on; their pages in RUNNER_RULE_KEYS and the defaults)
  { key: 'stackingAdvantage', label: 'Stacking Advantage: a lead of twice the gap gains 2 Edge', type: 'bool', group: 'Optional rules', methods: [] },
  { key: 'strengthInCloseCombat', label: 'Close Combat rolls STR; AGI goes into the melee Attack Ratings', type: 'bool', group: 'Optional rules', methods: [] },
  { key: 'highStrengthDamage', label: 'High STR adds to melee and unarmed Damage Values', type: 'bool', group: 'Optional rules', methods: [] },
  {
    key: 'alternateMysticAdept',
    label: 'Alternate Mystic Adept: half a power point per point of Magic, and per Magic raised; no Conjuring or Enchanting',
    type: 'bool',
    group: 'Optional rules',
    methods: [],
  },
  {
    key: 'twentyQuestions',
    label: 'Twenty Questions: karma at creation for answering ten of the questions',
    type: 'bool',
    group: 'Optional rules',
    methods: [],
  },
  ...n('Optional rules', [], [['twentyQuestionsKarma', 'Twenty Questions: the karma']]),
  {
    key: 'workingForTheMan',
    label: 'Working for the Man: karma turned into nuyen after creation, at the rate under Advancement',
    type: 'bool',
    group: 'Optional rules',
    methods: [],
  },
  {
    key: 'workingForThePeople',
    label: 'Working for the People: nuyen turned into karma after creation, at the rate under Advancement',
    type: 'bool',
    group: 'Optional rules',
    methods: [],
  },
  {
    key: 'expandedSpecializations',
    label: 'Expanded Specializations: any number of specializations a skill (one expertise)',
    type: 'bool',
    group: 'Optional rules',
    methods: [],
  },
  {
    key: 'unrestrictedSkillRanks',
    label: 'Unrestricted Skill Ranks: no highest skill rank after creation',
    type: 'bool',
    group: 'Optional rules',
    methods: [],
  },
  { key: 'suprathyroidStacks', label: 'Suprathyroid gland bonuses stack with other augmentations’', type: 'bool', group: 'Optional rules', methods: [] },
  {
    key: 'infectedAllowed',
    label: 'Infected player characters allowed: the Infected qualities and optional powers are offered',
    type: 'bool',
    group: 'Optional rules',
    methods: [],
  },
  {
    key: 'infectedPowersAtCreation',
    label: 'Infected optional powers at creation (GM override): bought at creation, not only after',
    type: 'bool',
    group: 'Optional rules',
    methods: [],
  },
  {
    key: CL6_ONLY_KEY,
    label: 'Optional data set: records no book prints, from custom/sr6/cl6only/ (the server’s setting; off: none load)',
    type: 'bool',
    group: 'Optional rules',
    methods: [],
  },
  ...n(
    'Optional rules',
    [],
    [
      ['strengthDamageStep1', 'High STR: the STR for +1 Damage Value'],
      ['strengthDamageStep2', 'High STR: the STR for +2 Damage Value'],
    ],
  ),
  // the owner's decisions (2026-10-11): house rules and options, each off unless the table turns it on
  ...(
    [
      ['exoticFirstSpecFree', 'Exotic Weapons: the first specialization costs nothing (house rule)'],
      ['mentorBothAdvantages', 'A mystic adept gets both its mentor spirit’s magician and adept advantages (house rule)'],
      ['dataStructureCaps', 'Caps on a technomancer’s data structures at creation: the count and level below (house rule)'],
    ] as [string, string][]
  ).map(([key, label]): CreationKey => ({ key, label, type: 'bool', group: 'Optional rules', methods: [] })),
  ...n(
    'Optional rules',
    [],
    [
      ['dataStructure.maxCount', 'Data structure caps: most data structures'],
      ['dataStructure.maxRating', 'Data structure caps: highest level'],
    ],
  ),
  ...(
    [
      ['noUsedCulturedBioware', 'No used (or omega) grade on cultured bioware (house rule)'],
      ['gradeCapAtCreation', 'Caps on the initiation, submersion and transhumanist grade at creation: the grades below (house rule)'],
      ['transhumanism', 'Transhumanism: a mundane buys transhumanist grades, each an Essence hole of 1.0 (option)'],
    ] as [string, string][]
  ).map(([key, label]): CreationKey => ({ key, label, type: 'bool', group: 'Optional rules', methods: [] })),
  ...n(
    'Optional rules',
    [],
    [
      ['gradeCap.initiation', 'Grade caps: highest initiation grade at creation'],
      ['gradeCap.submersion', 'Grade caps: highest submersion grade at creation'],
      ['gradeCap.transhuman', 'Grade caps: highest transhumanist grade at creation'],
    ],
  ),
  ...(
    [
      ['adjustOnLoweredMax', 'Adjustment points also on an attribute whose metatype maximum is lowered (house rule)'],
      ['pointBuyErrataNuyen', 'Point buy: up to 450,000 nuyen bought with character points, the errata version (house rule)'],
      ['knowledgeLogicIntuition', 'Optional: (Logic + Intuition) × 2 Knowledge points'],
      ['magicAboveSixByGrade', 'Magic or Resonance at creation up to the highest plus the initiation or submersion grade (option)'],
      ['eliteSumToThirteen', 'Elite: sum-to-thirteen instead of sum-to-twelve (house rule)'],
      ['availabilitySeven', 'Gear of Availability 7 at creation (house rule)'],
      ['cargoWithoutSeats', 'Vehicles: seats removed add cargo space (option)'],
      ['metatypeSizePricing', 'Metatype size pricing: trolls pay 10% more for everything bought, dwarfs 10% more for armor (house rule)'],
    ] as [string, string][]
  ).map(([key, label]): CreationKey => ({ key, label, type: 'bool', group: 'Optional rules', methods: [] })),
  { key: 'builtToughQuality', label: 'Built Tough quality: a Physical box per level (unset: none)', type: 'quality', group: 'Derived values', methods: [] },
  { key: 'dermalDepositsQuality', label: 'Dermal Deposits quality: +1 Defense Rating (unset: none)', type: 'quality', group: 'Derived values', methods: [] },
  {
    key: 'charismaticDefenseQuality',
    label: 'Charismatic Defense quality: Defense Rating from Charisma, not Body (unset: none)',
    type: 'quality',
    group: 'Derived values',
    methods: [],
  },
]
function cap(s: string) {
  return s[0].toUpperCase() + s.slice(1)
}

// the keys expandKeys adds, by prefix: [prefix, group, methods, label]
const PER_METATYPE: [string, string, Sr6Method[], (name: string) => string][] = [
  ['metatypeKarma:', 'Metatypes', ['pointbuy', 'karma', 'lifepath'], name => `${name}: karma`],
]
const PER_MAGIC: [string, string, Sr6Method[], (kind: MagicKind) => string][] = [
  ['pointBuy.startRating:', 'Point buy', ['pointbuy'], k => `Starting Magic or Resonance (point buy): ${MAGIC_KIND_LABELS[k]}`],
  ['magicKarma:', 'Karma build', ['karma'], k => `Karma to be: ${MAGIC_KIND_LABELS[k]}`],
  ['lifepath.startRating:', 'Lifepath', ['lifepath'], k => `Starting Magic or Resonance (lifepath): ${MAGIC_KIND_LABELS[k]}`],
]
const STATIC = new Map(CREATION_KEYS.map(k => [k.key, k]))

/** CREATION_KEYS plus one key per catalog metatype and per awakened or emerged magic kind. */
export function expandKeys(data: Pick<CreationCatalog, 'metatypes'>): CreationKey[] {
  const mts = Object.values(data.metatypes).sort((a, b) => a.name.localeCompare(b.name))
  return [
    ...CREATION_KEYS,
    ...PER_METATYPE.flatMap(([p, group, methods, label]) => mts.map(m => ({ key: p + m.id, label: label(m.name), type: 'number' as const, group, methods }))),
    ...PER_MAGIC.flatMap(([p, group, methods, label]) => AWAKENED.map(k => ({ key: p + k, label: label(k), type: 'number' as const, group, methods }))),
  ]
}

/** A key's type: a fixed key's, a number for a per-metatype or per-magic-kind one (any id), else undefined (unknown). */
export function keyType(key: string): CreationType | undefined {
  return STATIC.get(key)?.type ?? ([...PER_METATYPE, ...PER_MAGIC].some(([p]) => key.startsWith(p) && key.length > p.length) ? 'number' : undefined)
}

function typed(type: CreationType, raw: string): CreationValue | undefined {
  const s = raw.trim()
  if (type === 'bool') return s === 'true' ? true : s === 'false' ? false : undefined
  if (type === 'quality') return s || undefined
  if (type === 'letters') return /^[A-E]{5}$/.test(s.toUpperCase()) ? s.toUpperCase() : undefined
  return s && Number.isFinite(Number(s)) ? Number(s) : undefined
}

/** A setting as the server stores and sends it: every value a string. */
export interface CreationRow {
  key: string
  value: string
  source?: string
  page?: number | string
}

/** The rules from stored rows (a creation.xml's settings, or a campaign's own). A value that isn't of its key's type, or an
 *  unknown key, is an error and is skipped. */
export function rulesFrom(rows: CreationRow[]): { rules: CreationRules; errors: string[] } {
  const rules: CreationRules = new Map(),
    errors: string[] = []
  for (const { key, value: raw, source, page: p } of rows) {
    const type = keyType(key)
    if (!type) {
      errors.push(`“${key}” isn’t a creation setting.`)
      continue
    }
    const value = typed(type, raw)
    if (value === undefined) {
      errors.push(
        `${key}: “${raw}” isn’t ${type === 'bool' ? 'true or false' : type === 'number' ? 'a number' : type === 'letters' ? 'five priority letters (ABCDE)' : 'a quality id'}.`,
      )
      continue
    }
    const page = Number(p) || undefined
    rules.set(key, { key, value, ...(source ? { source } : {}), ...(page ? { page } : {}) })
  }
  return { rules, errors }
}

/** The rules in a creation.xml (see rulesFrom). */
export function parseCreation(xml: string): { rules: CreationRules; errors: string[] } {
  const doc = new DOMParser().parseFromString(xml, 'text/xml'),
    root = doc.documentElement
  if (doc.getElementsByTagName('parsererror').length || root.localName !== 'creation' || root.namespaceURI !== CREATION_NS)
    return { rules: new Map(), errors: ['The saved creation rules file isn’t a creation rules document.'] }
  return rulesFrom(
    [...root.children]
      .filter(e => e.localName === 'setting')
      .map(el => ({
        key: el.getAttribute('key') ?? '',
        value: el.getAttribute('value') ?? '',
        source: el.getAttribute('source') || undefined,
        page: el.getAttribute('page') ?? undefined,
      })),
  )
}

export const num = (cr: CreationRules, key: string) => {
  const v = cr.get(key)?.value
  return typeof v === 'number' ? v : undefined
}
/** num, an unset setting counting 0. */
export const n0 = (cr: CreationRules, key: string) => num(cr, key) ?? 0
export const flag = (cr: CreationRules, key: string) => {
  const v = cr.get(key)?.value
  return typeof v === 'boolean' ? v : undefined
}
export const str = (cr: CreationRules, key: string) => {
  const v = cr.get(key)?.value
  return typeof v === 'string' ? v : undefined
}

/** The levels of play that replace other settings' values while on (the Sixth World Companion's Alternate Power Levels,
 *  pp. 14–15): the level's key, then [the setting it replaces, the level's own setting holding the value]. */
export const LEVELS: [string, [string, string][]][] = [
  [
    'levelSwcStreet',
    [
      ['sumToTenTarget', 'swcStreet.sumToTen'],
      ['pointBuy.total', 'swcStreet.pointBuy'],
      ['lifepath.moduleCount', 'swcStreet.modules'],
      ['priorityLetters', 'swcStreet.letters'],
      ['karmaBuild.start', 'swcStreet.karmaBuild'],
    ],
  ],
  [
    'levelSwcElite',
    [
      ['sumToTenTarget', 'swcElite.sumToTen'],
      ['pointBuy.total', 'swcElite.pointBuy'],
      ['lifepath.moduleCount', 'swcElite.modules'],
      ['priorityLetters', 'swcElite.letters'],
      ['karmaBuild.start', 'swcElite.karmaBuild'],
    ],
  ],
  // L2 (owner, 2026-10-11): the GM's own carry-over limits in place of the book's
  [
    'ownCarryOver',
    [
      ['maxKarmaLeft', 'carryOver.karma'],
      ['maxNuyenLeft', 'carryOver.nuyen'],
    ],
  ],
]
/** House rules whose number is the rule itself: while the toggle is on, the setting takes that number (owner's decisions
 *  21 and 17, 2026-10-11: no book prints them). [toggle, setting, value] */
export const SETS: [string, string, number][] = [
  ['eliteSumToThirteen', 'sumToTenTarget', 13],
  ['availabilitySeven', 'maxAvailability', 7],
  ['pointBuyErrataNuyen', 'pointBuy.max.nuyen', 450000],
]
/** The rules with a level of play that is on put in place: its own values (with its source and page) instead of the
 *  settings they replace (a value the level leaves unset keeps the setting's). Two levels on: the later one's. Then a
 *  house rule of SETS that is on sets its number. */
export function levelRules(cr: CreationRules): CreationRules {
  const on = LEVELS.filter(([k]) => flag(cr, k)),
    sets = SETS.filter(([k]) => flag(cr, k))
  if (!on.length && !sets.length) return cr
  const out: CreationRules = new Map(cr)
  for (const [, pairs] of on)
    for (const [key, from] of pairs) {
      const v = cr.get(from)
      if (v) out.set(key, { ...v, key })
    }
  for (const [k, key, value] of sets) out.set(key, { ...cr.get(k)!, key, value })
  return out
}
/** Nested optional rules (the books' pages: book-rules-implemented.md, "Nested optional rules"): requires, the settings
 *  that must be on (a true/false one true, any other set) for this one to apply; conflicts, the ones that can't be on with
 *  it (each pair once: conflictsOf reads both ways); replaces, the settings it stands in for while on (shown; the rule's
 *  own code does it). A rule whose parent is off keeps its stored value but doesn't apply (applyDeps). */
export interface RuleDeps {
  requires?: string[]
  conflicts?: string[]
  replaces?: string[]
}
const LEVEL_KEYS = ['levelStreet', 'levelPrime', 'levelSwcStreet', 'levelSwcElite']
export const RULE_DEPS: Record<string, RuleDeps> = {
  // one level of play at a time (CRB Hong Kong p. 63: street level and, "on the other end", prime runner; SWC p. 14:
  // street-level or elite)
  ...Object.fromEntries(LEVEL_KEYS.map((k, i) => [k, { conflicts: LEVEL_KEYS.slice(i + 1) }])),
  levelSwcElite: { replaces: ['maxAvailability'] },
  ...Object.fromEntries(
    ['sumToTen', 'pointBuy', 'modules', 'letters'].flatMap(s => [
      [`swcStreet.${s}`, { requires: ['levelSwcStreet'] }],
      [`swcElite.${s}`, { requires: ['levelSwcElite'] }],
    ]),
  ),
  // the Karma build's starting karma at a level of play (it needs the Karma build option too)
  'swcStreet.karmaBuild': { requires: ['levelSwcStreet', 'karmaBuildMethod'] },
  'swcElite.karmaBuild': { requires: ['levelSwcElite', 'karmaBuildMethod'] },
  // SWC p. 161: "Instead of a flat limit of Charisma ... use the following rules"
  ...Object.fromEntries(['contactKarma', 'contactPairPerCha', 'contactRatingMax'].map(k => [k, { requires: ['expandedContacts'] }])),
  twentyQuestionsKarma: { requires: ['twentyQuestions'] }, // SWC p. 25
  // SWC p. 144: 2 Edge for twice the core rulebook's lead (HK p. 45)
  stackingAdvantage: { requires: ['arDrEdgeGap'] },
  infectedPowersAtCreation: { requires: ['infectedAllowed'] },
  // SWC p. 150: "add Agility to Attack Rating in place of Strength"
  strengthInCloseCombat: { replaces: ['meleeArStrength'] },
  strengthDamageStep1: { requires: ['highStrengthDamage'] },
  strengthDamageStep2: { requires: ['highStrengthDamage'] },
  // SWC p. 153
  'advance.karmaToNuyenRate': { requires: ['workingForTheMan'] },
  'advance.nuyenToKarmaRate': { requires: ['workingForThePeople'] },
  unrestrictedSkillRanks: { replaces: ['advance.skillMax'] },
  // the owner's decisions (2026-10-11): a toggle with the values the GM sets under it
  ...Object.fromEntries(
    [
      ['ownCarryOver', ['carryOver.karma', 'carryOver.nuyen']],
      ['karmaToNuyenCap', ['karmaToNuyenMax']],
      ['positiveQualityMultiplier', ['positiveQualityFactor']],
      ['buyPowerPoints', ['advance.powerPoint']],
      [
        'karmaBuildMethod',
        [
          'karmaBuild.start',
          'karmaBuild.startRating',
          'karmaBuild.freeSpellsPerMagic',
          'karmaBuild.freeFormsPerResonance',
          ...AWAKENED.map(k => `magicKarma:${k}`),
        ],
      ],
      ['dataStructureCaps', ['dataStructure.maxCount', 'dataStructure.maxRating']],
      ['gradeCapAtCreation', ['gradeCap.initiation', 'gradeCap.submersion', 'gradeCap.transhuman']],
      ['restrictMethods', SR6_METHODS.map(m => `methodAllowed.${m}`)],
    ].flatMap(([parent, kids]) => (kids as string[]).map(k => [k, { requires: [parent as string] }])),
  ),
  eliteSumToThirteen: { requires: ['levelSwcElite'] },
}
for (const [l, pairs] of LEVELS) RULE_DEPS[l] = { ...RULE_DEPS[l], replaces: [...pairs.map(([k]) => k), ...(RULE_DEPS[l]?.replaces ?? [])] }
for (const [t, key] of SETS) RULE_DEPS[t] = { ...RULE_DEPS[t], replaces: [key] }

/** The rule presets of the table setup page: a named set of the toggles above, applied to the form for review (choosing one
 *  sets them; Save keeps them). `settings` are the values the preset sets; every other setting a preset manages
 *  (PRESET_KEYS) goes back to the standard. Standard changes nothing about the maths: the standard values. Configurable
 *  is the table's own, nothing preset. Not modelled: Shadowrun Missions' limit of 1 transhuman grade (the app has no
 *  transhuman grades). */
export interface RulePreset {
  id: 'standard' | 'seattle' | 'missions' | 'configurable'
  label: string
  about: string
  settings: Record<string, CreationValue>
}
export const RULE_PRESETS: RulePreset[] = [
  { id: 'standard', label: 'Standard', about: 'The standard values for the settings the presets manage', settings: {} },
  { id: 'seattle', label: 'Standard (Seattle)', about: 'Standard, with Strength added to a melee weapon’s Attack Rating', settings: { meleeArStrength: true } },
  {
    id: 'missions',
    label: 'Shadowrun Missions',
    about:
      'Gear up to Availability 7, initiation grade 1 and submersion grade 2 at most at creation, only priority, sum-to-ten and point buy, expanded specializations',
    settings: {
      availabilitySeven: true,
      gradeCapAtCreation: true,
      'gradeCap.initiation': 1,
      'gradeCap.transhuman': 1,
      transhumanism: true,
      'gradeCap.submersion': 2,
      expandedSpecializations: true,
      restrictMethods: true,
      ...Object.fromEntries(SR6_METHODS.map(m => [`methodAllowed.${m}`, ['priority', 'sumtoten', 'pointbuy'].includes(m)])),
    },
  },
  { id: 'configurable', label: 'Configurable', about: 'Nothing preset: every setting is the table’s own', settings: {} },
]
/** Every setting a preset sets: choosing a preset puts these to its value, or back to the standard. */
export const PRESET_KEYS = [...new Set(RULE_PRESETS.flatMap(p => Object.keys(p.settings)))]
/** What choosing preset `id` does to the form: values to set, keys back to the standard (none for Configurable). */
export function presetChanges(id: RulePreset['id']): { set: [string, CreationValue][]; reset: string[] } {
  const p = RULE_PRESETS.find(x => x.id === id)
  if (!p || p.id === 'configurable') return { set: [], reset: [] }
  return { set: Object.entries(p.settings), reset: PRESET_KEYS.filter(k => !(k in p.settings)) }
}

/** The settings that can't be on with `key`, both ways. */
export const conflictsOf = (key: string) => [...(RULE_DEPS[key]?.conflicts ?? []), ...Object.keys(RULE_DEPS).filter(k => RULE_DEPS[k].conflicts?.includes(key))]
/** A setting that is on: set, and not false. */
export const isOn = (s?: CreationSetting) => s !== undefined && s.value !== false
/** Why `key` doesn't apply with these rules: a parent it needs is off, or a rule it can't be on with is on. */
export function blockedBy(cr: CreationRules, key: string): { needs: string } | { conflicts: string } | undefined {
  const needs = RULE_DEPS[key]?.requires?.find(p => !isOn(cr.get(p)))
  if (needs) return { needs }
  const other = conflictsOf(key).find(k => isOn(cr.get(k)))
  return other ? { conflicts: other } : undefined
}
const ORDER = new Map(CREATION_KEYS.map((k, i) => [k.key, i]))
/** The rules with every nested rule whose parent is off left out, and of two conflicting rules on only one: the locked
 *  one, else the runner's own, else the one Table setup lists first. */
export function applyDeps(cr: CreationRules): CreationRules {
  const out: CreationRules = new Map(cr),
    rank = (s: CreationSetting) => (s.lockedBy ? 2 : s.from === 'runner' ? 1 : 0)
  for (const k of [...out.keys()].sort((a, b) => (ORDER.get(a) ?? 1e9) - (ORDER.get(b) ?? 1e9))) {
    const s = out.get(k)
    if (!isOn(s)) continue
    for (const c of conflictsOf(k)) {
      const o = out.get(c)
      if (isOn(o)) out.delete(rank(o!) > rank(s!) ? k : c)
    }
  }
  for (let changed = true; changed;) {
    changed = false
    for (const k of [...out.keys()])
      if (RULE_DEPS[k]?.requires?.some(p => !isOn(out.get(p)))) {
        out.delete(k)
        changed = true
      }
  }
  return out
}
/** Items (keys) with each nested one right after its parent (its first `requires` among them): depth 1, 2…; root: the
 *  top-level item it sits under. */
export function nested<T extends { key: string }>(items: T[]): { item: T; depth: number; root: T }[] {
  const keys = new Set(items.map(i => i.key)),
    parentOf = (k: string) => RULE_DEPS[k]?.requires?.find(p => keys.has(p))
  const out: { item: T; depth: number; root: T }[] = []
  const walk = (i: T, depth: number, root: T) => {
    out.push({ item: i, depth, root })
    for (const c of items) if (parentOf(c.key) === i.key) walk(c, depth + 1, root)
  }
  for (const i of items) if (!parentOf(i.key)) walk(i, 0, i)
  return out
}

export const cite = (cr: CreationRules, key: string): { source?: string; page?: number } => {
  const s = cr.get(key)
  return { ...(s?.source ? { source: s.source } : {}), ...(s?.page ? { page: s.page } : {}) }
}

/** What `method` still needs before a runner can use it: its unset settings (and every method's), then
 *  "priorities A–E" (priority, sum-to-ten) when a letter's row is missing, "life modules" (lifepath) with no opening ones. */
export function missingFor(method: Sr6Method, cr: CreationRules, data: CreationCatalog): string[] {
  const out = expandKeys(data)
    .filter(k => (k.methods === 'all' || k.methods.includes(method)) && !cr.has(k.key))
    .map(k => k.key)
  if (flag(cr, 'restrictMethods') && flag(cr, `methodAllowed.${method}`) !== true) out.unshift('restrictMethods')
  // (U27: the Karma build is an option the table turns on)
  if (method === 'karma' && !flag(cr, 'karmaBuildMethod')) out.unshift('karmaBuildMethod')
  if ((method === 'priority' || method === 'sumtoten') && LETTERS.some(l => !data.priorities[l])) out.push('priorities A–E')
  if (method === 'lifepath' && !Object.values(data.lifemodules).some(m => m.stage === 'opening')) out.push('life modules')
  return out
}

/** The runner rules that set `method` up with the shipped standard values (std): one per missing setting the std has and a
 *  runner may carry (isRunnerRuleKey), each assumed, so Review notes it. */
export function methodFill(method: Sr6Method, cr: CreationRules, data: CreationCatalog, std: CreationRules): RunnerRule[] {
  return missingFor(method, cr, data).flatMap(k => {
    const s = std.get(k)
    return s && isRunnerRuleKey(k)
      ? [{ key: k, value: String(s.value), assumed: true as const, ...(s.source ? { source: s.source } : {}), ...(s.page ? { page: s.page } : {}) }]
      : []
  })
}

/** A settings file someone picked to load into the creation rules form (the creation.xml format): every row the server
 *  would take, typed as rulesFrom does. fatal: it isn't a creation rules file at all (nothing loads); errors: the rows (or
 *  a row's source or page) left out, each said in words. Nothing is saved: the form shows it for review. */
export function readSettingsFile(xml: string, name: string): { rules: CreationRules; errors: string[]; fatal?: string } {
  const doc = new DOMParser().parseFromString(xml, 'text/xml'),
    root = doc.documentElement
  if (doc.getElementsByTagName('parsererror').length || root.localName !== 'creation' || root.namespaceURI !== CREATION_NS)
    return { rules: new Map(), errors: [], fatal: `${name} isn’t a creation rules file (an sr6:creation document, like custom/sr6/creation.xml).` }
  const els = [...root.children].filter(e => e.localName === 'setting')
  if (els.length > 500) return { rules: new Map(), errors: [], fatal: `${name} has ${els.length} settings; 500 at most.` }
  const errors: string[] = [],
    seen = new Set<string>(),
    rows: CreationRow[] = []
  for (const el of els) {
    const key = el.getAttribute('key') ?? '',
      value = (el.getAttribute('value') ?? '').trim()
    let source = el.getAttribute('source') ?? undefined,
      page = el.getAttribute('page') ?? undefined
    if (seen.has(key)) {
      errors.push(`${key} is set twice: the first one is kept.`)
      continue
    }
    seen.add(key)
    if (value.length > 200) {
      errors.push(`${key}: the value is longer than 200 characters.`)
      continue
    }
    if (source !== undefined && !SOURCE_ID.test(source)) {
      errors.push(`${key}: the source “${source}” isn’t a book id such as CRB; left out.`)
      source = undefined
    }
    if (page !== undefined && !/^[1-9]\d{0,5}$/.test(page)) {
      errors.push(`${key}: the page “${page}” isn’t a whole number from 1; left out.`)
      page = undefined
    }
    rows.push({ key, value, source, page })
  }
  const r = rulesFrom(rows)
  return { rules: r.rules, errors: [...errors, ...r.errors] }
}

/** The standard settings the app ships (public/data/sr6/creation-defaults.xml: the core rulebook's and the Sixth World
 *  Companion's numbers, with their pages). */
export const DEFAULTS_PATH = 'data/sr6/creation-defaults.xml'

/** Fetch and parse one creation.xml. None there (404, or a host answering with a page that isn't XML), or the server
 *  unreachable: no rules. */
async function fetchCreation(url: string): Promise<{ rules: CreationRules; errors: string[] }> {
  const r = await fetch(url, { cache: 'no-cache' }).catch(() => null)
  if (!r?.ok || !/xml/i.test(r.headers.get('content-type') ?? '')) return { rules: new Map(), errors: [] }
  return parseCreation(await r.text())
}

/** The server's settings: the shipped standard ones (std) overlaid by the admin's changes (custom/sr6/creation.xml, which
 *  holds only the keys the admin changed; an older full copy works the same). */
export async function loadCreation(base = './'): Promise<{ rules: CreationRules; errors: string[]; std: CreationRules }> {
  const [std, own] = await Promise.all([fetchCreation(base + DEFAULTS_PATH), fetchCreation(`${base}custom/sr6/creation.xml`)])
  return { rules: new Map([...std.rules, ...own.rules]), errors: [...std.errors, ...own.errors], std: std.rules }
}

/** A setting a campaign's GM (or the admin) locked: its runners can't choose their own. */
export interface RuleLock {
  key: string
  by: string
}

/** What each setting does, in plain words, and where a book prints it, else "house rule" or "option" (owner, 2026-10-11):
 *  the hover text of its row on Table setup and on a runner's Creation rules. Never names another app, but the Karma build's (KARMA_BUILD). [what, where] */
const HK = (p: number | string) => `CRB Hong Kong p. ${p}`,
  SWC = (p: number | string) => `Sixth World Companion p. ${p}`
const HOUSE = 'house rule',
  OPTION = 'option',
  NF_ERRATA = 'No Future errata, NF p. 162'
// (owner, one-off exception, 2026-10-11: the one place another app is named) the Karma build option's numbers are the ones
// that app starts a Karma build from, since no SR6 book prints one
const KARMA_BUILD = 'option (Commlink6 defaults)',
  NO_BOOK = 'no SR6 book prints a Karma build'
const ABOUT: Record<string, [string, string]> = {
  startingKarma: ['The customization Karma every runner starts with; a prime runner doubles it', HK(66)],
  qualityNetBonusCap: ['The most Karma negative qualities may give beyond what the positive ones cost', HK(66)],
  qualityMaxCount: ['The most qualities a runner takes at creation; its metatype’s own traits never count', HK(66)],
  oneAttributeAtMax: ['Only one Physical or Mental attribute may be at its metatype maximum', HK(63)],
  attributeBaseMax: ['Adjustment points go only on an attribute whose metatype maximum is above this, and on Edge, Magic and Resonance', HK(63)],
  skillCap: ['The highest rank a skill may have at creation', HK(65)],
  skillCapAptitude: ['The highest rank of the skill an Aptitude quality names', HK(65)],
  aptitudeQuality: ['The catalog’s Aptitude quality: the skill its note names may go one rank higher; never on the skill an Incompetent names', HK(70)],
  exceptionalQuality: ['The catalog’s Exceptional (Attribute) quality: +1 to the maximum of the attribute its note names, once per attribute', HK(71)],
  incompetentQuality: ['The catalog’s Incompetent (Skill) quality: no ranks in the skill its note names; never on the skill an Aptitude names', HK('76–77')],
  sensitiveSystemQuality: ['The catalog’s Sensitive System quality: no Magic or Resonance, and ware Essence times the factor', HK(78)],
  improvedAbilityPower: ['The catalog’s Improved Ability adept power: the skill its note names, boosted at most to the factor', HK(157)],
  mentorSpiritQuality: [
    'The catalog’s Mentor Spirit quality: choosing a mentor spirit on the Magic tab adds it with its Karma, and removing it removes the mentor spirit',
    HK(73),
  ],
  languageMax: ['The highest level any language reaches; the Native language counts as this level and no other goes above it; one Native language only', HOUSE],
  fociForcePerMagic: ['The foci’s Force added together is at most Magic times this; no more foci than Magic, none of Force above it', HK(154)],
  fociBondKarma: ['A focus costs its bonding Karma out of the customization Karma', HK('154, 168')],
  improvedAbilityFactor: ['Improved Ability raises its skill to at most its rank times this, rounded up', HK(157)],
  sensitiveSystemEssence: ['Sensitive System multiplies cyberware, bioware and nanoware Essence by this', HK(78)],
  attributeMaxFloor: ['The lowest a quality (Impaired) lowers an attribute’s maximum to', HK(76)],
  manyTalentsQuality: ['The catalog’s Many Talents quality: two attributes may be at their maximum', SWC(134)],
  manySkillsQuality: ['The catalog’s Many Skills quality: two skills may be at the highest rank', SWC(134)],
  availabilityCapIllegalOnly: [
    'On: the Availability cap holds only illegal gear, as the first printing read it; off: every item is capped',
    'the core rulebook’s 2019 printing p. 66',
  ],
  oneSkillAtMax: ['Only one skill may be at the highest rank at creation', HK(65)],
  capacityAccessoryEssence: [
    'On: an accessory fitted into a host’s Capacity costs its own Essence too; off: only the host’s, as the books’ sample runners print it',
    OPTION,
  ],
  karmaSpellsAtCreation: [
    'On: spells, rituals and complex forms past the free ones can be bought with the customization Karma; off: they can’t, as the later printings say',
    'the core rulebook’s 2019 printing p. 68',
  ],
  skillPointsSpec: ['Skill points a specialization costs at creation', HK(65)],
  skillPointsExpertise: [
    'Skill points an expertise costs at creation, in place of its Karma price; off: bought with Karma. The book disagrees with itself: p. 65 says no expertise with skill points at creation, p. 68 prices one',
    'book discrepancy, CRB Hong Kong pp. 65, 68',
  ],
  magicMax: ['The highest Magic or Resonance at creation', HK(65)],
  essence: ['The Essence every runner starts with', HK(38)],
  contactPointsPerCha: ['Contact points per point of Charisma', HK(67)],
  knowledgePerLog: ['Free Knowledge points per point of Logic', 'CRB p. 97'],
  maxAvailability: ['The highest Availability of gear bought at creation', HK(66)],
  maxNuyenLeft: ['The most nuyen kept after creation; more is a problem a GM can approve', HK(68)],
  freeSpellsPerMagic: ['Free spells and rituals per point of Magic', HK(65)],
  freeFormsPerResonance: ['Free complex forms per point of Resonance', HK(66)],
  maxKarmaLeft: ['The most Karma kept after creation; more is a problem a GM can approve', HK(66)],
  ownCarryOver: ['On: the GM’s own limits below replace the book’s 5 Karma and 5,000 nuyen kept after creation', HOUSE],
  'carryOver.karma': ['The most Karma kept after creation, with the GM’s own limits on', HOUSE],
  'carryOver.nuyen': ['The most nuyen kept after creation, with the GM’s own limits on', HOUSE],
  expandedContacts: ['On: Karma buys contact points past the pool and past a contact’s pair cap, up to the rating below', SWC(161)],
  contactKarma: ['Expanded contacts: Karma per contact point past the pool or past a contact’s pair cap', SWC(161)],
  contactPairPerCha: ['Expanded contacts: a contact’s connection + loyalty up to Charisma times this before Karma pays', SWC(161)],
  contactRatingMax: ['Expanded contacts: the highest connection or loyalty', SWC(161)],
  karmaAttrPerRank: ['Karma for an attribute rank: this times the new rating', HK(68)],
  karmaSkillPerRank: ['Karma for a skill rank: this times the new rank', HK(68)],
  karmaSpec: ['Karma for a specialization', HK(68)],
  karmaKnowledge: ['Karma for a knowledge or language rank', HK(68)],
  karmaSpell: ['Karma for a spell or ritual past the free ones', HK(68)],
  karmaForm: ['Karma for a complex form past the free ones', HK(68)],
  karmaInitiationBase: ['Karma for an initiation or submersion grade: this base', HK(68)],
  karmaInitiationPerGrade: ['Karma for an initiation or submersion grade: plus this times the new grade', HK(68)],
  positiveQualityMultiplier: ['On: positive qualities cost their Karma times the factor below at creation; off: their printed Karma', OPTION],
  positiveQualityFactor: ['The factor positive qualities’ Karma is multiplied by, with the multiplier on', OPTION],
  karmaMartialArt: ['Karma for a martial arts style (it comes with its signature technique)', 'Firing Squad p. 97'],
  karmaTechnique: ['Karma for a martial arts technique past a style’s signature one', 'Firing Squad p. 97'],
  'advance.expertise': ['Karma for an expertise (at creation too, when skill points don’t pay for it)', HK(68)],
  'advance.expertiseRank': ['The lowest skill rank an expertise needs', HK(68)],
  'advance.qualityFactor': ['A positive quality taken after creation costs its Karma times this', HK(69)],
  'advance.buyOffFactor': ['Buying off a negative quality costs its Karma times this', HK(69)],
  'advance.skillMax': ['The highest skill rank after creation', HK(65)],
  buyPowerPoints: [
    'On: a mystic adept buys power points after creation for the Karma below; off: only in place of a metamagic at initiation, as the book has it (CRB Hong Kong p. 168)',
    HOUSE,
  ],
  'advance.powerPoint': ['Karma per power point a mystic adept buys after creation, with the rule on', HOUSE],
  'advance.karmaToNuyenRate': ['Working for the Man: nuyen a Karma turns into after creation', SWC(153)],
  'advance.nuyenToKarmaRate': ['Working for the People: nuyen that turns into a Karma after creation', SWC(153)],
  karmaToNuyenRate: ['Nuyen a Karma turns into at creation', HK(66)],
  karmaToNuyenRateInDebt: ['Nuyen a Karma turns into at creation with the In Debt quality', HK(66)],
  inDebtQuality: ['The catalog’s In Debt quality, which changes the Karma-to-nuyen rate', HK(77)],
  stolenGearQuality: ['The catalog’s Stolen Gear quality (0 Karma), which changes the Karma-to-nuyen rate and limit; never with In Debt', NF_ERRATA],
  karmaToNuyenRateStolenGear: ['Nuyen a Karma turns into at creation with Stolen Gear', NF_ERRATA],
  karmaToNuyenMaxStolenGear: ['The most Karma turned into nuyen with Stolen Gear, at any rate (refused at creation; after it, a Review warning)', NF_ERRATA],
  stolenGearBuyOff: ['Karma to buy off one Karma of Stolen Gear’s conversion after creation (bought off a part at a time)', NF_ERRATA],
  karmaToNuyenCap: [
    'On: the Karma turned into nuyen at creation is limited to the number below; off: no limit, as the book prints none (CRB Hong Kong p. 66)',
    HOUSE,
  ],
  karmaToNuyenMax: ['The most Karma turned into nuyen at creation, with the limit on', HOUSE],
  dataStructureNuyen: ['Nuyen per level a data structure costs to buy; its Karma, equal to its level, pays to integrate it (p. 71)', 'Hack & Slash p. 72'],
  fakeSinPerRating: ['Nuyen per rating of a fake SIN', HK(273)],
  licencePerRating: ['Nuyen per rating of a fake licence', HK(273)],
  sumToTenTarget: ['Sum to ten: the priority letters’ values add up to at most this', SWC(27)],
  'pointBuy.total': ['Point buy: the character points a runner has', SWC(28)],
  'pointBuy.awakened': ['Point buy: character points to be awakened or emerged', SWC(29)],
  'pointBuy.cost.attribute': ['Point buy: character points per attribute point', SWC(29)],
  'pointBuy.cost.skill': ['Point buy: character points per skill point', SWC(29)],
  'pointBuy.cost.adjustment': ['Point buy: character points per adjustment point', SWC(29)],
  'pointBuy.cost.powerPoint': ['Point buy: character points per power point', SWC(29)],
  'pointBuy.cost.mysticPowerPoint': ['Point buy: character points per power point for a mystic adept', SWC(29)],
  'pointBuy.cost.spell': ['Point buy: character points per spell', SWC(29)],
  'pointBuy.cost.complexForm': ['Point buy: character points per complex form', SWC(29)],
  'pointBuy.nuyenPerCp': ['Point buy: nuyen per character point', SWC(29)],
  'pointBuy.oneSpecialization': ['Point buy: only one specialization at creation', SWC(29)],
  karmaBuildMethod: [
    'On: the Karma build can be picked as a creation method, with the numbers below; off: it can’t. No SR6 book prints a Karma build',
    KARMA_BUILD,
  ],
  'karmaBuild.start': [`Karma build: the Karma a runner starts with, to buy everything; ${NO_BOOK}`, KARMA_BUILD],
  'karmaBuild.startRating': [
    `Karma build: the Magic or Resonance an awakened or emerged runner starts at, before raising it with Karma; ${NO_BOOK}`,
    KARMA_BUILD,
  ],
  'karmaBuild.freeSpellsPerMagic': [
    `Karma build: free spells and rituals per point of Magic (0: every one costs its Karma, as the Karma prices have it); ${NO_BOOK}`,
    KARMA_BUILD,
  ],
  'karmaBuild.freeFormsPerResonance': [`Karma build: free complex forms per point of Resonance (0: every one costs its Karma); ${NO_BOOK}`, KARMA_BUILD],
  'swcStreet.karmaBuild': [`Street-level with the Karma build: the Karma a runner starts with, in place of the standard level's; ${NO_BOOK}`, KARMA_BUILD],
  'swcElite.karmaBuild': [`Elite with the Karma build: the Karma a runner starts with, in place of the standard level's; ${NO_BOOK}`, KARMA_BUILD],
  'lifepath.moduleCount': ['Lifepath: the adult life modules a runner takes', SWC(32)],
  'lifepath.contactRatingCap': ['Lifepath: the highest contact rating', SWC(31)],
  'lifepath.bestAttributeBonus': ['Lifepath: the best attribute goes up by this, up to its maximum', SWC(32)],
  'lifepath.repeatModules': ['Lifepath: adult modules that may be taken twice', SWC(32)],
  'lifepath.contactKarma': ['Lifepath: Karma per contact rating the contact points don’t cover', SWC(31)],
  'lifepath.raisedAttributeStart': ['Lifepath: an attribute whose metatype maximum is raised starts at this', SWC(32)],
  'lifepath.mundaneEdge': ['Lifepath: Edge a runner neither awakened nor emerged gains', SWC(32)],
  monitorBase: ['Condition monitor boxes before the attribute’s share', HK(38)],
  monitorDivisor: ['A condition monitor adds its attribute divided by this, rounded up', HK(38)],
  initiativeDice: ['Initiative dice a runner rolls before augmentations', HK(67)],
  initiativeDiceMax: ['Never more initiative dice than this', HK(39)],
  astralInitiativeDice: ['Astral initiative dice', HK(161)],
  specDice: ['Dice a specialization adds', HK(92)],
  expertiseDice: ['Dice an expertise adds', HK(92)],
  untrainedPenalty: ['Dice off an attribute for a skill without ranks', HK(93)],
  overflowPerBody: ['Damage Overflow boxes per point of Body', HK(121)],
  attributeAugmentMax: ['An attribute’s augmented value is at most its natural one plus this', HK(37)],
  skillAugmentMax: ['A skill’s dice pool is raised by bonuses at most this much', HK(39)],
  monitorMinimum: ['The fewest boxes a quality (Glass Jaw) lowers a condition monitor to', HK(76)],
  matrixColdDice: ['VR cold sim: initiative dice added to the usual one', HK(179)],
  matrixHotDice: ['VR hot sim: initiative dice added to the usual one', HK(179)],
  moveWalk: ['Metres a Move covers', HK(42)],
  moveSprint: ['Metres a Sprint covers before its hits', HK(44)],
  moveSprintPerHit: ['Metres a Sprint adds per hit', HK(44)],
  unarmedDV: ['Base unarmed Damage Value (Stun)', HK(94)],
  arDrEdgeGap: ['An Attack Rating this far ahead of the Defense Rating (or the reverse) gains a point of Edge', HK(45)],
  meleeArStrength: ['Strength adds to a melee weapon’s Attack Rating', HK(39)],
  builtToughQuality: ['The catalog’s Built Tough quality: a Physical box per level', HK(70)],
  dermalDepositsQuality: ['The catalog’s Dermal Deposits quality: +1 Defense Rating, Physical unarmed damage', HK(71)],
  charismaticDefenseQuality: ['The catalog’s Charismatic Defense quality: Defense Rating from Charisma instead of Body', 'Power Plays p. 85'],
  levelStreet: ['On: each priority gives the values of the row below it (E stays E)', HK(63)],
  levelPrime: ['On: twice the customization Karma', HK(63)],
  levelSwcStreet: ['On: street-level letters, targets and module count below; no illegal gear but cyberdecks', SWC('14–15')],
  'swcStreet.letters': ['Street-level: the priority letters (B, C, C, D, E)', SWC(14)],
  'swcStreet.sumToTen': ['Street-level: sum-to-eight', SWC(15)],
  'swcStreet.pointBuy': ['Street-level: the character points', SWC(15)],
  'swcStreet.modules': ['Street-level: the adult life modules', SWC(15)],
  levelSwcElite: ['On: elite letters, targets and module count below; no Availability cap', SWC(15)],
  'swcElite.letters': ['Elite: the priority letters (A, B, B, C, D)', SWC(15)],
  'swcElite.sumToTen': ['Elite: sum-to-twelve', SWC(15)],
  'swcElite.pointBuy': ['Elite: the character points', SWC(15)],
  'swcElite.modules': ['Elite: the adult life modules', SWC(15)],
  eliteSumToThirteen: ['On, with Elite: sum-to-thirteen, the total of Elite’s own letters, instead of the sum-to-twelve the book prints', HOUSE],
  priorityLetters: ['The priority letters a runner takes, one a column (A, B, C, D and E once each)', HK(63)],
  stackingAdvantage: ['On: a lead of twice the Edge gap gains 2 Edge', SWC(144)],
  strengthInCloseCombat: ['On: Close Combat rolls Strength, and Agility goes into a melee Attack Rating in place of Strength', SWC(150)],
  highStrengthDamage: ['On: high Strength adds to melee and unarmed Damage Values at the steps below', SWC(150)],
  strengthDamageStep1: ['High Strength: the Strength that adds +1 Damage Value', SWC(150)],
  strengthDamageStep2: ['High Strength: the Strength that adds +2 Damage Value', SWC(150)],
  alternateMysticAdept: ['On: a mystic adept gets half a power point per point of Magic, and no Conjuring or Enchanting', SWC(148)],
  twentyQuestions: ['On: Karma at creation for answering ten of the twenty questions', SWC(25)],
  twentyQuestionsKarma: ['Twenty Questions: the Karma it gives', SWC(25)],
  workingForTheMan: ['On: a week of downtime turns Karma into nuyen after creation, at the rate under Advancement', SWC(153)],
  workingForThePeople: ['On: a week of downtime turns nuyen into Karma after creation, at the rate under Advancement', SWC(153)],
  expandedSpecializations: ['On: any number of specializations a skill (still one expertise)', SWC(153)],
  unrestrictedSkillRanks: ['On: no highest skill rank after creation (never at creation)', SWC(153)],
  suprathyroidStacks: ['On: the suprathyroid gland’s bonuses stack with other augmentations’ (the +4 cap still holds)', SWC(149)],
  infectedAllowed: [
    'On: a runner may take the Infected qualities and buy the Infected optional powers with Karma, at creation and after; off: they are hidden from the pickers and refused',
    SWC(104),
  ],
  infectedPowersAtCreation: [
    'On: an Infected runner may buy its type’s optional powers at creation; off: only its one free pick at creation, the rest after (“in general”, p. 105)',
    SWC(105),
  ],
  [CL6_ONLY_KEY]: [
    'On: the catalog also loads the optional data set the admin put in custom/sr6/cl6only/ (records no book prints, each under a source of its own marked Non-canon); off: nothing from it loads. Only the server’s setting counts',
    OPTION,
  ],
  exoticFirstSpecFree: ['On: the first Exotic Weapons specialization costs no skill points or Karma', HOUSE],
  mentorBothAdvantages: [
    'On: a mystic adept gets both the magician’s and the adept’s advantages of its mentor spirit; off: it picks one, for good (CRB Hong Kong pp. 162–163)',
    HOUSE,
  ],
  dataStructureCaps: ['On: Review flags a technomancer’s data structures past the count or level below, a problem a GM can approve', HOUSE],
  'dataStructure.maxCount': ['The most data structures a runner has at creation, with the caps on', HOUSE],
  'dataStructure.maxRating': ['The highest data structure level at creation, with the caps on', HOUSE],
  noUsedCulturedBioware: ['On: cultured bioware can’t be used (or omega) grade; off: it can, as the books print no exclusion', HOUSE],
  restrictMethods: ['On: a runner can only be built with the creation methods allowed below (the table’s own limit, for organised play, say)', HOUSE],
  ...Object.fromEntries(SR6_METHODS.map(m => [`methodAllowed.${m}`, [`${SR6_METHOD_LABELS[m]} may be picked while the limit on methods is on`, HOUSE]])),
  gradeCapAtCreation: [
    'On: Review flags an initiation or submersion grade at creation above the caps below, a problem a GM can approve (a grade is never above Magic or Resonance anyway)',
    HOUSE,
  ],
  'gradeCap.initiation': ['The highest initiation grade at creation, with the caps on', HOUSE],
  'gradeCap.submersion': ['The highest submersion grade at creation, with the caps on', HOUSE],
  'gradeCap.transhuman': ['The highest transhumanist grade at creation, with the caps on', HOUSE],
  transhumanism: [
    'On: a mundane runner buys transhumanist grades for 10 + the next grade in Karma (the initiation price), up to 20, and each gives an Essence hole of 1.0 that augmentations’ Essence is paid from first; off: none',
    SWC(146),
  ],
  adjustOnLoweredMax: [
    'On: adjustment points may also go on an attribute whose metatype maximum is lowered; off: only on raised maxima, Edge, Magic and Resonance (CRB Hong Kong p. 63)',
    HOUSE,
  ],
  pointBuyErrataNuyen: [
    'On: point buy’s nuyen bought with character points goes up to 450,000, the errata version; off: up to 440,000 as printed (Sixth World Companion p. 29)',
    HOUSE,
  ],
  knowledgeLogicIntuition: ['Optional rule (CRB p. 98): free Knowledge points = (Logic + Intuition) × 2; off (default): Logic only (p. 97)', 'CRB p. 98'],
  metatypeSizePricing: [
    'On: a troll-sized runner (troll, cyclops, fomori, giant, minotaur) pays 10% more for everything bought and a dwarf-sized one (dwarf, gnome, hanuman, koborokuru, menehune) 10% more for armor and clothing, added as one line of the nuyen budget; the books price a few metahuman-sized items on their own but print no general rule',
    HOUSE,
  ],
  magicAboveSixByGrade: [
    'On: Magic or Resonance at creation up to the highest plus the initiation or submersion grade; off: the highest alone (CRB Hong Kong p. 65)',
    `${OPTION}, ${HK(167)}`,
  ],
  availabilitySeven: ['On: gear of Availability 7 may be bought at creation; off: 6 at most (CRB Hong Kong p. 66)', HOUSE],
  cargoWithoutSeats: [
    'On: a vehicle’s seats removed add cargo space by the Cargo Factor formula (1.5 CF a seat, 1.25 on a bike)',
    `${OPTION}, Double Clutch p. 126`,
  ],
}
/** A setting's hover text (ABOUT; the per-metatype, per-magic-kind, sum-to-ten, point-buy and grade ones by their key). */
export function aboutOf(key: string): string {
  const grade = key.split(':'),
    part = { essence: 'Essence factor', cost: 'cost factor', avail: 'Availability modifier' }[grade[2] ?? '']
  const [what, where] =
    ABOUT[key] ??
    (key.startsWith('metatypeKarma:')
      ? ['Karma a runner pays to be this metatype (point buy, Karma build, lifepath)', SWC('28, 91')]
      : key.startsWith('pointBuy.startRating:')
        ? ['Point buy: the Magic or Resonance this kind starts at', SWC(29)]
        : key.startsWith('magicKarma:')
          ? [`Karma build: Karma to be this kind, taken from the Karma a runner starts with; ${NO_BOOK}`, KARMA_BUILD]
          : key.startsWith('lifepath.startRating:')
            ? ['Lifepath: the Magic or Resonance this kind starts at', SWC(32)]
            : key.startsWith('letterValue:')
              ? [`Sum to ten: what priority ${key.slice(12)} counts`, SWC(27)]
              : /^pointBuy\.(free|max)\./.test(key)
                ? [`Point buy: ${key.includes('.free.') ? 'the free' : 'the most'} ${key.endsWith('nuyen') ? 'nuyen' : `${key.split('.')[2]} points`}`, SWC(29)]
                : key.startsWith('grade:') && part
                  ? [`${cap(grade[1])} grade: its ${part}`, HK(282)]
                  : ['', ''])
  return what ? `${what} (${where}).` : ''
}

/** The OPTIONAL rules a runner may choose for itself on its Creation method tab (owner, 2026-10-09): any other setting
 *  stays the table's. about: aboutOf. */
export const RUNNER_RULE_KEYS: { key: string; about: string }[] = [
  'startingKarma',
  'expandedContacts',
  'contactKarma',
  'contactPairPerCha',
  'contactRatingMax',
  'maxAvailability',
  'availabilityCapIllegalOnly',
  'karmaSpellsAtCreation',
  'maxKarmaLeft',
  'maxNuyenLeft',
  'ownCarryOver',
  'carryOver.karma',
  'carryOver.nuyen',
  'skillPointsExpertise',
  'qualityMaxCount',
  // the core rulebook's quality rules (CRB Hong Kong)
  'incompetentQuality',
  'sensitiveSystemQuality',
  'sensitiveSystemEssence',
  'attributeMaxFloor',
  'improvedAbilityPower',
  'improvedAbilityFactor',
  'mentorSpiritQuality',
  // levels of play (off: the standard level)
  'levelStreet',
  'levelPrime',
  'levelSwcStreet',
  'levelSwcElite',
  'swcStreet.letters',
  'swcStreet.sumToTen',
  'swcStreet.pointBuy',
  'swcStreet.modules',
  'swcElite.letters',
  'swcElite.sumToTen',
  'swcElite.pointBuy',
  'swcElite.modules',
  'eliteSumToThirteen',
  'priorityLetters',
  // the core rulebook's rules (CRB Hong Kong, the latest printing), each a number a table may change
  'initiativeDiceMax',
  'overflowPerBody',
  'attributeAugmentMax',
  'skillAugmentMax',
  'monitorMinimum',
  'matrixColdDice',
  'matrixHotDice',
  'moveWalk',
  'moveSprint',
  'moveSprintPerHit',
  'unarmedDV',
  'arDrEdgeGap',
  'meleeArStrength',
  // optional rules, off by default
  'stackingAdvantage',
  'strengthInCloseCombat',
  'highStrengthDamage',
  'alternateMysticAdept',
  'twentyQuestions',
  'twentyQuestionsKarma',
  'workingForTheMan',
  'workingForThePeople',
  'expandedSpecializations',
  'unrestrictedSkillRanks',
  'languageMax',
  'fociForcePerMagic',
  'fociBondKarma',
  'suprathyroidStacks',
  'infectedAllowed',
  'infectedPowersAtCreation',
  'strengthDamageStep1',
  'strengthDamageStep2',
  // the owner's house rules and options (2026-10-11)
  'capacityAccessoryEssence',
  'positiveQualityMultiplier',
  'positiveQualityFactor',
  'karmaToNuyenCap',
  'karmaToNuyenMax',
  'exoticFirstSpecFree',
  'mentorBothAdvantages',
  'dataStructureCaps',
  'dataStructure.maxCount',
  'dataStructure.maxRating',
  'noUsedCulturedBioware',
  'gradeCapAtCreation',
  'gradeCap.initiation',
  'gradeCap.submersion',
  'gradeCap.transhuman',
  'transhumanism',
  'adjustOnLoweredMax',
  'pointBuyErrataNuyen',
  'knowledgeLogicIntuition',
  'magicAboveSixByGrade',
  'availabilitySeven',
  'cargoWithoutSeats',
  'metatypeSizePricing',
].map(key => ({ key, about: aboutOf(key) }))
/** A runner file may set only these (mergeRules): a hand-edited one naming any other setting keeps the table's. */
export const isRunnerRuleKey = (key: string) => RUNNER_KEYS.has(key) || METHOD_KEY.test(key)
/** The creation methods' own numbers (point buy, karma build, lifepath, sum to ten): a runner may carry them only through
 *  the Method tab's "Set this up here" (methodFill), standard values, undoable. The one seam: mergeRules. */
const METHOD_KEY = /^(pointBuy\.|karmaBuild\.|lifepath\.|sumToTen|letterValue:|metatypeKarma:|karmaBuildMethod$)/
const RUNNER_KEYS = new Set(RUNNER_RULE_KEYS.map(k => k.key))

/** The rules a runner is built and checked with: the table's (`base`: the server's, or its campaign's own: `layer`) with
 *  the runner's own choices over them, except where its campaign locked the setting. Each setting says where it comes from
 *  (and who locked it). The one function every place reads a runner's rules through: editor, budgets, Review, sheets,
 *  career, export. A nested rule whose parent is off, and the losing one of two conflicting rules, are left out (applyDeps). */
export function runnerRules(base: CreationRules, own: RunnerRule[] = [], locks: RuleLock[] = [], layer: RuleLayer = 'server'): CreationRules {
  return levelRules(applyDeps(mergeRules(base, own, locks, layer)))
}
/** runnerRules before the nested rules and the levels are applied: every stored value (the runner's Creation rules panel
 *  shows a rule set aside with its own). */
export function mergeRules(base: CreationRules, own: RunnerRule[] = [], locks: RuleLock[] = [], layer: RuleLayer = 'server'): CreationRules {
  const lockedBy = new Map(locks.map(l => [l.key, l.by]))
  const out: CreationRules = new Map([...base].map(([k, s]) => [k, { ...s, from: s.from ?? layer, ...(lockedBy.has(k) ? { lockedBy: lockedBy.get(k) } : {}) }]))
  for (const r of own) {
    if (lockedBy.has(r.key) || !isRunnerRuleKey(r.key) || !keyType(r.key)) continue
    if (r.value.trim() === '') {
      out.delete(r.key)
      continue
    }
    const got = rulesFrom([r]).rules.get(r.key)
    if (got) out.set(r.key, { ...got, from: 'runner', ...(r.assumed ? { assumed: true as const } : {}) })
  }
  return out
}
