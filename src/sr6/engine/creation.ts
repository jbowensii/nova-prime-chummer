// The table's SR6 creation rules (custom/sr6/creation.xml, public/data/sr6/schema/creation.xsd): every number the core
// rulebook prints only in its text (starting karma, caps, exchange rates, point-buy prices, grades…), entered once on
// Game data by the admin or an editor from their own book. The app ships no values: a method whose settings are unset
// can't be picked (missingFor), and a rule whose setting is unset is skipped. Formulas stay in code.
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

/** The groups, in the order Game data shows them. */
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
  ...n('General', 'all', [['skillPointsSpec', 'Skill points for a specialization'], ['skillPointsExpertise', 'Skill points for an expertise'],
    ['magicMax', 'Highest Magic or Resonance'], ['essence', 'Starting Essence'], ['contactPointsPerCha', 'Contact points per Charisma'],
    ['knowledgePerLog', 'Free knowledge skills per Logic'], ['maxAvailability', 'Highest Availability'],
    ['maxKarmaLeft', 'Most karma kept after creation'], ['maxNuyenLeft', 'Most nuyen kept after creation'],
    ['freeSpellsPerMagic', 'Free spells per Magic'], ['freeFormsPerResonance', 'Free complex forms per Resonance']]),
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
  ...n('Nuyen', 'all', [['karmaToNuyenMax', 'Most karma turned into nuyen'], ['fakeSinPerRating', 'Fake SIN: nuyen per rating'],
    ['licencePerRating', 'Fake licence: nuyen per rating']]),
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
  ...GRADES.flatMap(g => n('Augmentation grades', [], [[`grade:${g}:essence`, `${cap(g)}: Essence times`], [`grade:${g}:cost`, `${cap(g)}: cost times`],
    [`grade:${g}:avail`, `${cap(g)}: Availability plus`]])),
  // the constants in derive.ts's formulas (optional: unset, the value shows empty)
  ...n('Derived values', [], [['monitorBase', 'Condition monitor: boxes before the attribute'],
    ['monitorDivisor', 'Condition monitor: the attribute divided by (rounded up)'], ['initiativeDice', 'Initiative dice'],
    ['astralInitiativeDice', 'Astral initiative dice'], ['specDice', 'Dice for a specialization'], ['expertiseDice', 'Dice for an expertise'],
    ['untrainedPenalty', 'Dice off the attribute for an untrained skill']]),
]
function cap(s: string) { return s[0].toUpperCase() + s.slice(1) }

// the keys expandKeys adds, by prefix: [prefix, group, methods, label]
const PER_METATYPE: [string, string, Sr6Method[], (name: string) => string][] = [
  ['metatypeKarma:', 'Metatypes', ['pointbuy', 'karma'], name => `${name}: karma`]]
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

/** The rules in a creation.xml. A value that isn't of its key's type, or an unknown key, is an error and is skipped. */
export function parseCreation(xml: string): { rules: CreationRules; errors: string[] } {
  const rules: CreationRules = new Map(), errors: string[] = []
  const doc = new DOMParser().parseFromString(xml, 'text/xml'), root = doc.documentElement
  if (doc.getElementsByTagName('parsererror').length || root.localName !== 'creation' || root.namespaceURI !== CREATION_NS)
    return { rules, errors: ['The saved creation rules file isn’t a creation rules document.'] }
  for (const el of [...root.children].filter(e => e.localName === 'setting')) {
    const key = el.getAttribute('key') ?? '', raw = el.getAttribute('value') ?? '', type = keyType(key)
    if (!type) { errors.push(`“${key}” isn’t a creation setting.`); continue }
    const value = typed(type, raw)
    if (value === undefined) { errors.push(`${key}: “${raw}” isn’t ${type === 'bool' ? 'true or false' : type === 'number' ? 'a number' : 'a quality id'}.`); continue }
    const source = el.getAttribute('source') || undefined, page = Number(el.getAttribute('page')) || undefined
    rules.set(key, { key, value, ...(source ? { source } : {}), ...(page ? { page } : {}) })
  }
  return { rules, errors }
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

/** Fetch and parse custom/sr6/creation.xml. None saved (404, or a host answering with a page that isn't XML), or the
 *  server unreachable: no rules. */
export async function loadCreation(base = './'): Promise<{ rules: CreationRules; errors: string[] }> {
  const r = await fetch(`${base}custom/sr6/creation.xml`, { cache: 'no-cache' }).catch(() => null)
  if (!r?.ok || !/xml/i.test(r.headers.get('content-type') ?? '')) return { rules: new Map(), errors: [] }
  return parseCreation(await r.text())
}
