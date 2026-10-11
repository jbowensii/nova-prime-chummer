// Chummer SR6 export v1 (docs/sr6-export-format.md; schema public/data/schema/sr6-export.schema.json): Shadowrun 6
// runners, NPCs, books and GM compendiums as JSON for the Foundry importer module (jbowensii/chummer-sr6-foundry). Every number is the
// engine's own (deriveSr6, priced, rated, npcValues), from the runner as it stands; each entry also keeps its printed
// values (attrs, parts). Pure: no DOM.
import type { Bonus, ContactType, MagicKind, PickKind, Sr6Attr, Sr6Character, Sr6LedgerType, Sr6Npc, Sr6NpcKind, Sr6Purchase } from '../model/character'
import { augFamily, SR6_KINDS, type Sr6Catalog, type Sr6Compendium, type Sr6Entry, type Sr6Kind, type Sr6Source } from '../model/types'
import { entryOf, fitted, lineBonuses, priced, ratingOf, skillRank } from './budgets'
import { bonusValue } from './effects'
import { currentBuild, ledgerLabel, balances, voidedIds } from './career'
import { sr6CompendiumSource } from './compendium'
import type { CreationRules } from './creation'
import { sr6Data, type Sr6Data } from './data'
import { deriveSr6, type Sr6Derived } from './derive'
import { withSampleFixes } from './samplefix'
import { withSr6House } from './house'
import { NPC_KINDS, npcFromEntry, npcPools, npcValues } from './npc'
import { catalogFind } from './load'
import { armorSocial, attackRatings, bookValue, legality, rated, ratingRange, type Find } from './values'
import { entryLabel } from './categories'
import { prerequisites, type Prerequisite } from './martial'

export const SR6_EXPORT_FORMAT = 'chummer-sr6-export', SR6_EXPORT_VERSION = 1
export interface Sr6ExportOpts { descriptions: boolean; now: string; appVersion: string }
/** Chummer's numbers for an entry at a rating; a key is absent when the book prints nothing or Chummer can't read it. */
export interface Sr6Values {
  rating?: number; cost?: number; avail?: number; legality?: 'L' | 'I' | 'F'; essence?: number; capacity?: number
  dv?: number; stun?: boolean; ar?: (number | null)[]; modes?: string[]; ammo?: number; defense?: number
  /** an armor's Social modifier (its printed `+2`, `–4`) */
  social?: number
  karma?: number; powerCost?: number; drain?: number; fade?: number; threshold?: number
  vehicle?: { handling?: [number, number]; accel?: [number, number]; interval?: [number, number]; topSpeed?: number
    body?: number; armor?: number; pilot?: number; sensor?: number; seats?: number }
}
/** evaluated: × rating when perRating, × qty. defense: Defense Rating (dermal plating); skill: that skill's dice pool, by
 *  its catalog id and name (a reader keys its own skills by name). An accessory's bonuses are its host's, never the
 *  runner's */
export type Sr6ExportBonus = ({ target: Exclude<Bonus['target'], 'skill'>; value: number } | { target: 'skill'; id: string; name: string; value: number })
  & { when?: string; switch?: Bonus['switch']; spec?: string; affects?: Bonus['affects'] }
/** What the entry's printed text and tables say it does (the catalog's <effect>, importer/sr6/effects.py; the targets,
 *  operations and values docs/sr6-data-format.md "Effects" lists): low: read with low confidence (shown, never applied);
 *  switch: how it is turned on; when: the condition's words; spec: the specialization it is limited to; affects: a spell's
 *  or complex form's, on its caster or its target(s) (never counted on the caster). A reader applies the always-on `add`
 *  ones it has a field for (Eden: an Active Effect), the switchable ones as an effect the player turns on, and shows the
 *  rest. */
export interface Sr6ExportEffect { target: string; op: string; value: string; low?: true; switch?: string; when?: string; spec?: string; affects?: 'caster' | 'target' | 'others' }
/** Another entry this one grants (`grants`) or works as (`as`): the reader uses that entry's effects */
export interface Sr6ExportLink { rel: 'grants' | 'as'; name: string; kind?: string; id?: string; level?: number; when?: string }
/** A test the entry's text calls for (the catalog's <test>): skill + attribute (threshold) */
export interface Sr6ExportTest { skill: string; attr: string; threshold?: number }
/** A thing on a runner or in a book: the catalog entry as printed (attrs, parts) plus Chummer's values. */
/** name: as printed; label: how Chummer shows it, its category first when its name needs it (`Cyberlimb: Arm (synthetic)`),
 *  only when that differs (attrs.category and attrs.group hold the category) */
