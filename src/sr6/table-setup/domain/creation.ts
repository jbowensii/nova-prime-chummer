// The table's SR6 creation rules (custom/sr6/creation.xml, public/data/sr6/schema/creation.xsd): every number the core
// rulebook prints only in its text (starting karma, caps, exchange rates, point-buy prices, grades…). The app ships the
// standard values with their pages (DEFAULTS_PATH, public/data/sr6/creation-defaults.xml); the admin changes them on the
// Table setup page (#/sr6/table), and their file holds only what they changed: the server's default. A campaign's GM may
// give it its own (server/campaigns.mjs), which its runners use instead, and a runner may choose the optional ones in
// RUNNER_RULE_KEYS. A method whose settings are unset can't be picked (missingFor), and a rule whose setting is unset is
// skipped. Formulas stay in code.
import { LETTERS, type RunnerRule, type Sr6Method } from '../../formats/domain/character'
import { SOURCE_ID } from '../../../core/shared/source'
import type { CreationCatalog } from '../../catalog/domain/types'
import { CREATION_NS, type CreationRules, type RuleLayer } from './creation-types'
import { expandKeys, keyType } from './creation-keys'
import { type CreationRow, parseCreation, rulesFrom } from './creation-parse'
import { flag, levelRules } from './creation-levels'
import { RULE_DEPS, applyDeps } from './creation-deps'
import { aboutOf } from './creation-about'
export { CL6_ONLY_KEY, CREATION_NS, TRANSHUMAN_MAX } from './creation-types'
export type { CreationKey, CreationRules, CreationSetting, CreationType, CreationValue, RuleLayer } from './creation-types'
export { CREATION_GROUPS, CREATION_KEYS, expandKeys, keyType } from './creation-keys'
export { parseCreation, rulesFrom } from './creation-parse'
export type { CreationRow } from './creation-parse'
export { LEVELS, POWER_LEVEL_KEYS, SETS, flag, levelRules, n0, num, powerLevelOf, powerLevelRules, str } from './creation-levels'
export type { PowerLevel } from './creation-levels'
export { PRESET_KEYS, RULE_DEPS, RULE_PRESETS, applyDeps, blockedBy, conflictsOf, isOn, presetChanges } from './creation-deps'
export type { RuleDeps, RulePreset } from './creation-deps'
export { aboutOf } from './creation-about'

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

/** The runner rules that activate `method` for this runner only (the Method tab's pick-then-activate): its missing settings
 *  from the standard values (methodFill), plus — when the table restricts methods and this one isn't allowed — an assumed
 *  `methodAllowed.<method>` so the runner may use it while the GM's approval is awaited (Review flags the assumed rule). All
 *  assumed and undoable; nothing here overrides a setting the campaign locked (mergeRules drops a locked key). */
export function methodActivation(method: Sr6Method, cr: CreationRules, data: CreationCatalog, std: CreationRules): RunnerRule[] {
  const fill = methodFill(method, cr, data, std)
  if (flag(cr, 'restrictMethods') && flag(cr, `methodAllowed.${method}`) !== true)
    fill.push({ key: `methodAllowed.${method}`, value: 'true', assumed: true as const })
  return fill
}

/** A method's own settings a runner may carry for itself (point buy's points, the karma build's pool and its toggle,
 *  lifepath's modules): the keys unique to this method, for the Method tab's per-method "set up" checkboxes to fill
 *  (methodFill) and clear. A setting shared with another method (a metatype's karma) is left out, so clearing one
 *  method's checkbox never disturbs another's. */
export function methodOwnKeys(method: Sr6Method, data: Pick<CreationCatalog, 'metatypes'>): string[] {
  const mine = expandKeys(data)
    .filter(k => Array.isArray(k.methods) && k.methods.length === 1 && k.methods[0] === method)
    .map(k => k.key)
  return method === 'karma' ? ['karmaBuildMethod', ...mine] : mine
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
  'knowledgeLogicIntuition',
  'magicAboveSixByGrade',
  'availabilitySeven',
  'cargoWithoutSeats',
  'metatypeSizePricing',
].map(key => ({ key, about: aboutOf(key) }))
/** A runner file may set only these (mergeRules): a hand-edited one naming any other setting keeps the table's. */
export const isRunnerRuleKey = (key: string) => RUNNER_KEYS.has(key) || METHOD_KEY.test(key)
/** The creation methods' own numbers (point buy, karma build, lifepath, sum to ten), and a per-method allow flag: a runner
 *  may carry these only through the Method tab (methodFill's standard values, or activating a method the table restricts —
 *  `methodAllowed.<method>`, assumed so Review flags it for the GM), undoable. The one seam: mergeRules. */
const METHOD_KEY = /^(pointBuy\.|karmaBuild\.|lifepath\.|sumToTen|letterValue:|metatypeKarma:|karmaBuildMethod$|methodAllowed\.)/
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
