// Derived values shown on the sheet (CRB p.52, 60, 61, 67-68, 77).
import type { AmpEntry, AttrId, Build, Catalog, Character, EffectPick, KnowledgeEntry, TableFlags } from '../model/types'
import { ATTRS } from '../model/types'
import { ampEssence, FIREWALL_MAX, isRuleEffect, ruleText, testName } from './amps'
import { applies, counts, effectHow, inBracket, own } from './effects'
import { currentBuild } from './career'
import { nativeLanguage, slotLapse } from './price'

/** The books' optional rules the engine applies, by the unscoped id their import seeds them into Table rules with (the
 *  imported entry's id is scoped by its source: "crb.optional-…"; optionOn matches either). */
export const OPTIONAL_RULES = {
  /** CRB p.68: wound thresholds as vehicles have them (Body, 2×Body, 3×Body + Armor) for characters and Matrix devices */
  vehicleDamage: 'optional-vehicle-damage-for-all',
  /** CRB p.139: every character has a social condition monitor, thresholds from Willpower plus social armor */
  socialTests: 'optional-extended-social-tests',
  /** DHSA p.16: a lifestyle is an Amp with a fixed cost; no per-run nuyen adjustment for it (Ledger tab) */
  lifestyleAmps: 'optional-lifestyle-amps',
} as const
/** Whether a Table rules id names the rule `key`: the same id, or `key` scoped by a source ("crb." + key). */
const isRule = (id: string, key: string) => id === key || id.endsWith(`.${key}`)
/** Whether an optional rule is in play for this runner: its own switch unless the GM locked the rule, else the table's; off
 *  unless switched on. */
export const optionOn = (key: string, ch: Pick<Character, 'optionalRules'>, table?: Pick<TableFlags, 'optional' | 'locked'>) => {
  const own = table?.locked?.some(id => isRule(id, key)) ? undefined : Object.entries(ch.optionalRules ?? {}).find(([id]) => isRule(id, key))?.[1]
  return own ?? table?.optional?.some(id => isRule(id, key)) ?? false
}

export type Thresholds = [number, number, number]
/** ammo: alternative DVs by ammunition, as the item's text or its amp's narrative lists them ("5 (gel)") */
export interface Weapon {
  uid: string
  name: string
  dv: string
  ranges: string
  specialist?: boolean
  note?: string
  ammo?: string[]
}

/** Alternative DVs by ammunition in a book text: "DV 5 (gel) / 6 (explosive)" -> ["5 (gel)", "6 (explosive)"]. Only a
 *  word in the brackets counts (not a page reference); the rules don't track ammo, so there's nothing to count. */
export function ammoDVs(text = ''): string[] {
  const one = String.raw`\d+\s*\(\s*[A-Za-z][A-Za-z \-]{0,24}\)`
  const out: string[] = []
  for (const m of text.matchAll(new RegExp(String.raw`\bDV\s*:?\s*(${one}(?:\s*[/,;]\s*(?:or\s+)?${one})*)`, 'gi')))
    for (const x of m[1].matchAll(/(\d+)\s*\(\s*([^)]*?)\s*\)/g)) if (!out.includes(`${x[1]} (${x[2]})`)) out.push(`${x[1]} (${x[2]})`)
  return out
}
/** monitor: the vehicle's own wound boxes (its extra-box effects count here, not on the rigger, CRB p.62) */
export interface VehicleStats {
  uid: string
  name: string
  chassis: string
  pilot: number
  body: number
  handling: number
  speed: number
  flying: boolean
  armor: number
  count: number
  mount: string
  thresholds: Thresholds
  monitor: { light: number; serious: number }
}
/** notes: the Advantages and Disadvantages the runner's effects give on this Test (CRB p.59, 65), each with where it comes
 *  from and when it holds: shown with the pool, never dice (the book's pools never change, p.63) */
export interface Pool {
  skill: string
  spec?: string
  label: string
  rating: number
  attr: AttrId
  dp: number
  rr: number
  notes?: PoolNote[]
}
/** ref rr-spec: Risk Reduction limited to a specialization the runner doesn't have: in the skill's bracketed total, this
 *  note naming the specialization (added to the specialization's pool when it has it; owner, 2026-10-10); an Advantage or
 *  Disadvantage on such a specialization is noted likewise */
export interface PoolNote {
  ref: 'advantage' | 'edge-advantage' | 'disadvantage' | 'rr-spec'
  text: string
  from: string
  how?: string
}
/** One effect the runner has, from an amp, an item or the metatype's racial quality: `text` as the sheet says it, `how`
 *  it is turned on and whether it counts (effects.ts effectHow), `applied` false for one shown but not counted. */