export interface Sr6ExportItem { uid?: string; id?: string; kind: Sr6Kind; name: string; label?: string; source?: string; page?: number; canon: boolean
  attrs: Record<string, string>; parts: { tag: string; text: string }[]; values: Sr6Values; description?: string
  effects?: Sr6ExportEffect[]; tests?: Sr6ExportTest[]; links?: Sr6ExportLink[]
  /** the ids the entry had in earlier imports (the catalog's <alias id kind>, Sr6Catalog.moved): kind only when it was
   *  another kind. A reader that keyed things by the old id finds them again. */
  aliases?: { id: string; kind?: Sr6Kind }[] }
export interface Sr6ExportPurchase extends Sr6ExportItem { uid: string; qty: number; grade?: string; worn: boolean; note?: string
  bonuses: Sr6ExportBonus[]; accessories: Sr6ExportPurchase[] }
export interface Sr6ExportNpc { kind: Exclude<Sr6NpcKind, 'contact'>; rating?: number; group?: string; from?: Sr6Npc['from']
  stats: ReturnType<typeof npcValues>; lines: Sr6Npc['lines']; pools: ReturnType<typeof npcPools> }
export interface Sr6ExportLifestyle { uid: string; id: string; name: string; months: number; cost?: number }
export interface Sr6ExportRunner {
  id: string; updatedAt: string; exportedAt: string; streetName: string; realName: string; gender?: string; finalized: boolean
  metatype: { id: string; name: string }
  magic: { kind: MagicKind; tradition?: string; drainAttr?: 'log' | 'int' | 'cha'; aspectedSkill?: string; initiation: number; submersion: number }
  portrait: string | null; token: string | null
  /** augmented: with the always-on effects; switched: with the switchable and conditional ones on too (the bracket, `5 (7)`),
   *  only when it differs */
  attributes: Record<Sr6Attr, { natural: number; augmented: number; switched?: number }>; essence: number; edge: number
  skills: { id: string; name: string; attr: string; rank: number; spec?: string; expertise?: string; specs?: string[] }[]
  knowledge: { name: string; kind: 'knowledge' | 'language'; native: boolean; rank: number }[]
  qualities: (Sr6ExportItem & { uid: string; positive: boolean; level: number; free: boolean; note?: string })[]
  picks: (Sr6ExportItem & { uid: string; pick: PickKind; level?: number; bonuses: Sr6ExportBonus[] })[]
  /** styles, each with the techniques learned under it */
  martialArts: (Sr6ExportItem & { uid: string; techniques: (Sr6ExportItem & { uid: string; requires?: Prerequisite[] })[] })[]
  purchases: Sr6ExportPurchase[]
  contacts: { uid: string; name: string; archetype: string; connection: number; loyalty: number; types?: ContactType[] }[]
  /** deprecated (for the module's older versions): the first SIN's lifestyle that has one, as sins[].lifestyles has it */
  lifestyle: Omit<Sr6ExportLifestyle, 'uid'> | null
  /** placeholder: an unnamed stand-in holding an older file's lifestyle (name '', kind real); left out otherwise */
  sins: { uid: string; name: string; kind: 'real' | 'fake'; rating?: number; gender?: string; placeholder?: true; licences: { name: string; rating: number }[]
    lifestyles: Sr6ExportLifestyle[] }[]
  karma: number; nuyen: number
  /** for reading only: the module writes none of it (Eden derives its own) */
  derived?: Sr6ExportDerived
  /** the same values with the switchable and conditional effects on: the bracketed totals, `Con 6 (9)` (owner decision
   *  2026-10-10) */
  derivedOn?: Sr6ExportDerived
  background: string; notes: string
  ledger: { at: string; type: Sr6LedgerType; summary: string; karma: number; nuyen: number }[]
  npc?: Sr6ExportNpc
  /** the creation rules it is built with that aren't the server's: its campaign's own, and its own choices (value ''
   *  for one it turned off; assumed: a book sample's, from its numbers; lockedBy: a campaign GM's lock) */
  rules?: Sr6ExportRule[]
}
export type Sr6ExportDerived = Pick<Sr6Derived, 'initiative' | 'astralInit' | 'monitors' | 'monitorBonus' | 'defenseRating' | 'socialRating' | 'composure' | 'judgeIntentions' | 'memory' | 'liftCarry' | 'drain' | 'fading' | 'pools'
  | 'unarmedDamage' | 'spellAttackRating' | 'matrixInit' | 'movement'>
