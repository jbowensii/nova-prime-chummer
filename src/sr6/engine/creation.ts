// The table's SR6 creation rules (custom/sr6/creation.xml, public/data/sr6/schema/creation.xsd): every number the core
// rulebook prints only in its text (starting karma, caps, exchange rates, point-buy prices, grades…), entered on the Rules
// page by the admin from their own book: the server's default. A campaign's GM may give it its own (server/campaigns.mjs),
// which its runners use instead. The app ships the standard values (DEFAULTS_PATH; the admin's file holds only what they
// changed); a method whose settings are unset can't be picked (missingFor), and a rule whose setting is unset is
// skipped. Formulas stay in code.
import { MAGIC_KIND_LABELS, LETTERS, type Letter, type MagicKind, type Sr6Method } from '../model/character'

export const CREATION_NS = 'urn:chummer-sr6:config:1'
export type CreationValue = number | boolean | string
/** from: the layer it comes from (runnerRules; unset: the server's); lockedBy: the campaign GM who locked it for its runners;
 *  assumed: a sample runner's, taken from its book's numbers (the book doesn't say). */
export interface CreationSetting { key: string; value: CreationValue; source?: string; page?: number
  from?: RuleLayer; lockedBy?: string; assumed?: true }
export type RuleLayer = 'server' | 'campaign' | 'runner'
export type CreationRules = Map<string, CreationSetting>
export type CreationType = 'number' | 'bool' | 'quality' | 'letters'
/** methods: the creation methods that need the setting set ('all': every one; []: optional). */
export interface CreationKey { key: string; label: string; type: CreationType; group: string; methods: Sr6Method[] | 'all' }
/** What expandKeys and missingFor read from the catalog (src/sr6/engine/data.ts's Sr6Data has this shape). */
export interface CreationCatalog {
  priorities: Partial<Record<Letter, unknown>>
  metatypes: Record<string, { id: string; name: string }>
  lifemodules: Record<string, { stage: string }>
}

/** The groups, in the order the creation rules form shows them. */
export const CREATION_GROUPS = ['General', 'Levels of play', 'Karma prices', 'Advancement', 'Nuyen', 'Sum to ten', 'Point buy', 'Karma build', 'Metatypes', 'Lifepath', 'Augmentation grades', 'Derived values', 'Optional rules']
const GRADES = ['standard', 'alpha', 'beta', 'delta', 'used']
const AWAKENED = (Object.keys(MAGIC_KIND_LABELS) as MagicKind[]).filter(k => k !== 'mundane')

const n = (group: string, methods: CreationKey['methods'], rows: [string, string][]): CreationKey[] =>
  rows.map(([key, label]) => ({ key, label, type: 'number', group, methods }))