export interface DerivedEffect {
  ref: string
  param?: string
  text: string
  from: string
  fromId?: string
  how: string
  applied: boolean
  rule: boolean
  /** counted only in the bracketed total (switchable or conditional) */
  bracket?: true
  /** where it comes from: an amp's type, `item` or `metatype` */
  type: string
}
/** A pool's Advantages and Disadvantages as the sheets mark them: `Adv`, `Adv (1 Edge)`, `Dis`, each with where it comes
 *  from and when it holds. */
export const poolMarks = (p: Pool) =>
  (p.notes ?? []).map(n => ({
    mark: n.ref === 'advantage' ? 'Adv' : n.ref === 'edge-advantage' ? 'Adv (1 Edge)' : n.ref === 'rr-spec' ? 'RR (spec.)' : 'Dis',
    title: `${n.text}: ${n.from}${n.how ? ` (${n.how})` : ''}`,
  }))
/** The bracketed effects behind a pool's Risk Reduction (`RR 1 (2)`), one line each with what turns it on or when it
 *  holds: the hover card's note (owner decision 2026-10-10). */
export const rrNotes = (d: Pick<Derived, 'effects'>, p: Pick<Pool, 'attr' | 'skill' | 'notes'>) => [
  ...d.effects
    .filter(e => e.bracket && ((e.ref === 'rr-attr' && e.param === p.attr) || (e.ref === 'rr-skill' && e.param === p.skill)))
    .map(e => `${e.text}: ${e.from}${e.how ? ` (${e.how})` : ''}`),
  ...(p.notes ?? []).filter(n => n.ref === 'rr-spec').map(n => `${n.text}: ${n.from}${n.how ? ` (${n.how})` : ''}`),
]
/** What the runner's effects do beyond the numbers, one line each, for the sheets and Review: sustained spells and
 *  complex forms, extra spirits, wound modifiers ignored, forced Risk, VR, rigging, and the effects of its items and
 *  racial quality (its amps' own are listed with each amp). */
export function effectLines(d: Derived): string[] {
  const out: string[] = []
  const spells = d.sustain.free > 1 || d.awakened.sorcery,
    forms = d.sustain.formsFree > 1 || d.emerged
  if (spells) out.push(`Sustains ${d.sustain.free} spell${d.sustain.free > 1 ? 's' : ''} without a Disadvantage, ${d.sustain.max} at most`)
  if (forms) out.push(`Sustains ${d.sustain.formsFree} complex form${d.sustain.formsFree > 1 ? 's' : ''} without a Disadvantage, ${d.sustain.formsMax} at most`)
  if (d.extraSpirits) out.push(`${d.extraSpirits} more summoned spirit${d.extraSpirits > 1 ? 's' : ''}`)
  if (d.ignoreWounds) out.push(d.ignoreWounds === 'all' ? 'Ignores wound modifiers' : `Ignores ${d.ignoreWounds} wound modifiers`)
  if (d.forcedRisk) out.push('Must take a High or Extreme Risk')
  if (d.vr) out.push(`${d.vr === 'hot' ? 'Hot' : 'Cold'}-sim VR`, 'A free cybercombat action per turn in VR (CRB p.212)')
  if (d.rcc) out.push(`Rigger command console: ${d.rcc} drone${d.rcc > 1 ? 's' : ''}`)
  if (d.vcr) out.push('Vehicle control rig')
  for (const e of d.effects) if (e.type === 'item' || e.type === 'metatype') out.push(`${e.text} (${e.from}${e.how ? `, ${e.how}` : ''})`)
  // what switching the switchable effects on adds (a drug's ignored wound modifiers, a sustained spell's slot)
  if (d.switched) for (const x of effectLines(d.switched)) if (!out.includes(x)) out.push(`${x} (switched on)`)
  return out
}
export interface Derived {
  build: Build
  edge: number
  essence: number
  essenceEffects: { magicHitsCancelled: number; healingHitsCancelled: number; socialDisadvantage: boolean; dead: boolean }
  monitor: { light: number; serious: number; incap: 1 }
  armor: { none: number; main: number; alt: number }
  thresholds: {
    physicalNone: Thresholds
    physicalMain: Thresholds
    physicalAlt: Thresholds
    mental: Thresholds
    matrix?: Thresholds
    /** against social damage (CRB p.139, optional): Willpower plus social armor; only with the optional rule in play */
    social?: Thresholds
  }
  /** armor against mental damage (spells, astral, biofeedback) */
  mentalProtection: number
  weapons: Weapon[]
  vehicles: VehicleStats[]
  /** technomancer: living persona Firewall = WIL, Attack = CHA (Conversion Guide p.8) */
  emerged: boolean
  pools: Pool[]
  rrAttr: Record<AttrId, number>
  initiative?: { level: number; realm?: string; source: string }
  knowledge: KnowledgeRow[]
  awakened: { perception: boolean; projection: boolean; sorcery: boolean; conjuring: boolean; adept: boolean }
  firewall?: number
  attack?: number
  /** the cyberdeck's own wound boxes (its extra-box effects count here, not on the runner, CRB p.62) */
  deckMonitor?: { light: number; serious: number }
  /** every effect the runner has (effectSources): the narrative effect kinds and the effects shown but not counted are
   *  listed on the sheet and in Review from here */
  effects: DerivedEffect[]
  /** spells (complex forms) sustained without a Disadvantage, and at most (CRB p.178: 1 and 2; each extra sustained
   *  spell effect adds one to both) */
  sustain: { free: number; max: number; formsFree: number; formsMax: number }
  /** extra summoned spirits (compiled sprites) beyond the rules' (CRB p.62) */
  extraSpirits: number
  /** social armor (CRB p.157: added to the Willpower threshold against social damage) and Matrix armor (added to the
   *  Matrix threshold) */
  socialArmor: number
  matrixArmor: number
  /** wound modifiers the runner ignores ('all', or the wound level the effect names), from its always-on effects */
  ignoreWounds?: string
  /** must take a High or Extreme Risk on every action (a drug's, an unrestricted cyberarm's) */
  forcedRisk: boolean
  /** VR access (cold- or hot-sim), rigger command console drones, vehicle control rig (CRB p.62, 210, 231) */
  vr?: 'cold' | 'hot'
  rcc: number
  vcr: boolean
  /** the same values with the switchable effects (wireless, activated, sustained) switched on, when there are any: the
   *  sheets print a total as the books do, `1 (2)` (effects.ts bracketed); pools are in the same order */
  switched?: Derived
}