export interface Sr6ExportRule { key: string; value: string; from: 'campaign' | 'runner'; assumed?: true; lockedBy?: string }
/** The rules a runner's export lists (Sr6ExportRunner.rules): every setting not the server's, and the runner's own offs. */
export function exportRules(cr: CreationRules, ch: Pick<Sr6Character, 'rules'>): Sr6ExportRule[] {
  const out: Sr6ExportRule[] = [...cr.values()].filter(x => x.from === 'campaign' || x.from === 'runner')
    .map(x => defined({ key: x.key, value: String(x.value), from: x.from as 'campaign' | 'runner', assumed: x.assumed, lockedBy: x.lockedBy }))
  for (const r of ch.rules ?? []) if (!r.value.trim() && !cr.has(r.key)) out.push(defined({ key: r.key, value: '', from: 'runner' as const, assumed: r.assumed }))
  return out
}
export interface Sr6ExportFile { format: typeof SR6_EXPORT_FORMAT; version: typeof SR6_EXPORT_VERSION; kind: 'runners' | 'books'
  exportedAt: string; app: { name: string; version: string }; descriptions: boolean
  runners?: Sr6ExportRunner[]; books?: Sr6ExportBook[] }
/** A book's entry: as printed, Chummer's values, and a being's stat block (npcs, critters, spirits, sprites). */
export interface Sr6ExportEntry extends Sr6ExportItem { id: string; source: string; page: number; npc?: Sr6ExportNpc }
/** compendium: a GM's compendium (publisher: its owner's name), not a book */
export interface Sr6ExportBook { source: { id: string; name: string; publisher: string; canon: boolean; compendium?: true }
  entries: Sr6ExportEntry[]; npcs?: Sr6ExportRunner[] }

/** a number as the book prints it at `rating`, or nothing */
const num = (s: string | undefined, rating?: number) => rated(s, rating ?? 1).n ?? undefined
/** "4/3" → [4, 3], "10" → [10, 10], else nothing */
const pair = (s: string | undefined): [number, number] | undefined => {
  const m = s && s.length <= 40 ? s.match(/^\s*(\d+(?:\.\d+)?)\s*(?:\/\s*(\d+(?:\.\d+)?))?\s*$/) : null
  return m ? [Number(m[1]), Number(m[2] ?? m[1])] : undefined
}
/** the keys whose value is set */
const defined = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T

/** Chummer's numbers for an entry at `rating` (else the lowest it comes in, else none). */
export function entryValues(e: Sr6Entry, rating?: number, find?: Find): Sr6Values {
  const a = e.attrs, r = rating ?? ratingRange(a.rating)[0]
  // cost, Availability and Essence as the builder prices them: a formula's value, else the printed one
  const val = (f: string) => bookValue(e, f, r, find).n ?? undefined
  const v: Sr6Values = defined({ rating: r, cost: e.kind === 'adeptpowers' ? undefined : val('cost'), avail: val('avail'),
    legality: legality(a.avail), essence: val('essence'), capacity: num(a.capacity?.replace(/^\s*\[(.*)\]\s*$/, '$1'), r), defense: num(a.defense, r),
    social: e.kind === 'armor' ? armorSocial(a.social, r) ?? undefined : undefined,
    karma: num(a.karma, r), powerCost: e.kind === 'adeptpowers' ? num(a.cost, r) : undefined, drain: e.kind === 'spells' ? num(a.dv, r) : undefined,
    // a ritual's threshold of `Force` is the ritual's own Force, not the rating the item is bought at
    fade: num(a.fade, r), threshold: /[a-z]/i.test(a.threshold ?? '') ? undefined : num(a.threshold, r) })
  if (e.kind !== 'spells' && a.dv) {
    const m = a.dv.length <= 40 ? a.dv.match(/^\s*(\d+)\s*([PS])/) : null
    if (m) { v.dv = Number(m[1]); v.stun = m[2] === 'S' }
  }
  if (a.ar) { const ar = attackRatings(a.ar); if (ar.ok) v.ar = ar.bands }
  const modes = (a.modes ?? '').split(/[/,\s]+/).filter(m => ['SS', 'SA', 'BF', 'FA'].includes(m))
  if (modes.length) v.modes = modes
  const ammo = a.ammo?.match(/^\s*(\d+)/)
  if (ammo) v.ammo = Number(ammo[1])
  if (e.kind === 'vehicles') {
    const vehicle = defined({ handling: pair(a.handling), accel: pair(a.accel), interval: pair(a.interval), topSpeed: num(a.topSpeed),
      body: num(a.body), armor: num(a.armor), pilot: num(a.pilot), sensor: num(a.sensor), seats: num(a.seats) })
    if (Object.keys(vehicle).length) v.vehicle = vehicle
  }
  return v
}