/** Every fixed setting. Per-metatype and per-magic-kind ones come from expandKeys. */
export const CREATION_KEYS: CreationKey[] = [
  ...n('General', 'all', [['startingKarma', 'Starting karma'], ['qualityNetBonusCap', 'Most net karma from qualities'],
    ['qualityMaxCount', 'Most paid qualities']]),
  { key: 'oneAttributeAtMax', label: 'Only one attribute at its maximum', type: 'bool', group: 'General', methods: 'all' },
  // optional: unset, the adjustment-target rule is skipped with a warning
  ...n('General', [], [['attributeBaseMax', 'Adjustment points go on attributes whose metatype maximum is above']]),
  ...n('General', 'all', [['skillCap', 'Highest skill rank'], ['skillCapAptitude', 'Highest skill rank with the aptitude quality']]),
  { key: 'aptitudeQuality', label: 'Aptitude quality', type: 'quality', group: 'General', methods: 'all' },
  { key: 'exceptionalQuality', label: 'Exceptional (Attribute) quality: +1 to the maximum of the attribute its note names, once per attribute (unset: none)', type: 'quality', group: 'General', methods: [] },
  { key: 'incompetentQuality', label: 'Incompetent (Skill) quality: no ranks in the skill its note names (unset: none)', type: 'quality', group: 'General', methods: [] },
  { key: 'sensitiveSystemQuality', label: 'Sensitive System quality: no Magic or Resonance; ware Essence times the factor below (unset: none)', type: 'quality', group: 'General', methods: [] },
  { key: 'improvedAbilityPower', label: 'Improved Ability adept power: its skill boosted at most to the factor below (unset: none)', type: 'quality', group: 'General', methods: [] },
  ...n('General', [], [['languageMax', 'Highest language level but Native (unset: no cap)'], ['fociForcePerMagic', 'Foci: their Force together at most Magic times']]),
  { key: 'fociBondKarma', label: 'Foci cost their bonding karma at creation', type: 'bool', group: 'General', methods: [] },
  ...n('General', [], [['improvedAbilityFactor', 'Improved Ability: the boosted skill at most its rank times (rounded up)']]),
  ...n('General', [], [['sensitiveSystemEssence', 'Sensitive System: cyberware, bioware and nanoware Essence times'],
    ['attributeMaxFloor', 'Lowest a quality lowers an attribute’s maximum to (Impaired; unset: no floor)']]),
  { key: 'manyTalentsQuality', label: 'Many Talents quality: two attributes at their maximum (unset: none)', type: 'quality', group: 'General', methods: [] },
  { key: 'manySkillsQuality', label: 'Many Skills quality: two skills at the highest rank (unset: none)', type: 'quality', group: 'General', methods: [] },
  { key: 'availabilityCapIllegalOnly', label: 'The Availability cap holds only illegal gear (the core rulebook’s first printing)', type: 'bool', group: 'General', methods: [] },
  { key: 'oneSkillAtMax', label: 'Only one skill at the highest rank', type: 'bool', group: 'General', methods: [] },
  // (CRB pp. 285–286's tables print an enhancement's Essence and its Capacity; the books' samples print a host's Essence
  // alone: off, the owner to rule)
  { key: 'capacityAccessoryEssence', label: 'An accessory fitted into a host’s Capacity costs its own Essence too', type: 'bool', group: 'Augmentation grades', methods: [] },
  // optional (CRB p. 66's list of what the customization Karma buys doesn't name them; Commlink6: an option, off)
  { key: 'karmaSpellsAtCreation', label: 'Extra spells, rituals and complex forms bought with the customization Karma', type: 'bool', group: 'General', methods: [] },
  ...n('General', 'all', [['skillPointsSpec', 'Skill points for a specialization']]),
  // optional: unset, an expertise at creation is bought with the customization karma (advance.expertise)
  ...n('General', [], [['skillPointsExpertise', 'Skill points for an expertise (unset: bought with karma at the advancement price)']]),
  ...n('General', 'all', [['magicMax', 'Highest Magic or Resonance'], ['essence', 'Starting Essence'], ['contactPointsPerCha', 'Contact points per Charisma'],
    ['knowledgePerLog', 'Free knowledge skills per Logic'], ['maxAvailability', 'Highest Availability'],
    ['maxNuyenLeft', 'Most nuyen kept after creation'],
    ['freeSpellsPerMagic', 'Free spells per Magic'], ['freeFormsPerResonance', 'Free complex forms per Resonance']]),
  // optional (the core rulebook prints no number): unset, no limit
  ...n('General', [], [['maxKarmaLeft', 'Most karma kept after creation (unset: no limit)']]),
  // optional, the Sixth World Companion's expanded contact rules (unset contactKarma: off, each rating up to Charisma)
  ...n('General', [], [['contactKarma', 'Karma per contact point past the points or past a contact’s pair cap (unset: not offered)'],
    ['contactPairPerCha', 'A contact’s connection + loyalty up to Charisma times'], ['contactRatingMax', 'Highest contact rating (unset: Charisma)']]),
  ...n('Karma prices', 'all', [['karmaAttrPerRank', 'Attribute: karma per rank, times the new rating'],
    ['karmaSkillPerRank', 'Skill: karma per rank, times the new rank'], ['karmaSpec', 'Specialization'],
    ['karmaKnowledge', 'Knowledge or language rank'], ['karmaSpell', 'Extra spell or ritual'], ['karmaForm', 'Extra complex form'],
    ['karmaInitiationBase', 'Initiation or submersion: base'], ['karmaInitiationPerGrade', 'Initiation or submersion: per grade']]),
  ...n('Karma prices', [], [['positiveQualityFactor', 'Positive qualities cost their karma times (unset: 1)']]),
  // optional: unset, a style or technique counts 0 karma (Review warns) and can't be bought after creation
  ...n('Karma prices', [], [['karmaMartialArt', 'Martial arts style'], ['karmaTechnique', 'Martial arts technique (a style’s signature one is free)']]),
  // career play (S3; the Karma prices above are the career prices too): optional, unset refuses the spend that needs it
  // (a cap: not applied; nuyen to karma: the optional rule is off)
  ...n('Advancement', [], [['advance.expertise', 'Expertise after creation'],
    ['advance.expertiseRank', 'Lowest skill rank for an expertise (unset: none)'],
    ['advance.qualityFactor', 'A positive quality after creation costs its karma times'],
    ['advance.buyOffFactor', 'Buying off a negative quality costs its karma times'],
    ['advance.skillMax', 'Highest skill rank after creation (unset: no cap)'],
    ['advance.powerPoint', 'Karma per power point (mystic adepts)'],
    ['advance.karmaToNuyenRate', 'Nuyen per karma after creation (unset: not offered)'],
    ['advance.nuyenToKarmaRate', 'Nuyen per karma, nuyen to karma (optional rule; unset: off)']]),
  ...n('Nuyen', 'all', [['karmaToNuyenRate', 'Nuyen per karma'], ['karmaToNuyenRateInDebt', 'Nuyen per karma with the in-debt quality']]),
  { key: 'inDebtQuality', label: 'In-debt quality', type: 'quality', group: 'Nuyen', methods: 'all' },
  ...n('Nuyen', [], [['karmaToNuyenMax', 'Most karma turned into nuyen (unset: no limit)']]), // optional, as maxKarmaLeft
  ...n('Nuyen', 'all', [['fakeSinPerRating', 'Fake SIN: nuyen per rating'], ['licencePerRating', 'Fake licence: nuyen per rating']]),
  ...n('Sum to ten', ['sumtoten'], [['sumToTenTarget', 'The letters’ values add up to at most'],
    ...LETTERS.map(l => [`letterValue:${l}`, `Value of priority ${l}`] as [string, string])]),
  ...n('Point buy', ['pointbuy'], [['pointBuy.total', 'Character points'], ['pointBuy.awakened', 'Character points to be awakened or emerged'],
    ...(['attribute', 'skill', 'adjustment', 'nuyen'] as const).flatMap(p => [
      [`pointBuy.free.${p}`, `Free ${p === 'nuyen' ? 'nuyen' : `${p} points`}`], [`pointBuy.max.${p}`, `Most ${p === 'nuyen' ? 'nuyen' : `${p} points`}`]] as [string, string][]),
    ['pointBuy.cost.attribute', 'Character points per attribute point'], ['pointBuy.cost.skill', 'Character points per skill point'],
    ['pointBuy.cost.adjustment', 'Character points per adjustment point'], ['pointBuy.cost.powerPoint', 'Character points per power point'],
    ['pointBuy.cost.mysticPowerPoint', 'Character points per power point (mystic adept)'], ['pointBuy.cost.spell', 'Character points per spell'],
    ['pointBuy.cost.complexForm', 'Character points per complex form'], ['pointBuy.nuyenPerCp', 'Nuyen per character point']]),
  { key: 'pointBuy.oneSpecialization', label: 'Only one specialization', type: 'bool', group: 'Point buy', methods: ['pointbuy'] },
  ...n('Karma build', ['karma'], [['karmaBuild.start', 'Starting karma (karma build)'], ['karmaBuild.startRating', 'Starting Magic or Resonance (karma build)']]),
  ...n('Lifepath', ['lifepath'], [['lifepath.moduleCount', 'Adult life modules to take'], ['lifepath.contactRatingCap', 'Highest contact rating']]),
  // optional: unset, the rule is off (no raise, no module twice, contact ratings past the points aren't bought)
  ...n('Lifepath', [], [['lifepath.bestAttributeBonus', 'Best attribute raised by (unset: no raise)'],
    ['lifepath.repeatModules', 'Adult modules that may be taken twice (unset: none)'],
    ['lifepath.contactKarma', 'Karma per contact rating past the contact points (unset: not offered)'],
    ['lifepath.raisedAttributeStart', 'Attributes whose metatype maximum is above the base maximum start at (unset: 1)'],
    ['lifepath.mundaneEdge', 'Edge a runner neither awakened nor emerged gains (unset: none)']]),
  ...GRADES.flatMap(g => n('Augmentation grades', [], [[`grade:${g}:essence`, `${cap(g)}: Essence times`], [`grade:${g}:cost`, `${cap(g)}: cost times`],
    [`grade:${g}:avail`, `${cap(g)}: Availability plus`]])),
  // the constants in derive.ts's formulas (optional: unset, the value shows empty)
  ...n('Derived values', [], [['monitorBase', 'Condition monitor: boxes before the attribute'],
    ['monitorDivisor', 'Condition monitor: the attribute divided by (rounded up)'], ['initiativeDice', 'Initiative dice'],
    ['initiativeDiceMax', 'Most initiative dice (unset: no cap)'],
    ['astralInitiativeDice', 'Astral initiative dice'], ['specDice', 'Dice for a specialization'], ['expertiseDice', 'Dice for an expertise'],
    ['untrainedPenalty', 'Dice off the attribute for an untrained skill'],
    ['overflowPerBody', 'Damage Overflow boxes per point of Body'],
    ['attributeAugmentMax', 'Most an attribute’s augmented value is above its natural one (unset: no cap)'],
    ['skillAugmentMax', 'Most a skill’s dice pool is raised by bonuses (unset: no cap)'],
    ['monitorMinimum', 'Fewest boxes a quality can lower a condition monitor to (unset: no floor)'],
    ['matrixColdDice', 'VR initiative, cold sim: dice added to the usual ones'], ['matrixHotDice', 'VR initiative, hot sim: dice added to the usual ones'],
    ['moveWalk', 'Metres for a Move'], ['moveSprint', 'Metres for a Sprint'], ['moveSprintPerHit', 'Sprint: metres more per hit'],
    ['unarmedDV', 'Unarmed Damage Value (Stun)'],
    ['arDrEdgeGap', 'Attack Rating against Defense Rating: the lead that gains a point of Edge']]),
  // levels of play (each off: the standard level). The core rulebook's (CRB Hong Kong p. 63) and the Sixth World
  // Companion's (pp. 14–15), whose numbers replace sumToTenTarget, pointBuy.total, lifepath.moduleCount and
  // priorityLetters while one is on (levelRules)
  { key: 'levelStreet', label: 'Street level: each priority gives the values of the row below (E stays E)', type: 'bool', group: 'Levels of play', methods: [] },
  { key: 'levelPrime', label: 'Prime runner: twice the customization karma', type: 'bool', group: 'Levels of play', methods: [] },
  { key: 'levelSwcStreet', label: 'Street-level (Sixth World Companion): the letters, targets and module count below; no illegal gear but cyberdecks', type: 'bool', group: 'Levels of play', methods: [] },
  ...n('Levels of play', [], [['swcStreet.sumToTen', 'Street-level: the letters’ values add up to at most'], ['swcStreet.pointBuy', 'Street-level: character points'],
    ['swcStreet.modules', 'Street-level: adult life modules']]),
  { key: 'swcStreet.letters', label: 'Street-level: the priority letters', type: 'letters', group: 'Levels of play', methods: [] },
  { key: 'levelSwcElite', label: 'Elite (Sixth World Companion): the letters, targets and module count below; no Availability cap', type: 'bool', group: 'Levels of play', methods: [] },
  ...n('Levels of play', [], [['swcElite.sumToTen', 'Elite: the letters’ values add up to at most'], ['swcElite.pointBuy', 'Elite: character points'],
    ['swcElite.modules', 'Elite: adult life modules']]),
  { key: 'swcElite.letters', label: 'Elite: the priority letters', type: 'letters', group: 'Levels of play', methods: [] },
  { key: 'priorityLetters', label: 'The priority letters a runner takes, one a column (unset: A, B, C, D and E once each)', type: 'letters', group: 'Levels of play', methods: [] },
  { key: 'meleeArStrength', label: 'Strength adds to a melee weapon’s Attack Rating', type: 'bool', group: 'Derived values', methods: [] },
  // the books' optional rules (each off unless the table turns it on; their pages in RUNNER_RULE_KEYS and the defaults)
  { key: 'stackingAdvantage', label: 'Stacking Advantage: a lead of twice the gap gains 2 Edge', type: 'bool', group: 'Optional rules', methods: [] },
  { key: 'strengthInCloseCombat', label: 'Close Combat rolls Strength; Agility goes into the melee Attack Ratings', type: 'bool', group: 'Optional rules', methods: [] },
  { key: 'highStrengthDamage', label: 'High Strength adds to melee and unarmed Damage Values', type: 'bool', group: 'Optional rules', methods: [] },
  { key: 'alternateMysticAdept', label: 'Alternate Mystic Adept: half a power point per point of Magic, and per Magic raised; no Conjuring or Enchanting', type: 'bool', group: 'Optional rules', methods: [] },
  { key: 'twentyQuestions', label: 'Twenty Questions: karma at creation for answering ten of the questions', type: 'bool', group: 'Optional rules', methods: [] },
  ...n('Optional rules', [], [['twentyQuestionsKarma', 'Twenty Questions: the karma']]),
  { key: 'workingForTheMan', label: 'Working for the Man: karma turned into nuyen after creation, at the rate under Advancement', type: 'bool', group: 'Optional rules', methods: [] },
  { key: 'workingForThePeople', label: 'Working for the People: nuyen turned into karma after creation, at the rate under Advancement', type: 'bool', group: 'Optional rules', methods: [] },
  { key: 'expandedSpecializations', label: 'Expanded Specializations: any number of specializations a skill (one expertise)', type: 'bool', group: 'Optional rules', methods: [] },
  { key: 'unrestrictedSkillRanks', label: 'Unrestricted Skill Ranks: no highest skill rank after creation', type: 'bool', group: 'Optional rules', methods: [] },
  { key: 'suprathyroidStacks', label: 'Suprathyroid gland bonuses stack with other augmentations’', type: 'bool', group: 'Optional rules', methods: [] },
  ...n('Optional rules', [], [['strengthDamageStep1', 'High Strength: Strength for +1 Damage Value'], ['strengthDamageStep2', 'High Strength: Strength for +2 Damage Value']]),
  { key: 'builtToughQuality', label: 'Built Tough quality: a Physical box per level (unset: none)', type: 'quality', group: 'Derived values', methods: [] },
  { key: 'dermalDepositsQuality', label: 'Dermal Deposits quality: +1 Defense Rating (unset: none)', type: 'quality', group: 'Derived values', methods: [] },
  { key: 'charismaticDefenseQuality', label: 'Charismatic Defense quality: Defense Rating from Charisma, not Body (unset: none)', type: 'quality', group: 'Derived values', methods: [] },
]
function cap(s: string) { return s[0].toUpperCase() + s.slice(1) }