/** A line of the Knowledge & languages list. at: its index in build.knowledge (-1: an automatic free slot not
 *  stored yet); source: "Free: keyword", "Free: <Skill> 4+", "Paid", or "Paid (<Skill> below 4)" / "Paid (keyword “X”
 *  removed)" for an entry whose free slot is gone, "Free: native language (house rule)". key: knowledgeKey; hidden: left off the
 *  printed sheet. */
export interface KnowledgeRow extends KnowledgeEntry {
  paid: boolean
  source: string
  at: number
  key: string
  hidden: boolean
}

/** A row's lasting identity for its place and visibility: its free slot, else the entry's own id (an entry from before
 *  ids: its kind and name). */
export const knowledgeKey = (k: Pick<KnowledgeEntry, 'from' | 'kind' | 'name' | 'id'>) => k.from ?? k.id ?? `${k.kind}:${k.name}`

/** One of the two lists (knowledge skills or languages) in display order: the player's order (build.knowledgeOrder)
 *  first, the rest A–Z. */
export function knowledgeList(rows: KnowledgeRow[], kind: KnowledgeEntry['kind'], order: string[] = []): KnowledgeRow[] {
  const pos = new Map(order.map((k, i) => [k, i]))
  // Infinity - Infinity is NaN (falsy): two unordered rows fall through to A–Z
  return rows
    .filter(r => r.kind === kind)
    .sort((a, b) => (pos.get(a.key) ?? Infinity) - (pos.get(b.key) ?? Infinity) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

/** Every keyword and every skill at 4+ is a free entry (a stored entry with that `from` renames it or marks it a
 *  language; a keyword entry, keyed by the keyword's text, keeps its name; a skill's starts as "Knowledge of <Skill>",
 *  owner 2026-10-10); the other stored entries are paid. One native language is free too: a house rule (no book text). */
export function knowledgeRows(c: Catalog, b: Build, keywords: string[]): KnowledgeRow[] {
  const used = new Set<number>()
  const slot = (from: string) => {
    const at = b.knowledge.findIndex(k => k.from === from)
    if (at >= 0) used.add(at)
    return at
  }
  const skillName = (id: string) => c.skills.get(id)?.name ?? id
  const rows: Omit<KnowledgeRow, 'key' | 'hidden'>[] = []
  const native = (at: number) => (b.knowledge[at]?.native ? { native: true as const } : {})
  for (const kw of new Set(keywords.map(k => k.trim()).filter(Boolean))) {
    const from = `keyword:${kw}`,
      at = slot(from)
    rows.push({ name: kw, kind: b.knowledge[at]?.kind ?? 'knowledge', from, ...native(at), paid: false, source: 'Free: keyword', at })
  }
  for (const s of b.skills.filter(s => s.rating >= 4)) {
    const from = `skill:${s.id}`,
      at = slot(from)
    rows.push({
      name: b.knowledge[at]?.name || `Knowledge of ${skillName(s.id)}`,
      kind: b.knowledge[at]?.kind ?? 'knowledge',
      from,
      ...native(at),
      paid: false,
      source: `Free: ${skillName(s.id)} 4+`,
      at,
    })
  }
  const first = nativeLanguage(b)
  b.knowledge.forEach((k, at) => {
    if (used.has(at)) return
    if (k === first) return rows.push({ ...k, paid: false, source: 'Free: native language (house rule)', at })
    const lapse = slotLapse(b, keywords, k, skillName)
    rows.push({ ...k, paid: true, source: lapse ? `Paid (${lapse})` : k.native && k.kind === 'language' ? 'Paid (a second native language)' : 'Paid', at })
  })
  const hidden = new Set(b.knowledgeHidden ?? [])
  return rows.map(r => ({ ...r, key: knowledgeKey(r), hidden: hidden.has(knowledgeKey(r)) }))
}

const RR_CAP = 3 // max Risk Reduction on one Test (CRB p.61)
/** An amp's effects that count (effects.ts counts): low-confidence ones never, switchable and conditional ones only `on`. */
export const onFx = (a: Pick<AmpEntry, 'effects'>, on = false) => a.effects.filter(e => counts(e, on))
/** Where an effect comes from: an amp (its type), an item (`item`) or the metatype's racial quality (`metatype`). */
export interface EffectSource {
  e: EffectPick
  type: string
  name: string
  uid?: string
  id?: string
  amp?: AmpEntry
}
/** Every effect a runner has, counted or not: its amps' (as picked), its items' (the player's own, else the catalog
 *  item's: effects.ts own; a spell's or complex form's on its caster only, sustained: one that affects its target(s)
 *  stays on the spell) and its metatype's. */
export function effectSources(c: Catalog, b: Build, metatype?: string): EffectSource[] {
  const meta = metatype ? c.metatypes.get(metatype) : undefined
  return [
    ...b.amps.flatMap(a => a.effects.map(e => ({ e, type: a.type, name: a.name, uid: a.uid, id: a.catalogId, amp: a }))),
    ...b.items.flatMap(i =>
      own(i.effects, (i.catalogId ? c.items.get(i.catalogId) : undefined)?.effects ?? i.snapshot?.effects)
        .filter(e => e.affects !== 'target')
        .map(e => ({ e, type: 'item', name: i.name, uid: i.uid, id: i.catalogId })),
    ),
    ...(meta?.effects ?? []).map(e => ({ e, type: 'metatype', name: `${meta!.name} (${meta!.racialQuality || 'racial quality'})`, id: meta!.id })),
  ]
}
/** Amps whose extra wound boxes belong to a device, not the character (CRB p.62). */
export const DEVICE_TYPES = ['cyberdeck', 'vehicle']
const boxes = (effects: { ref: string }[]) => ({
  light: 2 + (effects.some(e => e.ref === 'wound-light') ? 1 : 0),
  serious: 1 + (effects.some(e => e.ref === 'wound-serious') ? 1 : 0),
})
/** An effect's most a character gets from all amps together (Armor +1, DV +1: p.61 "can't exceed the maximum bonus"). */
export const capped = (c: Catalog, ref: string, n: number) => Math.min(n, c.ampEffects.get(ref)?.max ?? Infinity)
const t3 = (x: number): Thresholds => [x, x + 3, x + 6]
const sum = (xs: number[]) => xs.reduce((t, x) => t + x, 0)
/** Each count's share of a bonus that stacks only to the effect's max (CRB p.61), the first ones first: what derive totals
 *  and the export gives each amp, so the two add up the same. */
export function shares(c: Catalog, ref: string, counts: number[]): number[] {
  let left = c.ampEffects.get(ref)?.max ?? Infinity
  return counts.map(n => {
    const s = Math.max(0, Math.min(n, left))
    left -= s
    return s
  })
}
/** The armor worn as `uid` and the armor it is worn over (up to four deep). */
function wornChain(b: Build, uid?: string) {
  const out: Build['items'] = []
  for (let it = b.items.find(i => i.uid === uid); it && out.length < 4 && !out.includes(it); it = it.over ? b.items.find(i => i.uid === it!.over) : undefined)
    out.push(it)
  return out
}
/** Each amp's Armor +1 on the armor worn as `uid` (none: unarmored): an Equipment amp's when it is linked to an item of
 *  that armor, any other amp's (orthoskin, mystic armor…) always; together no more than the effect's max. */
export function armorShares(c: Catalog, b: Build, uid?: string, on = false): number[] {
  const counted = armorAmp(b, uid)
  return shares(
    c,
    'armor-plus',
    b.amps.map(a => (counted(a) ? onFx(a, on).filter(e => e.ref === 'armor-plus').length : 0)),
  )
}
/** Whether an amp's Armor +1 counts on the armor worn as `uid` (armorShares; Review's amp.stackMax). */
export function armorAmp(b: Build, uid?: string): (a: AmpEntry) => boolean {
  const chain = new Set(wornChain(b, uid).map(i => i.uid))
  return a => a.type !== 'equipment' || (!!a.linkedItem && chain.has(a.linkedItem))
}

/** Vehicle or drone stats: chassis + upgrades (CRB p.60, 62-63). Flying doubles the base Speed only (the chassis' flying
 *  speed when it has one); Speed upgrades add after that. */
export function vehicleStats(c: Catalog, a: AmpEntry, on = false): VehicleStats | undefined {
  const ch = a.vehicle ? (c.vehicles.get(a.vehicle) ?? a.chassis) : undefined
  if (!ch) return undefined
  const n = (ref: string) => onFx(a, on).filter(e => e.ref === ref).length
  const flying = n('flying') > 0
  const fixed = n('fixed') > 0
  const speed = fixed ? 0 : (flying ? (ch.flyingSpeed ?? Math.max(1, ch.speed * 2)) : ch.speed) + n('speed-plus')
  const armor = ch.armor + n('vehicle-armor')
  return {
    uid: a.uid,
    name: a.name,
    chassis: ch.name,
    pilot: ch.pilot + n('pilot-plus'),
    body: ch.body,
    handling: ch.handling + n('handling-plus'),
    speed,
    flying,
    armor,
    count: 1 + n('extra-drone'),
    mount: ch.mount,
    thresholds: [ch.body + armor, 2 * ch.body + armor, 3 * ch.body + armor],
    monitor: boxes(onFx(a, on)),
  }
}

/** "STR+1", "S+2", "STR", "5", "12 (anti-vehicle 16)" -> damage value with this Strength. */
export function weaponDV(dv: string, str: number, plus = 0): string {
  const m = dv.trim().match(/^(?:STR|S)(?=\s*\+|\s*$)(?:\s*\+\s*(\d+))?(.*)$/i)
  if (m) return `${str + Number(m[1] ?? 0) + plus}${m[2]}`
  const k = dv.trim().match(/^(\d+)(.*)$/)
  return k ? `${Number(k[1]) + plus}${k[2]}` : dv
}

/** The amps giving Risk Reduction on `a`'s tests, one name per effect counted (an amp taking it twice is named twice):
 *  the always-on ones (on: the switchable and conditional ones too, effects.ts counts), as derive counts rrAttr and the
 *  attribute card lists them. */
export const attrRRSources = (b: Build, a: AttrId, on = false): string[] =>
  b.amps.flatMap(amp => amp.effects.filter(e => e.ref === 'rr-attr' && e.param === a && counts(e, on)).map(() => amp.name))
/** The amps whose Risk Reduction on `a`'s tests counts only in the bracketed total, each with its note (what turns it on,
 *  when it holds): the attribute card's bracketed lines. */
export const attrRRBracket = (b: Build, a: AttrId): { name: string; how: string }[] =>
  b.amps.flatMap(amp =>
    amp.effects.filter(e => e.ref === 'rr-attr' && e.param === a && counts(e, true) && !counts(e)).map(e => ({ name: amp.name, how: effectHow(e) })),
  )

/** The runner's derived values without its switchable and conditional effects, and (`switched`) with them on. `table`:
 *  the table's switches, for the optional rules in play (optionOn). */
export function derive(c: Catalog, ch: Character, table?: Pick<TableFlags, 'optional' | 'locked'>): Derived {
  const d = deriveAt(c, ch, false, table)
  // (and a specialization's Risk Reduction the runner lacks the specialization for: in the skill's bracket)
  return effectSources(c, d.build, ch.identity.metatype).some(p => counts(p.e, true) && inBracket(p.e)) ||
    d.pools.some(p => p.notes?.some(n => n.ref === 'rr-spec'))
    ? { ...d, switched: deriveAt(c, ch, true, table) }
    : d
}

function deriveAt(c: Catalog, ch: Character, on: boolean, table?: Pick<TableFlags, 'optional' | 'locked'>): Derived {
  const b = ch.finalizedAt ? currentBuild(ch) : ch.build
  const meta = c.metatypes.get(ch.identity.metatype)
  const attr = (a: AttrId) => b.attributes[a] ?? 0
  const sources = effectSources(c, b, ch.identity.metatype)
  // the effects that count (effects.ts counts: the switchable and conditional ones only `on`)
  const picks = sources.filter(p => counts(p.e, on))
  const has = (ref: string) => picks.some(p => p.e.ref === ref)
  const count = (ref: string) => picks.filter(p => p.e.ref === ref).length
  const total = (ref: string) => picks.filter(p => p.e.ref === ref).reduce((t, p) => t + (p.e.value ?? 1), 0)

  // Essence (CRB p.60); a quality may let the last point count double (one more implant) or spare magic the first point
  // lost (DHSA p.5)
  const essence = 6 - b.amps.reduce((s, a) => s + ampEssence(c, a), 0)
  const extraEssence = Math.min(1, count('essence-implant')),
    magicSpared = Math.min(1, count('essence-magic'))

  // Armor: an item's own rating plus the armor an add-on is worn over, and each amp's share of Armor +1 (armorShares)
  const worn = (uid?: string) => wornChain(b, uid).reduce((t, it) => t + (it.armor ?? 0), 0) + sum(armorShares(c, b, uid, on))
  // mental protection from Astral/Mystic Armor, biofeedback filters, code shells...: always on
  const mentalProtection = count('mental-armor')
  const armor = { none: worn(), main: worn(b.mainArmor), alt: worn(b.altArmor) }
  const socialArmor = total('social-armor'),
    matrixArmor = total('matrix-armor')

  // Risk Reduction from amps (and an item's or the racial quality's, should one give it)
  const rrAttr = Object.fromEntries(ATTRS.map(a => [a, 0])) as Record<AttrId, number>
  const rrSkill = new Map<string, number>(),
    rrSpec = new Map<string, number>()
  for (const { e } of picks) {
    if (!e.param) continue
    if (e.ref === 'rr-attr') rrAttr[e.param as AttrId] = (rrAttr[e.param as AttrId] ?? 0) + 1
    if (e.ref === 'rr-skill') rrSkill.set(e.param, (rrSkill.get(e.param) ?? 0) + 1)
    if (e.ref === 'rr-spec') rrSpec.set(e.param, (rrSpec.get(e.param) ?? 0) + 1)
  }

  // Advantages and Disadvantages on Tests (CRB p.59, 65), counted or not: a Test names a skill, a spec, an attribute, or
  // none (every Test)
  // (one on every Test that holds only sometimes is listed with the effects, not on each pool)
  const testFx = sources.filter(p => (p.e.ref === 'advantage' || p.e.ref === 'edge-advantage' || p.e.ref === 'disadvantage') && (p.e.param || !p.e.when))
  // the Emerged connect in hot-sim as if they had a DNI (CG p.8); hot-sim VR with a DNI gives an Advantage on Cracking
  // (cybercombat) Tests (CRB p.212), while in hot-sim
  const emerged = b.amps.some(a => a.type === 'emerged')
  const vr = emerged || has('vr-hot') ? ('hot' as const) : has('vr-cold') ? ('cold' as const) : undefined
  if (
    vr === 'hot' &&
    c.skills.get('cracking')?.specs.some(x => x.id === 'cracking.cybercombat') &&
    !testFx.some(p => p.e.ref === 'advantage' && p.e.param === 'cracking.cybercombat')
  )
    testFx.push({ e: { ref: 'advantage', param: 'cracking.cybercombat', when: 'in hot-sim VR' }, type: 'rule', name: 'Hot-sim VR (CRB p.212)' })
  // a bonus limited to a specialization the runner doesn't have: in the skill's bracketed total, noted (owner, 2026-10-10)
  const mySpecs = new Set(b.skills.flatMap(s => s.specs))
  const lacking = (param?: string) => !!param && param.includes('.') && !mySpecs.has(param) && c.skills.has(param.split('.')[0])
  const specRR = new Map<string, { n: number; from: string[] }>()
  for (const p of picks)
    if (p.e.ref === 'rr-spec' && lacking(p.e.param)) {
      const x = specRR.get(p.e.param!) ?? { n: 0, from: [] }
      specRR.set(p.e.param!, { n: x.n + 1, from: [...new Set([...x.from, p.name])] })
    }
  const noteOf = (p: EffectSource, how?: string): PoolNote => {
    const h = [effectHow(p.e), how].filter(Boolean).join(', ')
    return { ref: p.e.ref as PoolNote['ref'], text: ruleText(c, p.e)!, from: p.name, ...(h ? { how: h } : {}) }
  }
  const pools: Pool[] = []
  const pool = (x: Pool) => {
    const notes = testFx.filter(p => !p.e.param || p.e.param === x.skill || p.e.param === x.spec || p.e.param === x.attr).map(p => noteOf(p))
    if (!x.spec) {
      notes.push(...testFx.filter(p => lacking(p.e.param) && p.e.param!.split('.')[0] === x.skill).map(p => noteOf(p, 'without the specialization')))
      for (const [spec, r] of specRR)
        if (spec.split('.')[0] === x.skill)
          notes.push({
            ref: 'rr-spec',
            text: `RR ${r.n} on ${testName(c, spec)} Tests`,
            from: r.from.join(', '),
            how: 'without the specialization: in brackets',
          })
    }
    pools.push(notes.length ? { ...x, notes } : x)
  }
  for (const s of b.skills) {
    const sk = c.skills.get(s.id)
    if (!sk) continue
    const skRR = rrSkill.get(s.id) ?? 0
    if (s.rating > 0) {
      for (const a of [sk.attr, ...(sk.alt ? [sk.alt] : [])])
        pool({
          skill: s.id,
          label: sk.name,
          rating: s.rating,
          attr: a,
          dp: s.rating + attr(a),
          rr: Math.min(RR_CAP, skRR + rrAttr[a] + (on ? [...specRR].filter(([sp]) => sp.split('.')[0] === s.id).reduce((t, [, r]) => t + r.n, 0) : 0)),
        })
    }
    // Where every spec uses the skill's attribute and the skill has an alternative
    // (Conjuring: Logic for mages, Charisma for shamans), specs get a row for both.
    const specAlt = sk.alt && sk.specs.every(x => x.attr === sk.attr) ? sk.alt : undefined
    for (const specId of s.specs) {
      const spec = sk.specs.find(x => x.id === specId)
      const name = spec?.name ?? specId.replace(/^custom:/, '')
      const first = spec?.attr ?? sk.attr
      for (const a of [first, ...(specAlt && first === sk.attr ? [specAlt] : [])])
        pool({
          skill: s.id,
          spec: specId,
          label: `${sk.name} (${name})`,
          rating: s.rating,
          attr: a,
          dp: s.rating + 2 + attr(a),
          rr: Math.min(RR_CAP, skRR + (rrSpec.get(specId) ?? 0) + rrAttr[a]),
        })
    }
  }

  // Initiative: best single source; enhancements from different sources don't stack.
  let initiative: Derived['initiative']
  for (const a of b.amps) {
    const fx = onFx(a, on),
      refs = fx.map(e => e.ref)
    const level = refs.includes('init-3') ? 3 : refs.includes('init-2') ? 2 : refs.includes('init-1') ? 1 : 0
    if (level && (!initiative || level > initiative.level)) initiative = { level, realm: fx.find(e => e.ref === 'init-realm')?.param, source: a.name }
  }

  const deck = b.amps.find(a => a.type === 'cyberdeck')
  const deckFx = deck ? onFx(deck, on) : []
  const firewall = emerged ? attr('wil') : deck ? Math.min(FIREWALL_MAX, 1 + deckFx.filter(e => e.ref === 'firewall-plus').length) : undefined
  const attack = emerged ? attr('cha') : deck ? deckFx.filter(e => e.ref === 'attack-plus').length : undefined

  // Weapons with damage worked out: unarmed is STR (CRB p.142) plus DV bonuses from implants and
  // adept powers; a weapon's own Equipment amp adds its DV bonuses, unless the book already printed
  // the final DV on the item (named book weapons).
  const unarmedPlus = capped(c, 'dv-plus', picks.filter(p => p.e.ref === 'dv-plus' && p.amp && p.type !== 'equipment').length)
  const weapons: Weapon[] = [{ uid: 'unarmed', name: 'Unarmed', dv: weaponDV('STR', attr('str'), unarmedPlus), ranges: 'OK/–/–/–' }]
  for (const it of b.items.filter(i => i.kind === 'weapon')) {
    const cat = (it.catalogId ? c.items.get(it.catalogId) : undefined) ?? it.snapshot
    const amp = b.amps.find(a => a.type === 'equipment' && a.linkedItem === it.uid)
    const fx = amp ? onFx(amp, on) : []
    const plus = it.dv ? 0 : capped(c, 'dv-plus', fx.filter(e => e.ref === 'dv-plus').length)
    const range = fx.find(e => e.ref === 'range-improve')?.param
    const minRisk = fx.find(e => e.ref === 'min-risk-dice')
    const note = [range && `range improved: ${range}`, minRisk && ruleText(c, minRisk)].filter(Boolean).join('; ')
    weapons.push({
      uid: it.uid,
      name: it.name,
      dv: weaponDV(it.dv ?? cat?.dv ?? '?', attr('str'), plus),
      ranges: it.ranges ?? cat?.ranges ?? '',
      specialist: it.specialist,
      note: note || undefined,
    })
    const ammo = ammoDVs([cat?.text, amp?.narrative, it.note].filter(Boolean).join('\n'))
    if (ammo.length) weapons[weapons.length - 1].ammo = ammo
  }
  // an astral form fights with Close Combat (astral combat) + Willpower; its unarmed damage is Charisma, mental (CRB p.173)
  // ponytail: a weapon focus's astral DV (also from Charisma) isn't worked out; add it when a sample needs it
  if (has('awk-astral-projection'))
    weapons.splice(1, 0, {
      uid: 'unarmed-astral',
      name: 'Unarmed (astral form)',
      dv: String(attr('cha')),
      ranges: 'OK/–/–/–',
      note: 'mental damage; Close Combat (astral combat) + Willpower (CRB p.173)',
    })
  const vehicles = b.amps
    .filter(a => a.type === 'vehicle')
    .map(a => vehicleStats(c, a, on))
    .filter((x): x is VehicleStats => !!x)

  const knowledge = knowledgeRows(c, b, ch.narrative.keywords)
  // sustained spells (CRB p.178): 1 without a Disadvantage, 2 at most, each extra one adding to both; complex forms alike
  const spells = count('sustain-spell'),
    forms = count('sustain-form')
  const ignore = picks.filter(p => p.e.ref === 'ignore-wounds').map(p => p.e.param || 'all')
  // optional rules in play: vehicle-style wound thresholds (Strength and Firewall for Body, CRB p.68); a social monitor
  const vehicleStyle = optionOn(OPTIONAL_RULES.vehicleDamage, ch, table)
  const tp = (x: number, armor: number): Thresholds => (vehicleStyle ? [x + armor, 2 * x + armor, 3 * x + armor] : t3(x + armor))
  const social = optionOn(OPTIONAL_RULES.socialTests, ch, table)

  return {
    build: b,
    edge: meta?.edge ?? 3,
    essence,
    essenceEffects: {
      magicHitsCancelled: (essence <= 5 - magicSpared ? 1 : 0) + (essence <= 3 - magicSpared ? 1 : 0),
      healingHitsCancelled: (essence <= 4 ? 1 : 0) + (essence <= 2 ? 1 : 0),
      socialDisadvantage: essence <= 1,
      dead: essence <= -extraEssence,
    },
    monitor: { ...boxes(picks.filter(p => !DEVICE_TYPES.includes(p.type)).map(p => p.e)), incap: 1 },
    deckMonitor: deck && boxes(deckFx),
    armor,
    thresholds: {
      physicalNone: tp(attr('str'), armor.none),
      physicalMain: tp(attr('str'), armor.main),
      physicalAlt: tp(attr('str'), armor.alt),
      mental: t3(attr('wil') + mentalProtection),
      matrix: firewall != null ? tp(firewall, matrixArmor) : undefined,
      ...(social ? { social: t3(attr('wil') + socialArmor) } : {}),
    },
    pools,
    rrAttr,
    initiative,
    knowledge,
    awakened: {
      perception: has('awk-astral-perception') || has('awk-astral-projection'),
      projection: has('awk-astral-projection'),
      sorcery: has('awk-sorcery'),
      conjuring: has('awk-conjuring'),
      adept: has('awk-adept'),
    },
    firewall,
    attack,
    mentalProtection,
    weapons,
    vehicles,
    emerged,
    // the narrative effect kinds, and every effect that is switchable, given by reference or not counted
    effects: sources
      .filter(p => isRuleEffect(p.e.ref) || !applies(p.e) || inBracket(p.e) || p.e.from)
      .map(p => ({
        ref: p.e.ref,
        ...(p.e.param ? { param: p.e.param } : {}),
        ...(counts(p.e, true) && inBracket(p.e) ? { bracket: true as const } : {}),
        text: ruleText(c, p.e) ?? effectName(c, p.e),
        from: p.name,
        ...(p.e.from ? { fromId: p.e.from } : {}),
        how: effectHow(p.e),
        applied: applies(p.e),
        rule: isRuleEffect(p.e.ref),
        type: p.type,
      })),
    sustain: { free: 1 + spells, max: 2 + 2 * spells, formsFree: 1 + forms, formsMax: 2 + 2 * forms },
    extraSpirits: count('summon-spirit'),
    socialArmor,
    matrixArmor,
    ...(ignore.length ? { ignoreWounds: ignore.includes('all') ? 'all' : ignore[0] } : {}),
    forcedRisk: has('forced-risk'),
    ...(vr ? { vr } : {}),
    rcc: total('rcc'),
    vcr: has('vcr'),
  }
}

/** An effect as one line without its kind's own text: the Amp effect's name, and its param when it has one. */
export const effectName = (c: Catalog, e: EffectPick) => {
  const name = c.ampEffects.get(e.ref)?.name ?? e.ref
  return e.param ? `${name}: ${e.param.replace(/^custom:/, '')}` : name
}