/** An entry's attributes as printed, but an augmentation's type as cyberware or bioware (the Foundry module knows only
 *  those two): geneware, symbionts and transgenics go as bioware, nanoware as cyberware, the printed type kept in `ware`. */
export function exportAttrs(e: Sr6Entry): Record<string, string> {
  const a = { ...e.attrs }
  if (e.kind === 'augmentations' && a.type && augFamily(a.type) !== a.type) { a.ware = a.type; a.type = augFamily(a.type) }
  return a
}

/** The catalog's <effect> and <test> parts of an entry, when it has any. */
function effectsOf(e: Sr6Entry): Pick<Sr6ExportItem, 'effects' | 'tests' | 'links'> {
  const effects = e.parts.filter(p => p.tag === 'effect' && p.attrs.target && p.attrs.value && p.attrs.op)
    .map(p => ({ target: p.attrs.target, op: p.attrs.op, value: p.attrs.value, ...(p.attrs.confidence === 'low' ? { low: true as const } : {}),
      ...(p.attrs.switch ? { switch: p.attrs.switch } : {}), ...(p.attrs.when ? { when: p.attrs.when } : {}), ...(p.attrs.spec ? { spec: p.attrs.spec } : {}),
      ...(p.attrs.affects === 'caster' || p.attrs.affects === 'target' || p.attrs.affects === 'others' ? { affects: p.attrs.affects as 'caster' | 'target' | 'others' } : {}) }))
  const links = e.parts.filter(p => p.tag === 'link' && p.attrs.name && (p.attrs.rel === 'grants' || p.attrs.rel === 'as'))
    .map(p => ({ rel: p.attrs.rel as Sr6ExportLink['rel'], name: p.attrs.name, ...(p.attrs.kind ? { kind: p.attrs.kind } : {}),
      ...(p.attrs.ref ? { id: p.attrs.ref } : {}), ...(Number(p.attrs.level) > 0 ? { level: Number(p.attrs.level) } : {}), ...(p.attrs.when ? { when: p.attrs.when } : {}) }))
  const tests = e.parts.filter(p => p.tag === 'test' && p.attrs.skill && p.attrs.attr).map(p => {
    const t = Number(p.attrs.threshold)
    return { skill: p.attrs.skill, attr: p.attrs.attr, ...(p.attrs.threshold && Number.isInteger(t) ? { threshold: t } : {}) }
  })
  return { ...(effects.length ? { effects } : {}), ...(tests.length ? { tests } : {}), ...(links.length ? { links } : {}) }
}

/** old id -> entry, turned round: entry key -> the ids it had before (cached per catalog) */
const movedTo = new WeakMap<Sr6Catalog['moved'], Map<string, { kind: Sr6Kind; id: string }[]>>()
function aliasesOf(c: Sr6Catalog, e: Sr6Entry): Pick<Sr6ExportItem, 'aliases'> {
  if (!c.moved?.size) return {}
  let m = movedTo.get(c.moved)
  if (!m) {
    m = new Map()
    for (const [from, to] of c.moved) {
      const i = from.indexOf('/'), key = `${to.kind}/${to.id}`
      m.set(key, [...m.get(key) ?? [], { kind: from.slice(0, i) as Sr6Kind, id: from.slice(i + 1) }])
    }
    movedTo.set(c.moved, m)
  }
  const old = m.get(`${e.kind}/${e.id}`)
  return old?.length ? { aliases: old.map(a => (a.kind === e.kind ? { id: a.id } : { id: a.id, kind: a.kind })) } : {}
}

