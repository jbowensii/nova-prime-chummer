// The table's SR6 creation rules (custom/sr6/creation.xml, public/data/sr6/schema/creation.xsd): every number the core
// rulebook prints only in its text (starting karma, caps, exchange rates, point-buy prices, grades…), entered on the Rules
// page by the admin from their own book: the server's default. A campaign's GM may give it its own (server/campaigns.mjs),
// which its runners use instead. The app ships the standard values (DEFAULTS_PATH; the admin's file holds only what they
// changed); a method whose settings are unset can't be picked (missingFor), and a rule whose setting is unset is
// skipped. Formulas stay in code.
import { MAGIC_KIND_LABELS, LETTERS, type Letter, type MagicKind, type Sr6Method } from '../model/character'

export const CREATION_NS = 'urn:chummer-sr6:config:1'
export type CreationValue = number | boolean | string
export interface CreationSetting { key: string; value: CreationValue; source?: string; page?: number }
export type CreationRules = Map<string, CreationSetting>
export type CreationType = 'number' | 'bool' | 'quality'
/** methods: the creation methods that need the setting set ('all': every one; []: optional). */
export interface CreationKey { key: string; label: string; type: CreationType; group: string; methods: Sr6Method[] | 'all' }
/** What expandKeys and missingFor read from the catalog (src/sr6/engine/data.ts's Sr6Data has this shape). */
export interface CreationCatalog {
  priorities: Partial<Record<Letter, unknown>>
  metatypes: Record<string, { id: string; name: string }>
  lifemodules: Record<string, { stage: string }>
}

/** The groups, in the order the creation rules form shows them. */
export const CREATION_GROUPS = ['General', 'Karma prices', 'Advancement', 'Nuyen', 'Sum to ten', 'Point buy', 'Karma build', 'Metatypes', 'Lifepath', 'Augmentation grades', 'Derived values']
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
  { key: 'oneSkillAtMax', label: 'Only one skill at the highest rank', type: 'bool', group: 'General', methods: [] },
  ...n('General', 'all', [['skillPointsSpec', 'Skill points for a specialization']]),
  // optional: unset, no expertise at creation (the core rulebook allows none)
  ...n('General', [], [['skillPointsExpertise', 'Skill points for an expertise (unset: no expertise at creation)']]),
  ...n('General', 'all', [['magicMax', 'Highest Magic or Resonance'], ['essence', 'Starting Essence'], ['contactPointsPerCha', 'Contact points per Charisma'],
    ['knowledgePerLog', 'Free knowledge skills per Logic'], ['maxAvailability', 'Highest Availability'],
    ['maxNuyenLeft', 'Most nuyen kept after creation'],
    ['freeSpellsPerMagic', 'Free spells per Magic'], ['freeFormsPerResonance', 'Free complex forms per Resonance']]),
  // optional (the core rulebook prints no number): unset, no limit
  ...n('General', [], [['maxKarmaLeft', 'Most karma kept after creation (unset: no limit)']]),
  ...n('Karma prices', 'all', [['karmaAttrPerRank', 'Attribute: karma per rank, times the new rating'],
    ['karmaSkillPerRank', 'Skill: karma per rank, times the new rank'], ['karmaSpec', 'Specialization'],
    ['karmaKnowledge', 'Knowledge or language rank'], ['karmaSpell', 'Extra spell or ritual'], ['karmaForm', 'Extra complex form'],
    ['karmaInitiationBase', 'Initiation or submersion: base'], ['karmaInitiationPerGrade', 'Initiation or submersion: per grade']]),
  ...n('Karma prices', [], [['positiveQualityFactor', 'Positive qualities cost their karma times (unset: 1)']]),
  // career play (S3; the Karma prices above are the career prices too): optional, unset refuses the spend that needs it
  // (a cap: not applied; nuyen to karma: the optional rule is off)
  ...n('Advancement', [], [['advance.expertise', 'Expertise after creation'],
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
    ['untrainedPenalty', 'Dice off the attribute for an untrained skill']]),
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
    if (value === undefined) { errors.push(`${key}: “${raw}” isn’t ${type === 'bool' ? 'true or false' : type === 'number' ? 'a number' : 'a quality id'}.`); continue }
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