// the keys expandKeys adds, by prefix: [prefix, group, methods, label]
const PER_METATYPE: [string, string, Sr6Method[], (name: string) => string][] = [
  ['metatypeKarma:', 'Metatypes', ['pointbuy', 'karma', 'lifepath'], name => `${name}: karma`]]
const PER_MAGIC: [string, string, Sr6Method[], (kind: MagicKind) => string][] = [
  ['pointBuy.startRating:', 'Point buy', ['pointbuy'], k => `Starting Magic or Resonance (point buy): ${MAGIC_KIND_LABELS[k]}`],
  ['magicKarma:', 'Karma build', ['karma'], k => `Karma to be: ${MAGIC_KIND_LABELS[k]}`],
  ['lifepath.startRating:', 'Lifepath', ['lifepath'], k => `Starting Magic or Resonance (lifepath): ${MAGIC_KIND_LABELS[k]}`]]
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
export interface CreationRow { key: string; value: string; source?: string; page?: number | string }

/** The rules from stored rows (a creation.xml's settings, or a campaign's own). A value that isn't of its key's type, or an
 *  unknown key, is an error and is skipped. */
export function rulesFrom(rows: CreationRow[]): { rules: CreationRules; errors: string[] } {
  const rules: CreationRules = new Map(), errors: string[] = []
  for (const { key, value: raw, source, page: p } of rows) {
    const type = keyType(key)
    if (!type) { errors.push(`“${key}” isn’t a creation setting.`); continue }
    const value = typed(type, raw)
    if (value === undefined) { errors.push(`${key}: “${raw}” isn’t ${type === 'bool' ? 'true or false' : type === 'number' ? 'a number' : type === 'letters' ? 'five priority letters (ABCDE)' : 'a quality id'}.`); continue }
    const page = Number(p) || undefined
    rules.set(key, { key, value, ...(source ? { source } : {}), ...(page ? { page } : {}) })
  }
  return { rules, errors }
}