const derivedOf = (d: Omit<Sr6Derived, 'on'>): Sr6ExportDerived => defined({ initiative: d.initiative, astralInit: d.astralInit, monitors: d.monitors,
  monitorBonus: d.monitorBonus, defenseRating: d.defenseRating, socialRating: d.socialRating, composure: d.composure, judgeIntentions: d.judgeIntentions,
  memory: d.memory, liftCarry: d.liftCarry, drain: d.drain, fading: d.fading, pools: d.pools, unarmedDamage: d.unarmedDamage,
  spellAttackRating: d.spellAttackRating, matrixInit: d.matrixInit, movement: d.movement })

/** The entry as printed plus its values; its text when `text` and there is some. */
function item(c: Sr6Catalog, e: Sr6Entry, text: boolean, rating?: number): Sr6ExportItem {
  return { ...effectsOf(e), ...aliasesOf(c, e), id: e.id, kind: e.kind, name: e.name, ...(entryLabel(e) !== e.name ? { label: entryLabel(e) } : {}), source: e.source, page: e.page, canon: c.sources.get(e.source)?.canon ?? false,
    attrs: exportAttrs(e), parts: e.parts.map(p => ({ tag: p.tag, text: p.text })), values: entryValues(e, rating, catalogFind(c)),
    ...(text && e.text ? { description: e.text } : {}) }
}
/** A line whose catalog entry is gone (or a custom one): what the runner file still has. */
const bare = (kind: Sr6Kind, name: string, id?: string): Sr6ExportItem =>
  ({ ...(id ? { id } : {}), kind, name, canon: false, attrs: {}, parts: [], values: {} })

// every target, Defense Rating included (derived.defenseRating counts it too); a skill's by its id and name
const bonuses = (data: Sr6Data, bs: Bonus[] | undefined, rating: number, times = 1): Sr6ExportBonus[] =>
  (bs ?? []).map(b => {
    const value = bonusValue(b, rating) * times
    // (switchable, some tests or a specialization only: in derivedOn's totals, not derived's)
    const when = { ...(b.when ? { when: b.when } : {}), ...(b.switch ? { switch: b.switch } : {}), ...(b.spec ? { spec: b.spec } : {}), ...(b.affects ? { affects: b.affects } : {}) }
    return b.target === 'skill' ? { target: 'skill', id: b.skill ?? '', name: data.skills[b.skill ?? '']?.name ?? b.skill ?? '', value, ...when } : { target: b.target, value, ...when }
  })

/** As augmentBonus counts it: a line’s bonuses (lineBonuses: entered, else its entry’s effects) × its rating (perRating) × its quantity; an accessory's by its own rating
 *  (they are its host's, not the runner's: derived.attributes leaves them out). */
/** The level's own entry for a line still naming a family's rated parent (levels.ts), else the entry as it is. */
const leveled = (data: Sr6Data, e: Sr6Entry | undefined, level: number | undefined) =>
  (e && data.family(e.kind, e.id)?.parent === e ? data.atLevel(e.kind, e.id, level ?? Math.min(...data.family(e.kind, e.id)!.levels.keys())) ?? e : e)

function purchase(c: Sr6Catalog, data: Sr6Data, cr: CreationRules, x: Sr6Purchase, top = true): Sr6ExportPurchase {
  const e = leveled(data, entryOf(x, data), x.rating)
  // values at the line's rating, else the entry's lowest; an unrated item has none (ratingOf's 1 is for pricing only)
  const base = e ? item(c, e, true, x.rating) : bare(x.kind, x.name ?? x.id ?? 'Custom item', x.id)
  const one = priced({ ...x, qty: 1, accessories: [] }, data, cr), values = { ...base.values }
  for (const k of ['cost', 'avail', 'essence'] as const)
    if (e ? values[k] !== undefined : x[k] !== undefined) values[k] = one[k]
  if (!e && x.rating !== undefined) values.rating = x.rating
  return defined({ ...base, uid: x.uid, values, qty: x.qty, grade: x.grade, worn: !!x.worn, note: x.note,
    bonuses: bonuses(data, lineBonuses(data, x.bonuses, e), ratingOf(x, e), top ? x.qty : 1), accessories: x.accessories.map(a => purchase(c, data, cr, fitted(x, a), false)) })
}

/** An NPC's stat block, read at its rating, with dice pools against the catalog's skills. A contact goes out as a grunt
 *  of group Contact (v1's kinds: the module makes it an NPC actor). */
export const exportNpc = (npc: Sr6Npc, data: Sr6Data): Sr6ExportNpc => defined({ kind: npc.kind === 'contact' ? 'grunt' : npc.kind,
  rating: npc.rating, group: npc.kind === 'contact' ? 'Contact' : npc.group,
  from: npc.from, stats: npcValues(npc), lines: npc.lines.map(l => ({ ...l })), pools: npcPools(npc, data) })

