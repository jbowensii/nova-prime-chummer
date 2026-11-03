// SR6 creation rules: the setting KEYS table (every fixed key, grouped) and the per-metatype / per-magic-kind expansion (see creation.ts).
import { MAGIC_KIND_LABELS, LETTERS, SR6_METHODS, SR6_METHOD_LABELS, type MagicKind, type Sr6Method } from '../../formats/domain/character'
import type { CreationCatalog } from '../../catalog/domain/types'
import { CL6_ONLY_KEY, type CreationKey, type CreationType } from './creation-types'

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
export const GRADES = ['standard', 'alpha', 'beta', 'delta', 'used']
export const AWAKENED = (Object.keys(MAGIC_KIND_LABELS) as MagicKind[]).filter(k => k !== 'mundane')

export const n = (group: string, methods: CreationKey['methods'], rows: [string, string][]): CreationKey[] =>
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
      ['allowAnimalism', 'Animalism: shifters and others buy animalism powers (Bestial Nature)'],
      ['allowSurge', 'SURGE: metagenic qualities and SURGE collectives (Sixth World Companion)'],
    ] as [string, string][]
  ).map(([key, label]): CreationKey => ({ key, label, type: 'bool', group: 'Optional rules', methods: [] })),
  ...n('Optional rules', [], [['animalismMaxAtCreation', 'Animalism: highest animalism grade at creation']]),
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
      ['knowledgeLogicIntuition', 'Optional: (Logic + Intuition) × 2 Knowledge points'],
      ['magicAboveSixByGrade', 'Magic or Resonance at creation up to the highest plus the initiation or submersion grade (option)'],
      ['eliteSumToThirteen', 'Elite: sum-to-thirteen instead of sum-to-twelve (house rule)'],
      ['availabilitySeven', 'Gear of Availability 7 at creation (house rule)'],
      ['cargoWithoutSeats', 'Vehicles: seats removed add cargo space (option)'],
      ['metatypeSizePricing', 'Price modifiers: the metatype’s, qualities’ and ware’s PRICEMOD (troll-sized +10% on everything, dwarf-sized +10% on armor)'],
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
export function cap(s: string) {
  return s[0].toUpperCase() + s.slice(1)
}

// the keys expandKeys adds, by prefix: [prefix, group, methods, label]
export const PER_METATYPE: [string, string, Sr6Method[], (name: string) => string][] = [
  ['metatypeKarma:', 'Metatypes', ['pointbuy', 'karma', 'lifepath'], name => `${name}: karma`],
]
export const PER_MAGIC: [string, string, Sr6Method[], (kind: MagicKind) => string][] = [
  ['pointBuy.startRating:', 'Point buy', ['pointbuy'], k => `Starting Magic or Resonance (point buy): ${MAGIC_KIND_LABELS[k]}`],
  ['magicKarma:', 'Karma build', ['karma'], k => `Karma to be: ${MAGIC_KIND_LABELS[k]}`],
  ['lifepath.startRating:', 'Lifepath', ['lifepath'], k => `Starting Magic or Resonance (lifepath): ${MAGIC_KIND_LABELS[k]}`],
]
export const STATIC = new Map(CREATION_KEYS.map(k => [k.key, k]))

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