/** The rules in a creation.xml (see rulesFrom). */
export function parseCreation(xml: string): { rules: CreationRules; errors: string[] } {
  const doc = new DOMParser().parseFromString(xml, 'text/xml'), root = doc.documentElement
  if (doc.getElementsByTagName('parsererror').length || root.localName !== 'creation' || root.namespaceURI !== CREATION_NS)
    return { rules: new Map(), errors: ['The saved creation rules file isn’t a creation rules document.'] }
  return rulesFrom([...root.children].filter(e => e.localName === 'setting').map(el => ({ key: el.getAttribute('key') ?? '',
    value: el.getAttribute('value') ?? '', source: el.getAttribute('source') || undefined, page: el.getAttribute('page') ?? undefined })))
}

export const num = (cr: CreationRules, key: string) => { const v = cr.get(key)?.value; return typeof v === 'number' ? v : undefined }
export const flag = (cr: CreationRules, key: string) => { const v = cr.get(key)?.value; return typeof v === 'boolean' ? v : undefined }
export const str = (cr: CreationRules, key: string) => { const v = cr.get(key)?.value; return typeof v === 'string' ? v : undefined }

/** The levels of play that replace other settings' values while on (the Sixth World Companion's Alternate Power Levels,
 *  pp. 14–15): the level's key, then [the setting it replaces, the level's own setting holding the value]. */