/** The runner's copies of compendium entries the catalog no longer has stand in for them (src/sr6/engine/house.ts). */
export function exportSr6Runner(all: Sr6Catalog, allData: Sr6Data, cr: CreationRules, printedCh: Sr6Character, o: Sr6ExportOpts): Sr6ExportRunner {
  const ch = withSampleFixes(all, printedCh).ch // (a book sample's lines as the owner's override file corrects them)
  const c = withSr6House(all, ch.house).c, data = c === all ? allData : sr6Data(c)
  const b = currentBuild(ch), d = deriveSr6(data, cr, { ...ch, build: b }), id = ch.identity
  const money = ch.finalizedAt ? balances(ch) : { karma: d.karmaLeft, nuyen: d.nuyenLeft }
  const voided = voidedIds(ch)
  const sins = b.sins.map(s => defined({ uid: s.uid, name: s.name, kind: s.kind, rating: s.rating, gender: s.gender, placeholder: s.placeholder,
    licences: s.licences.map(l => ({ name: l.name, rating: l.rating })),
    lifestyles: (s.lifestyles ?? []).map(l => { const e = data.entry('lifestyles', l.id)
      return defined({ uid: l.uid, id: l.id, name: e?.name ?? l.id, months: l.months, cost: num(e?.attrs.cost) }) }) }))
  const first = sins.flatMap(s => s.lifestyles)[0]
  return {
    id: ch.id, updatedAt: ch.updatedAt, exportedAt: o.now, streetName: id.streetName, realName: id.name, ...(id.gender ? { gender: id.gender } : {}),
    finalized: !!ch.finalizedAt,
    metatype: { id: b.metatype, name: data.metatypes[b.metatype]?.name ?? '' },
    magic: defined({ kind: b.magic, tradition: b.tradition, drainAttr: b.drainAttr, aspectedSkill: b.aspectedSkill, initiation: b.initiation, submersion: b.submersion }),
    portrait: id.portrait ?? null, token: id.token ?? null,
    attributes: Object.fromEntries(Object.entries(d.attrs).map(([k, v]) => [k, d.on.attrs[k as Sr6Attr].augmented === v.augmented ? v
      : { ...v, switched: d.on.attrs[k as Sr6Attr].augmented }])) as Sr6ExportRunner['attributes'], essence: d.essence, edge: d.edge,
    skills: b.skills.map(s => defined({ id: s.id, name: data.skills[s.id]?.name ?? s.id, attr: data.skills[s.id]?.attr ?? '', rank: skillRank(s),
      spec: s.spec, expertise: s.expertise, specs: s.specs })),
    knowledge: b.knowledge.map(k => ({ name: k.name, kind: k.kind, native: !!k.native, rank: k.points + k.karma })),
    qualities: b.qualities.map(q => {
      const e = leveled(data, data.entry('qualities', q.id), q.level)
      return defined({ ...(e ? item(c, e, true) : bare('qualities', q.name ?? q.id, q.id)), uid: q.uid, positive: e?.attrs.kind !== 'negative',
        level: q.level, free: !!q.free, note: q.note })
    }),
    picks: b.picks.map(p => {
      const e = leveled(data, data.entry(p.kind, p.id), p.level)
      return defined({ ...(e ? item(c, e, true) : bare(p.kind, p.name ?? p.id, p.id)), uid: p.uid, pick: p.kind, level: p.level,
        bonuses: bonuses(data, lineBonuses(data, p.bonuses, e), p.level ?? 1) })
    }),
    martialArts: b.martialArts.map(m => {
      const line = (kind: 'martialarts' | 'martialtechniques', x: { uid: string; id: string; name?: string }) => {
        const e = data.entry(kind, x.id)
        return { ...(e ? item(c, e, true) : bare(kind, x.name ?? x.id, x.id)), uid: x.uid }
      }
      return { ...line('martialarts', m), techniques: m.techniques.map(t => {
        const requires = prerequisites(data, b, data.entry('martialtechniques', t.id)) // (absent when it prints none)
        return { ...line('martialtechniques', t), ...(requires.length ? { requires } : {}) }
      }) }
    }),
    purchases: b.purchases.map(x => purchase(c, data, cr, x)),
    contacts: b.contacts.map(x => defined({ uid: x.uid, name: x.name, archetype: x.archetype, connection: x.connection, loyalty: x.loyalty,
      types: x.types?.length ? [...x.types] : undefined })),
    lifestyle: first ? (({ uid: _, ...l }) => l)(first) : null,
    sins,
    karma: money.karma, nuyen: money.nuyen,
    ...(ch.npc ? {} : { derived: derivedOf(d), derivedOn: derivedOf(d.on) }),
    background: id.background ?? '', notes: id.notes ?? '',
    ledger: ch.ledger.filter(e => e.type !== 'void' && !voided.has(e.id)).map(e => ({ at: e.at, type: e.type, summary: ledgerLabel(e),
      karma: 'karma' in e ? e.karma : 0, nuyen: 'nuyen' in e ? e.nuyen : 0 })),
    ...(ch.npc ? { npc: exportNpc(ch.npc, data) } : {}),
    ...(exportRules(cr, ch).length ? { rules: exportRules(cr, ch) } : {}),
  }
}

