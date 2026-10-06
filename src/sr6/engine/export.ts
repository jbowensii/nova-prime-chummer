// Chummer SR6 export v1 (docs/sr6-export-format.md; schema public/data/schema/sr6-export.schema.json): Shadowrun 6
// runners, NPCs, books and GM compendiums as JSON for the Foundry importer module (jbowensii/chummer-sr6-foundry). Every number is the
// engine's own (deriveSr6, priced, rated, npcValues), from the runner as it stands; each entry also keeps its printed
// values (attrs, parts). Pure: no DOM.
import type { Bonus, MagicKind, PickKind, Sr6Attr, Sr6Character, Sr6LedgerType, Sr6Npc, Sr6NpcKind, Sr6Purchase } from '../model/character'
import { augFamily, SR6_KINDS, type Sr6Catalog, type Sr6Compendium, type Sr6Entry, type Sr6Kind, type Sr6Source } from '../model/types'
import { entryOf, priced, skillRank } from './budgets'
import { currentBuild, ledgerLabel, balances, voidedIds } from './career'
import { sr6CompendiumSource } from './compendium'
import type { CreationRules } from './creation'
import { sr6Data, type Sr6Data } from './data'
import { deriveSr6, type Sr6Derived } from './derive'
import { withSr6House } from './house'
import { NPC_KINDS, npcFromEntry, npcPools, npcValues } from './npc'
import { catalogFind } from './load'
import { attackRatings, bookValue, legality, rated, ratingRange, type Find } from './values'

export const SR6_EXPORT_FORMAT = 'chummer-sr6-export', SR6_EXPORT_VERSION = 1
export interface Sr6ExportOpts { descriptions: boolean; now: string; appVersion: string }
/** Chummer's numbers for an entry at a rating; a key is absent when the book prints nothing or Chummer can't read it. */
export interface Sr6Values {
  rating?: number; cost?: number; avail?: number; legality?: 'L' | 'I' | 'F'; essence?: number; capacity?: number
  dv?: number; stun?: boolean; ar?: (number | null)[]; modes?: string[]; ammo?: number; defense?: number
  karma?: number; powerCost?: number; drain?: number; fade?: number; threshold?: number
  vehicle?: { handling?: [number, number]; accel?: [number, number]; interval?: [number, number]; topSpeed?: number
    body?: number; armor?: number; pilot?: number; sensor?: number; seats?: number }
}
/** evaluated: × rating when perRating, × qty */
export interface Sr6ExportBonus { target: Sr6Attr | 'initDice'; value: number }
/** A thing on a runner or in a book: the catalog entry as printed (attrs, parts) plus Chummer's values. */
export interface Sr6ExportItem { uid?: string; id?: string; kind: Sr6Kind; name: string; source?: string; page?: number; canon: boolean
  attrs: Record<string, string>; parts: { tag: string; text: string }[]; values: Sr6Values; description?: string }
export interface Sr6ExportPurchase extends Sr6ExportItem { uid: string; qty: number; grade?: string; worn: boolean; note?: string
  bonuses: Sr6ExportBonus[]; accessories: Sr6ExportPurchase[] }
export interface Sr6ExportNpc { kind: Exclude<Sr6NpcKind, 'contact'>; rating?: number; group?: string; from?: Sr6Npc['from']
  stats: ReturnType<typeof npcValues>; lines: Sr6Npc['lines']; pools: ReturnType<typeof npcPools> }