export const LEVELS: [string, [string, string][]][] = [
  ['levelSwcStreet', [['sumToTenTarget', 'swcStreet.sumToTen'], ['pointBuy.total', 'swcStreet.pointBuy'], ['lifepath.moduleCount', 'swcStreet.modules'], ['priorityLetters', 'swcStreet.letters']]],
  ['levelSwcElite', [['sumToTenTarget', 'swcElite.sumToTen'], ['pointBuy.total', 'swcElite.pointBuy'], ['lifepath.moduleCount', 'swcElite.modules'], ['priorityLetters', 'swcElite.letters']]],
]
/** The rules with a level of play that is on put in place: its own values (with its source and page) instead of the
 *  settings they replace (a value the level leaves unset keeps the setting's). Two levels on: the later one's. */
export function levelRules(cr: CreationRules): CreationRules {
  const on = LEVELS.filter(([k]) => flag(cr, k))
  if (!on.length) return cr
  const out: CreationRules = new Map(cr)
  for (const [, pairs] of on) for (const [key, from] of pairs) {
    const v = cr.get(from)
    if (v) out.set(key, { ...v, key })
  }
  return out
}
export const cite = (cr: CreationRules, key: string): { source?: string; page?: number } => {
  const s = cr.get(key)
  return { ...(s?.source ? { source: s.source } : {}), ...(s?.page ? { page: s.page } : {}) }
}