const envelope = (kind: Sr6ExportFile['kind'], o: Sr6ExportOpts) => ({ format: SR6_EXPORT_FORMAT, version: SR6_EXPORT_VERSION, kind,
  exportedAt: o.now, app: { name: 'Chummer Anarchy 2.0', version: o.appVersion }, descriptions: o.descriptions }) as const

/** A runners file: each runner (or NPC) as it stands. */
/** `cr`: the creation rules, or each runner's (its campaign's own or the server's). */
export const exportSr6Runners = (c: Sr6Catalog, data: Sr6Data, cr: CreationRules | ((ch: Sr6Character) => CreationRules), chs: Sr6Character[], o: Sr6ExportOpts): Sr6ExportFile =>
  ({ ...envelope('runners', o), runners: chs.map(ch => exportSr6Runner(c, data, typeof cr === 'function' ? cr(ch) : cr, ch, o)) })

const BEINGS = new Set<Sr6Kind>(Object.values(NPC_KINDS).map(k => k.kind))
function bookEntry(c: Sr6Catalog, data: Sr6Data, e: Sr6Entry, text: boolean): Sr6ExportEntry {
  // a spirit or sprite at its default rating, a grunt at its Professional Rating
  return { ...item(c, e, text), id: e.id, source: e.source, page: e.page, ...(BEINGS.has(e.kind) ? { npc: exportNpc(npcFromEntry(e).npc!, data) } : {}) }
}
const bookSource = (s: Sr6Source, compendium = false): Sr6ExportBook['source'] =>
  ({ id: s.id, name: s.name, publisher: s.publisher, canon: s.canon, ...(compendium ? { compendium: true as const } : {}) })

/** A books file: each ticked source still in the catalog (unknown ids skipped), with its entries of every kind in
 *  SR6_KINDS order, then catalog order, as the app sees them (edits applied); their text only when `descriptions`. */
export function exportSr6Books(c: Sr6Catalog, data: Sr6Data, sources: string[], o: Sr6ExportOpts): Sr6ExportFile {
  // every kind (owner, 2026-10-09: the compendiums hold everything): a kind the system has no document for, the implant
  // grades and the kinds only listed as printed included, becomes a reference journal there
  const kinds = Object.keys(SR6_KINDS) as Sr6Kind[]
  return { ...envelope('books', o), books: sources.flatMap(id => {
    const s = c.sources.get(id)
    if (!s) return []
    const entries = kinds.flatMap(k => [...c.entries[k].values()].filter(e => e.source === id).map(e => bookEntry(c, data, e, o.descriptions)))
    return [{ source: bookSource(s), entries }]
  }) }
}

/** A GM's compendium as a books file of one book, marked compendium: its entries with their own text always, its NPCs. */
export function exportSr6Compendium(c: Sr6Catalog, data: Sr6Data, cr: CreationRules, comp: Sr6Compendium, o: Sr6ExportOpts): Sr6ExportFile {
  // the catalog's source only when it is this compendium's (one that didn't load may share its id with a book now)
  const opts = { ...o, descriptions: true }, s = c.sources.get(comp.source)
  return { ...envelope('books', opts), books: [{ source: bookSource(s?.compendium?.id === comp.id ? s : sr6CompendiumSource(comp), true),
    entries: comp.entries.map(e => bookEntry(c, data, e, true)), npcs: comp.npcs.map(ch => exportSr6Runner(c, data, cr, ch, opts)) }] }
}