export interface Sr6ExportRunner {
  id: string; updatedAt: string; exportedAt: string; streetName: string; realName: string; finalized: boolean
  metatype: { id: string; name: string }
  magic: { kind: MagicKind; tradition?: string; drainAttr?: 'log' | 'int' | 'cha'; aspectedSkill?: string; initiation: number; submersion: number }
  portrait: string | null; token: string | null
  attributes: Record<Sr6Attr, { natural: number; augmented: number }>; essence: number; edge: number
  skills: { id: string; name: string; attr: string; rank: number; spec?: string; expertise?: string }[]
  knowledge: { name: string; kind: 'knowledge' | 'language'; native: boolean; rank: number }[]
  qualities: (Sr6ExportItem & { uid: string; positive: boolean; level: number; free: boolean; note?: string })[]
  picks: (Sr6ExportItem & { uid: string; pick: PickKind; level?: number; bonuses: Sr6ExportBonus[] })[]
  purchases: Sr6ExportPurchase[]
  contacts: { uid: string; name: string; archetype: string; connection: number; loyalty: number }[]
  lifestyle: { id: string; name: string; months: number; cost?: number } | null
  sins: { uid: string; name: string; kind: 'real' | 'fake'; rating?: number; licences: { name: string; rating: number }[] }[]
  karma: number; nuyen: number
  /** for reading only: the module writes none of it (Eden derives its own) */
  derived?: Pick<Sr6Derived, 'initiative' | 'astralInit' | 'monitors' | 'defenseRating' | 'composure' | 'judgeIntentions' | 'memory' | 'liftCarry' | 'drain' | 'fading' | 'pools'>
  background: string; notes: string
  ledger: { at: string; type: Sr6LedgerType; summary: string; karma: number; nuyen: number }[]
  npc?: Sr6ExportNpc
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

/** The entry as printed plus its values; its text when `text` and there is some. */
function item(c: Sr6Catalog, e: Sr6Entry, text: boolean, rating?: number): Sr6ExportItem {
  return { id: e.id, kind: e.kind, name: e.name, source: e.source, page: e.page, canon: c.sources.get(e.source)?.canon ?? false,
    attrs: exportAttrs(e), parts: e.parts.map(p => ({ tag: p.tag, text: p.text })), values: entryValues(e, rating, catalogFind(c)),
    ...(text && e.text ? { description: e.text } : {}) }
}
/** A line whose catalog entry is gone (or a custom one): what the runner file still has. */
const bare = (kind: Sr6Kind, name: string, id?: string): Sr6ExportItem =>
  ({ ...(id ? { id } : {}), kind, name, canon: false, attrs: {}, parts: [], values: {} })

// a Defense Rating bonus is in derived.defenseRating, not here (the export's targets are attributes and initDice)
const bonuses = (bs: Bonus[] | undefined, rating: number, times = 1): Sr6ExportBonus[] =>
  (bs ?? []).flatMap(b => (b.target === 'defense' ? [] : [{ target: b.target, value: b.value * (b.perRating ? rating : 1) * times }]))

/** As augmentBonus counts it: a line's bonuses × its rating (perRating) × its quantity; an accessory's by its own rating. */
function purchase(c: Sr6Catalog, data: Sr6Data, cr: CreationRules, x: Sr6Purchase, top = true): Sr6ExportPurchase {
  const e = entryOf(x, data)
  // values at the line's rating, else the entry's lowest; an unrated item has none (ratingOf's 1 is for pricing only)
  const base = e ? item(c, e, true, x.rating) : bare(x.kind, x.name ?? x.id ?? 'Custom item', x.id)
  const one = priced({ ...x, qty: 1, accessories: [] }, data, cr), values = { ...base.values }
  for (const k of ['cost', 'avail', 'essence'] as const)
    if (e ? values[k] !== undefined : x[k] !== undefined) values[k] = one[k]
  if (!e && x.rating !== undefined) values.rating = x.rating
  return defined({ ...base, uid: x.uid, values, qty: x.qty, grade: x.grade, worn: !!x.worn, note: x.note,
    bonuses: bonuses(x.bonuses, x.rating ?? 1, top ? x.qty : 1), accessories: x.accessories.map(a => purchase(c, data, cr, a, false)) })
}

/** An NPC's stat block, read at its rating, with dice pools against the catalog's skills. A contact goes out as a grunt
 *  of group Contact (v1's kinds: the module makes it an NPC actor). */
export const exportNpc = (npc: Sr6Npc, data: Sr6Data): Sr6ExportNpc => defined({ kind: npc.kind === 'contact' ? 'grunt' : npc.kind,
  rating: npc.rating, group: npc.kind === 'contact' ? 'Contact' : npc.group,
  from: npc.from, stats: npcValues(npc), lines: npc.lines.map(l => ({ ...l })), pools: npcPools(npc, data) })

/** The runner's copies of compendium entries the catalog no longer has stand in for them (src/sr6/engine/house.ts). */
export function exportSr6Runner(all: Sr6Catalog, allData: Sr6Data, cr: CreationRules, ch: Sr6Character, o: Sr6ExportOpts): Sr6ExportRunner {
  const c = withSr6House(all, ch.house).c, data = c === all ? allData : sr6Data(c)
  const b = currentBuild(ch), d = deriveSr6(data, cr, { ...ch, build: b }), id = ch.identity
  const money = ch.finalizedAt ? balances(ch) : { karma: d.karmaLeft, nuyen: d.nuyenLeft }
  const voided = voidedIds(ch), lifestyle = b.lifestyle && data.entry('lifestyles', b.lifestyle.id)
  return {
    id: ch.id, updatedAt: ch.updatedAt, exportedAt: o.now, streetName: id.streetName, realName: id.name, finalized: !!ch.finalizedAt,
    metatype: { id: b.metatype, name: data.metatypes[b.metatype]?.name ?? '' },
    magic: defined({ kind: b.magic, tradition: b.tradition, drainAttr: b.drainAttr, aspectedSkill: b.aspectedSkill, initiation: b.initiation, submersion: b.submersion }),
    portrait: id.portrait ?? null, token: id.token ?? null,
    attributes: d.attrs, essence: d.essence, edge: d.edge,
    skills: b.skills.map(s => defined({ id: s.id, name: data.skills[s.id]?.name ?? s.id, attr: data.skills[s.id]?.attr ?? '', rank: skillRank(s),
      spec: s.spec, expertise: s.expertise })),
    knowledge: b.knowledge.map(k => ({ name: k.name, kind: k.kind, native: !!k.native, rank: k.points + k.karma })),
    qualities: b.qualities.map(q => {
      const e = data.entry('qualities', q.id)
      return defined({ ...(e ? item(c, e, true) : bare('qualities', q.name ?? q.id, q.id)), uid: q.uid, positive: e?.attrs.kind !== 'negative',
        level: q.level, free: !!q.free, note: q.note })
    }),
    picks: b.picks.map(p => {
      const e = data.entry(p.kind, p.id)
      return defined({ ...(e ? item(c, e, true) : bare(p.kind, p.name ?? p.id, p.id)), uid: p.uid, pick: p.kind, level: p.level,
        bonuses: bonuses(p.bonuses, p.level ?? 1) })
    }),
    purchases: b.purchases.map(x => purchase(c, data, cr, x)),
    contacts: b.contacts.map(x => ({ uid: x.uid, name: x.name, archetype: x.archetype, connection: x.connection, loyalty: x.loyalty })),
    lifestyle: b.lifestyle ? defined({ id: b.lifestyle.id, name: lifestyle?.name ?? b.lifestyle.id, months: b.lifestyle.months, cost: num(lifestyle?.attrs.cost) }) : null,
    sins: b.sins.map(s => defined({ uid: s.uid, name: s.name, kind: s.kind, rating: s.rating, licences: s.licences.map(l => ({ name: l.name, rating: l.rating })) })),
    karma: money.karma, nuyen: money.nuyen,
    ...(ch.npc ? {} : { derived: defined({ initiative: d.initiative, astralInit: d.astralInit, monitors: d.monitors, defenseRating: d.defenseRating,
      composure: d.composure, judgeIntentions: d.judgeIntentions, memory: d.memory, liftCarry: d.liftCarry, drain: d.drain, fading: d.fading, pools: d.pools }) }),
    background: id.background ?? '', notes: id.notes ?? '',
    ledger: ch.ledger.filter(e => e.type !== 'void' && !voided.has(e.id)).map(e => ({ at: e.at, type: e.type, summary: ledgerLabel(e),
      karma: 'karma' in e ? e.karma : 0, nuyen: 'nuyen' in e ? e.nuyen : 0 })),
    ...(ch.npc ? { npc: exportNpc(ch.npc, data) } : {}),
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
  // not the implant grades: Foundry has no item for them (a purchase carries its grade's key)
  const kinds = (Object.keys(SR6_KINDS) as Sr6Kind[]).filter(k => k !== 'grades')
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