/** What `method` still needs before a runner can use it: its unset settings (and every method's), then
 *  "priorities A–E" (priority, sum-to-ten) when a letter's row is missing, "life modules" (lifepath) with no opening ones. */
export function missingFor(method: Sr6Method, cr: CreationRules, data: CreationCatalog): string[] {
  const out = expandKeys(data).filter(k => (k.methods === 'all' || k.methods.includes(method)) && !cr.has(k.key)).map(k => k.key)
  if ((method === 'priority' || method === 'sumtoten') && LETTERS.some(l => !data.priorities[l])) out.push('priorities A–E')
  if (method === 'lifepath' && !Object.values(data.lifemodules).some(m => m.stage === 'opening')) out.push('life modules')
  return out
}

/** A settings file someone picked to load into the creation rules form (the creation.xml format): every row the server
 *  would take, typed as rulesFrom does. fatal: it isn't a creation rules file at all (nothing loads); errors: the rows (or
 *  a row's source or page) left out, each said in words. Nothing is saved: the form shows it for review. */
export function readSettingsFile(xml: string, name: string): { rules: CreationRules; errors: string[]; fatal?: string } {
  const doc = new DOMParser().parseFromString(xml, 'text/xml'), root = doc.documentElement
  if (doc.getElementsByTagName('parsererror').length || root.localName !== 'creation' || root.namespaceURI !== CREATION_NS)
    return { rules: new Map(), errors: [], fatal: `${name} isn’t a creation rules file (an sr6:creation document, like custom/sr6/creation.xml).` }
  const els = [...root.children].filter(e => e.localName === 'setting')
  if (els.length > 500) return { rules: new Map(), errors: [], fatal: `${name} has ${els.length} settings; 500 at most.` }
  const errors: string[] = [], seen = new Set<string>(), rows: CreationRow[] = []
  for (const el of els) {
    const key = el.getAttribute('key') ?? '', value = (el.getAttribute('value') ?? '').trim()
    let source = el.getAttribute('source') ?? undefined, page = el.getAttribute('page') ?? undefined
    if (seen.has(key)) { errors.push(`${key} is set twice: the first one is kept.`); continue }
    seen.add(key)
    if (value.length > 200) { errors.push(`${key}: the value is longer than 200 characters.`); continue }
    if (source !== undefined && !/^[A-Z][A-Z0-9-]{0,19}$/.test(source)) { errors.push(`${key}: the source “${source}” isn’t a book id such as CRB; left out.`); source = undefined }
    if (page !== undefined && !/^[1-9]\d{0,5}$/.test(page)) { errors.push(`${key}: the page “${page}” isn’t a whole number from 1; left out.`); page = undefined }
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

/** A runner's own choice of a creation setting (Sr6Character.rules): `value` as stored ('' turns the setting off);
 *  assumed: a sample runner's, from its book's numbers (the book doesn't say). */
export interface RunnerRule { key: string; value: string; assumed?: true; source?: string; page?: number }
/** A setting a campaign's GM (or the admin) locked: its runners can't choose their own. */
export interface RuleLock { key: string; by: string }

/** The OPTIONAL rules a runner may choose for itself on its Creation method tab (owner, 2026-10-09, as Commlink6 does):
 *  each with the book option it stands for. Any other setting stays the table's. */
export const RUNNER_RULE_KEYS: { key: string; about: string }[] = [
  { key: 'startingKarma', about: '50 customization Karma (CRB Hong Kong p. 66); a prime runner doubles it (Levels of play)' },
  { key: 'contactKarma', about: 'The Sixth World Companion’s expanded contacts (SWC p. 161): off turns them off' },
  { key: 'contactPairPerCha', about: 'Expanded contacts: a contact’s pair cap' },
  { key: 'contactRatingMax', about: 'Expanded contacts: the hard cap' },
  { key: 'maxAvailability', about: 'No gear of Availability 7 or higher at creation (CRB Hong Kong p. 66); the elite level lifts it' },
  { key: 'availabilityCapIllegalOnly', about: 'The 2019 printing’s reading (p. 66); Hong Kong caps every item (off)' },
  { key: 'karmaSpellsAtCreation', about: 'Spells and complex forms can’t be bought during character generation (CRB Hong Kong p. 68’s footnote; the 2019 printing had none): off' },
  { key: 'maxKarmaLeft', about: 'The City Editions (CRB Hong Kong p. 66)' },
  { key: 'maxNuyenLeft', about: 'No more than 5,000 nuyen left after creation (CRB Hong Kong p. 68)' },
  { key: 'skillPointsExpertise', about: 'An expertise with skill points instead of the customization Karma (no book prints it: the owner’s option)' },
  { key: 'qualityMaxCount', about: 'No more than six qualities at creation (CRB Hong Kong p. 66)' },
  // the core rulebook's quality rules (CRB Hong Kong)
  { key: 'incompetentQuality', about: 'No ranks in the selected skill, selected once (CRB Hong Kong pp. 76–77)' },
  { key: 'sensitiveSystemQuality', about: 'No Magic or Resonance; ware Essence doubled (CRB Hong Kong p. 78)' },
  { key: 'sensitiveSystemEssence', about: 'Essence costs doubled for cyberware, bioware and nanoware, not geneware (CRB Hong Kong p. 78)' },
  { key: 'attributeMaxFloor', about: 'Impaired lowers a maximum to a minimum of 2 (CRB Hong Kong p. 76)' },
  { key: 'improvedAbilityPower', about: 'A rank in the skill; combat skill 1.0 PP a level, other skills 0.5 (CRB Hong Kong p. 157)' },
  { key: 'improvedAbilityFactor', about: 'At most 1.5 times the original rank, rounded up, or the augmented maximum (CRB Hong Kong p. 157)' },
  // levels of play (off: the standard level)
  { key: 'levelStreet', about: 'Low-level street runners: the values of the row below the priority chosen (CRB Hong Kong p. 63), off' },
  { key: 'levelPrime', about: 'Prime runner: customization Karma doubled, 50 to 100 (CRB Hong Kong p. 63), off' },
  { key: 'levelSwcStreet', about: 'Street-level: B, C, C, D, E; sum-to-eight, no A; 80 points; 6 modules; no illegal items but cyberdecks (Sixth World Companion pp. 14–15), off' },
  { key: 'levelSwcElite', about: 'Elite: A, B, B, C, D; sum-to-twelve; 120 points; 10 modules; no availability restrictions (Sixth World Companion p. 15), off' },
  { key: 'priorityLetters', about: 'A, B, C, D and E once each (CRB Hong Kong p. 63); a level of play sets its own' },
  // the core rulebook's rules (CRB Hong Kong, the latest printing), each a number a table may change
  { key: 'initiativeDiceMax', about: 'Never more than 5D6 Initiative Dice (CRB Hong Kong p. 39); off: no cap' },
  { key: 'overflowPerBody', about: 'Dead at (Body × 2) boxes of Overflow (CRB Hong Kong p. 121)' },
  { key: 'attributeAugmentMax', about: 'An adjusted attribute is never above its rank + 4 (CRB Hong Kong p. 37); off: no cap' },
  { key: 'skillAugmentMax', about: 'A skill’s augmented increase is never above +4 (CRB Hong Kong p. 39); off: no cap' },
  { key: 'monitorMinimum', about: 'Glass Jaw lowers the Stun monitor down to a minimum of 2 (CRB Hong Kong p. 76)' },
  { key: 'matrixColdDice', about: 'VR cold sim: +1D6 on the usual 1D6 (CRB Hong Kong p. 179)' },
  { key: 'matrixHotDice', about: 'VR hot sim: +2D6 on the usual 1D6 (CRB Hong Kong p. 179)' },
  { key: 'moveWalk', about: 'A Move is 10 metres (CRB Hong Kong p. 42)' },
  { key: 'moveSprint', about: 'A Sprint starts at 15 metres (CRB Hong Kong p. 44)' },
  { key: 'moveSprintPerHit', about: 'A Sprint goes 1 metre further a hit (CRB Hong Kong p. 44)' },
  { key: 'unarmedDV', about: 'Base unarmed damage is 2S (CRB Hong Kong p. 94)' },
  { key: 'arDrEdgeGap', about: 'A lead of 4 or more gains a point of Edge (CRB Hong Kong p. 45)' },
  { key: 'meleeArStrength', about: 'Characters add their Strength to a melee weapon’s Attack Rating (CRB Hong Kong p. 39)' },
  // optional rules, off by default
  { key: 'stackingAdvantage', about: 'Sixth World Companion p. 144, optional (off): 2 Edge for a lead of 8' },
  { key: 'strengthInCloseCombat', about: 'Sixth World Companion p. 150, optional (off)' },
  { key: 'highStrengthDamage', about: 'Sixth World Companion p. 150, optional (off)' },
  { key: 'alternateMysticAdept', about: '0.5 power points a point of Magic, at creation and after; no conjuring or enchanting (Sixth World Companion p. 148, optional, off)' },
  { key: 'twentyQuestions', about: '3 Karma at character generation for answering ten questions (Sixth World Companion p. 25, optional, off)' },
  { key: 'twentyQuestionsKarma', about: 'Twenty Questions: 3 Karma (Sixth World Companion p. 25)' },
  { key: 'workingForTheMan', about: 'A week of downtime turns 1 Karma into 2,000 nuyen (Sixth World Companion p. 153, optional, off)' },
  { key: 'workingForThePeople', about: 'A week of downtime turns 2,000 nuyen into 1 Karma (Sixth World Companion p. 153, optional, off)' },
  { key: 'expandedSpecializations', about: 'No limit to specializations; still one expertise a skill (Sixth World Companion p. 153, optional, off)' },
  { key: 'unrestrictedSkillRanks', about: 'No rank limit after creation; never at creation (Sixth World Companion p. 153, optional, off)' },
  { key: 'languageMax', about: 'Advancement goes to Expert (3); Native only free at creation, one (CRB Hong Kong pp. 67, 99)' },
  { key: 'fociForcePerMagic', about: 'No more foci than Magic, none of Force above Magic, their Force together at most Magic × 5 (CRB Hong Kong p. 154)' },
  { key: 'fociBondKarma', about: 'A focus is used only once bonded, for its table’s Karma (CRB Hong Kong pp. 154, 168)' },
  { key: 'suprathyroidStacks', about: 'Suprathyroid Bonuses Stack: the gland ignores the other augmentations’ stacking limits, not the +4 (Sixth World Companion p. 149, optional, off)' },
  { key: 'strengthDamageStep1', about: 'High Strength: +1 at Strength 7 (Sixth World Companion p. 150)' },
  { key: 'strengthDamageStep2', about: 'High Strength: +2 at Strength 10 (Sixth World Companion p. 150)' },
]

/** The rules a runner is built and checked with: the table's (`base`: the server's, or its campaign's own: `layer`) with
 *  the runner's own choices over them, except where its campaign locked the setting. Each setting says where it comes from
 *  (and who locked it). The one function every place reads a runner's rules through: editor, budgets, Review, sheets,
 *  career, export. */
export function runnerRules(base: CreationRules, own: RunnerRule[] = [], locks: RuleLock[] = [], layer: RuleLayer = 'server'): CreationRules {
  const lockedBy = new Map(locks.map(l => [l.key, l.by]))
  const out: CreationRules = new Map([...base].map(([k, s]) => [k, { ...s, from: s.from ?? layer, ...(lockedBy.has(k) ? { lockedBy: lockedBy.get(k) } : {}) }]))
  for (const r of own) {
    if (lockedBy.has(r.key) || !keyType(r.key)) continue
    if (r.value.trim() === '') { out.delete(r.key); continue }
    const got = rulesFrom([r]).rules.get(r.key)
    if (got) out.set(r.key, { ...got, from: 'runner', ...(r.assumed ? { assumed: true as const } : {}) })
  }
  return levelRules(out)
}