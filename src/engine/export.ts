// src/engine/export.ts
// Chummer Anarchy export v1 (docs/export-format.md; schema public/data/schema/export.schema.json): runners and book
// data as JSON for other tools, first the Foundry importer module (jbowensii/chummer-anarchy2-foundry). Every number is
// the engine's own (derive, ampRating, balance), from the runner's current build. Pure: no DOM.
import type { AmpEntry, AttrId, Build, Catalog, Character, EffectPick, ItemEntry, Npc } from '../model/types'
import { ampCtx, ampEssence, ampFromTemplate, ampRating } from './amps'
import { isCanonSource } from './canon'
import { activeEvents, balance, changeText } from './career'
import { DEVICE_TYPES, derive } from './derive'
import { itemCost, price } from './price'

export const EXPORT_FORMAT = 'chummer-anarchy2-export', EXPORT_VERSION = 1
export type Range = 'ok' | 'disadvantage' | 'none'
export interface ExportOpts { descriptions: boolean; now: string; appVersion: string }
export interface ExportEffect { id: string; name: string; category: string; param?: string; value?: number; note?: string }
/** skill: on a spec line, the skill that owns the spec, when known */
export interface ExportRR { on: 'attribute' | 'skill' | 'spec'; id: string; name: string; value: number; skill?: string }
export interface ExportBonuses { light: number; serious: number; physicalThreshold: number; mentalThreshold: number;
  matrixThreshold: number; armor: number; anarchy: number; initiative: number }
export interface ExportAmp { uid: string; catalogId?: string; source?: string; page?: number; canon: boolean; type: string;
  typeName: string; name: string; rating: number; essence: number; effects: ExportEffect[]; rr: ExportRR[];
  bonuses: ExportBonuses; item?: string; vehicle?: string; description?: string }
export interface ExportItem { uid: string; catalogId?: string; kind: string; name: string; source?: string; page?: number;
  canon: boolean; price: number; starting?: string; note?: string; description?: string
  weapon?: { dv: string; dvText: string; ranges: Record<'melee' | 'short' | 'medium' | 'long', Range>; specialist: boolean; ammo: string[] }
  armor?: { value: number; over?: string } }
export interface ExportRunner {
  id: string; updatedAt: string; exportedAt: string; streetName: string; realName: string; finalized: boolean
  metatype: { id: string; name: string; ranges: Record<AttrId, [number, number]>; edge: number }
  level: { id: string; name: string }; lifestyle: { id: string; name: string; perRun: number }
  portrait: string | null; attributes: Record<AttrId, number>; edge: number; essence: number
  skills: { id: string; name: string; attr: string; rating: number; specs: { id: string; name: string; attr: string; custom: boolean }[] }[]
  knowledge: { name: string; kind: string; native: boolean }[]
  amps: ExportAmp[]; items: ExportItem[]
  vehicles: { uid: string; chassisId: string; name: string; chassis: string; count: number; pilot: number; body: number; handling: number; speed: number;
    armor: number; mount: string; flying: boolean; thresholds: number[]; monitor: { light: number; serious: number } }[]
  monitor: { light: number; serious: number; incap: number }
  thresholds: Record<string, number[]>; armor: { main: number; alt: number }
  initiative: { level: number; realm?: string; source: string } | null
  pools: { skill: string; spec?: string; label: string; attr: string; dp: number; rr: number }[]
  narrative: { keywords: string[]; dispositions: string[]; cues: string[] }; background: string; notes: string
  nuyen: { balance: number }; ledger: { at: string; type: string; summary: string; amount: number }[]
  /** an NPC's block (absent: a runner) */
  npc?: Npc
}
export interface ExportFile { format: typeof EXPORT_FORMAT; version: typeof EXPORT_VERSION; kind: 'runners' | 'books'
  exportedAt: string; app: { name: string; version: string }; descriptions: boolean
  runners?: ExportRunner[]; books?: ExportBook[]; tableRules?: { name: string; text: string }[] }
export interface ExportBook {
  source: { id: string; name: string; publisher: string; canon: boolean }
  amps: { id: string; source: string; page: number; canon: boolean; type: string; typeName: string; name: string; rating: number;
    essence: number; printedRating?: number; mod: boolean; effects: ExportEffect[]; rr: ExportRR[]; bonuses: ExportBonuses
    item?: { kind: string; specialist: boolean; armor?: number; dv?: string; ranges?: Record<'melee' | 'short' | 'medium' | 'long', Range> }
    vehicle?: string; description?: string }[]
  items: { id: string; source: string; page: number; canon: boolean; kind: string; name: string; category?: string; specialist: boolean
    armor?: number; dv?: string; ranges?: Record<'melee' | 'short' | 'medium' | 'long', Range>; description?: string }[]
  vehicles: { id: string; source: string; page: number; name: string; pilot: number; body: number; handling: number; speed: number
    flyingSpeed?: number; armor: number; mount: string }[]
  skills: { id: string; source: string; page: number; name: string; attr: string; alt?: string; specs: { id: string; name: string; attr: string }[] }[]
  specs: { skill: string; id: string; name: string; attr: string; page?: number }[]
  metatypes?: { id: string; source: string; page: number; canon: boolean; name: string; edge: number; ranges: Record<AttrId, [number, number]>; racialQuality: string }[]
  /** The book's own sample characters, each as a runner. */
  characters?: ExportRunner[]
  /** The book's NPCs, critters and spirits, each as a runner with its `npc` block. */
  npcs?: ExportRunner[]
  rules: { id: string; source: string; page: number; sheet: string; sheetName?: string; section: string; title: string; text?: string }[]
}

const SHEETS: Record<string, string> = { base: 'Basics', technomancers: 'Technomancers', optional: 'Optional rules', vehicles: 'Vehicles & Drones' }
/** A rules sheet's display name: a small table for the nicer names, else the sheet id title-cased. */
export const sheetDisplayName = (sheet: string) => SHEETS[sheet] ?? (sheet.split(/[-_\s]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ') || 'Rules')

const RANGE = (s = ''): Range => (/^ok/i.test(s.trim()) ? 'ok' : /^dis/i.test(s.trim()) ? 'disadvantage' : 'none')
/** "OK/OK/Dis./–" (melee/short/medium/long) as the file writes ranges. */
export function parseRanges(s?: string) {
  const [melee, short, medium, long] = (s ?? '').split('/')
  return { melee: RANGE(melee), short: RANGE(short), medium: RANGE(medium), long: RANGE(long) }
}

const count = (effects: EffectPick[], ref: string) => effects.filter(e => e.ref === ref).length
function specName(c: Catalog, id: string) {
  for (const sk of c.skills.values()) { const s = sk.specs.find(x => x.id === id); if (s) return s.name }
  return id.replace(/^custom:/, '')
}
/** An amp's effects by name, its Risk Reduction lines and its fixed bonuses, as the amp alone gives them (a book amp's
 *  values). exportRunner then attributes the capped ones across a runner's amps. skills: the runner's, to place a custom spec. */
export function ampParts(c: Catalog, type: string, effects: EffectPick[], skills: Build['skills'] = []) {
  const eff: ExportEffect[] = effects.map(e => {
    const a = c.ampEffects.get(e.ref)
    return { id: e.ref, name: a?.name ?? e.ref, category: a?.category ?? '', ...e.param ? { param: e.param } : {},
      ...e.value != null ? { value: e.value } : {}, ...e.note ? { note: e.note } : {} }
  })
  const rr = new Map<string, ExportRR>()
  for (const e of effects) {
    const on = e.ref === 'rr-attr' ? 'attribute' : e.ref === 'rr-skill' ? 'skill' : e.ref === 'rr-spec' ? 'spec' : null
    if (!on || !e.param) continue
    const name = on === 'attribute' ? c.attributes.get(e.param as AttrId)?.name ?? e.param : on === 'skill' ? c.skills.get(e.param)?.name ?? e.param : specName(c, e.param)
    const k = `${on}|${e.param}`
    const skill = on !== 'spec' ? undefined : e.param.startsWith('custom:') ? skills.find(s => s.specs.includes(e.param!))?.id
      : [...c.skills.values()].find(sk => sk.specs.some(x => x.id === e.param))?.id
    rr.set(k, { on, id: e.param, name, value: (rr.get(k)?.value ?? 0) + 1, ...skill ? { skill } : {} })
  }
  const device = DEVICE_TYPES.includes(type) // a deck's or vehicle's boxes are its own (CRB p.62)
  const init = count(effects, 'init-3') ? 3 : count(effects, 'init-2') ? 2 : count(effects, 'init-1') ? 1 : 0
  const bonuses: ExportBonuses = { light: device ? 0 : Math.min(1, count(effects, 'wound-light')),
    serious: device ? 0 : Math.min(1, count(effects, 'wound-serious')), physicalThreshold: 0,
    mentalThreshold: count(effects, 'mental-armor'), matrixThreshold: count(effects, 'firewall-plus'),
    armor: count(effects, 'armor-plus'), anarchy: 0, initiative: init }
  return { effects: eff, rr: [...rr.values()], bonuses }
}

/** derive's own rules for the capped bonuses, per amp so they add up to the sheet: a wound box and the initiative level
 *  count once, on the first amp that has them (initiative: the amp derive picks). */
function attribute(amps: AmpEntry[], parts: ReturnType<typeof ampParts>[]) {
  let light = false, serious = false, best = 0, bestAt = -1
  amps.forEach((a, i) => { const p = parts[i].bonuses
    if (p.initiative > best) { best = p.initiative; bestAt = i }
    if (DEVICE_TYPES.includes(a.type)) return
    if (p.light && !light) light = true; else p.light = 0
    if (p.serious && !serious) serious = true; else p.serious = 0 })
  parts.forEach((p, i) => { if (i !== bestAt) p.bonuses.initiative = 0 })
}

function exportAmp(c: Catalog, b: Character['build'], a: AmpEntry, o: ExportOpts, parts: ReturnType<typeof ampParts>): ExportAmp {
  const t = a.catalogId ? c.amps.get(a.catalogId) ?? a.snapshot : a.snapshot
  return { uid: a.uid, ...a.catalogId ? { catalogId: a.catalogId } : {}, ...t ? { source: t.source, page: t.page } : {},
    canon: isCanonSource(c, t?.source), type: a.type, typeName: c.ampTypes.get(a.type)?.name ?? a.type, name: a.name,
    rating: ampRating(c, a, ampCtx(b, a, c)), essence: ampEssence(c, a), ...parts,
    ...a.linkedItem ? { item: a.linkedItem } : {}, ...a.vehicle ? { vehicle: a.vehicle } : {},
    ...o.descriptions && a.narrative ? { description: a.narrative } : {} }
}

function exportItem(c: Catalog, it: ItemEntry, dv: Map<string, { dv: string; ammo: string[] }>, o: ExportOpts): ExportItem {
  const cat = it.catalogId ? c.items.get(it.catalogId) ?? it.snapshot : it.snapshot
  const text = cat?.text
  return { uid: it.uid, ...it.catalogId ? { catalogId: it.catalogId } : {}, kind: it.kind, name: it.name,
    ...cat ? { source: cat.source, page: cat.page } : {}, canon: isCanonSource(c, cat?.source), price: itemCost(c.pricing, it),
    ...it.starting ? { starting: it.starting } : {}, ...it.note ? { note: it.note } : {},
    ...it.kind === 'weapon' ? { weapon: { dv: dv.get(it.uid)?.dv ?? it.dv ?? cat?.dv ?? '', dvText: it.dv ?? cat?.dv ?? '',
      ranges: parseRanges(it.ranges ?? cat?.ranges), specialist: !!(it.specialist ?? cat?.specialist), ammo: dv.get(it.uid)?.ammo ?? [] } } : {},
    ...it.kind === 'armor' ? { armor: { value: it.armor ?? cat?.armor ?? 0, ...it.over ? { over: it.over } : {} } } : {},
    ...o.descriptions && text ? { description: text } : {} }
}

const ledgerLine = (e: ReturnType<typeof activeEvents>[number], itemName: (uid: string) => string | undefined) => ({ at: e.at, type: e.type,
  summary: ledgerSummary(e, itemName),
  amount: e.type === 'earn' ? e.amount : e.type === 'finalize' ? e.remaining : 'cost' in e && typeof e.cost === 'number' ? -e.cost : 0 })
function ledgerSummary(e: ReturnType<typeof activeEvents>[number], itemName: (uid: string) => string | undefined): string {
  const say = (verb: string, what?: string) => what ? `${verb} ${what}` : e.type
  switch (e.type) {
    case 'earn': return e.run
    case 'note': return e.text
    case 'change': return e.changes.map(changeText).join('; ')
    case 'finalize': return 'Creation finished'
    case 'buy': return say('Bought', e.item.name)
    case 'sell': return say('Sold', itemName(e.itemUid))
    case 'amp-add': return say('Added amp', e.amp.name)
    case 'amp-modify': return say('Changed amp', e.after.name)
    case 'advance': return say('Advanced', `${e.path} from ${e.from} to ${e.to}`)
    case 'spec-add': return say('Specialization', e.spec.replace(/^custom:/, ''))
    case 'knowledge-add': return say('Knowledge', e.name)
    default: return e.type
  }
}

/** what a critter or spirit without a metatype is shown as */
const NO_META: Record<string, string> = { critter: 'Critter', spirit: 'Spirit' }
export function exportRunner(c: Catalog, ch: Character, o: ExportOpts): ExportRunner {
  const d = derive(c, ch), b = d.build, meta = c.metatypes.get(ch.identity.metatype), life = c.lifestyles.get(ch.identity.lifestyle ?? 'low')
  const partsOf = b.amps.map(a => ampParts(c, a.type, a.effects, b.skills))
  attribute(b.amps, partsOf)
  const names = new Map<string, string>()
  for (const e of ch.career) if (e.type === 'buy') names.set(e.item.uid, e.item.name)
  for (const it of b.items) names.set(it.uid, it.name)
  const dv = new Map(d.weapons.map(w => [w.uid, { dv: w.dv, ammo: w.ammo ?? [] }]))
  return {
    id: ch.id, updatedAt: ch.updatedAt, exportedAt: o.now, streetName: ch.identity.streetName, realName: ch.identity.name,
    finalized: !!ch.finalizedAt,
    metatype: { id: ch.identity.metatype, name: meta?.name ?? (ch.identity.metatype || NO_META[ch.npc?.kind ?? ''] || ''), ranges: meta?.ranges ?? {} as never, edge: d.edge },
    level: { id: ch.level, name: c.levels.get(ch.level)?.name ?? ch.level },
    lifestyle: { id: ch.identity.lifestyle ?? 'low', name: life?.name ?? '', perRun: life?.perRun ?? 0 },
    portrait: ch.identity.portrait ?? null, attributes: b.attributes, edge: d.edge, essence: d.essence,
    skills: b.skills.map(s => { const sk = c.skills.get(s.id)
      return { id: s.id, name: sk?.name ?? s.id, attr: sk?.attr ?? '', rating: s.rating,
        specs: s.specs.map(id => { const sp = sk?.specs.find(x => x.id === id)
          return { id, name: sp?.name ?? id.replace(/^custom:/, ''), attr: sp?.attr ?? sk?.attr ?? '', custom: id.startsWith('custom:') } }) } }),
    knowledge: d.knowledge.map(k => ({ name: k.name, kind: k.kind, native: !!k.native })),
    amps: b.amps.map((a, i) => exportAmp(c, b, a, o, partsOf[i])),
    items: b.items.map(it => exportItem(c, it, dv, o)),
    vehicles: d.vehicles.map(v => ({ uid: v.uid, chassisId: b.amps.find(a => a.uid === v.uid)?.vehicle ?? '', name: v.name, chassis: v.chassis, count: v.count, pilot: v.pilot, body: v.body, handling: v.handling,
      speed: v.speed, armor: v.armor, mount: v.mount, flying: v.flying, thresholds: v.thresholds, monitor: v.monitor })),
    monitor: d.monitor, thresholds: { ...d.thresholds } as Record<string, number[]>, armor: { main: d.armor.main, alt: d.armor.alt },
    initiative: d.initiative ?? null,
    pools: d.pools.map(p => ({ skill: p.skill, ...p.spec ? { spec: p.spec } : {}, label: p.label, attr: p.attr, dp: p.dp, rr: p.rr })),
    narrative: { keywords: ch.narrative.keywords, dispositions: ch.narrative.dispositions, cues: ch.narrative.cues },
    background: ch.identity.background, notes: ch.identity.notes,
    nuyen: { balance: ch.finalizedAt ? balance(c, ch) : price(c, ch).remaining },
    ledger: activeEvents(ch).map(e => ledgerLine(e, uid => names.get(uid))),
    ...ch.npc ? { npc: { ...ch.npc } } : {},
  }
}

const envelope = (kind: ExportFile['kind'], o: ExportOpts): ExportFile =>
  ({ format: EXPORT_FORMAT, version: EXPORT_VERSION, kind, exportedAt: o.now, app: { name: 'Chummer Anarchy 2.0', version: o.appVersion }, descriptions: o.descriptions })

export const exportRunners = (c: Catalog, chs: Character[], o: ExportOpts): ExportFile =>
  ({ ...envelope('runners', o), runners: chs.map(ch => exportRunner(c, ch, o)) })

/** The ticked books as the app sees them (edits and house rules applied), with the table rules switched on, and each
 *  book's sample characters (`characters`, by source id) and NPCs (`npcs`, by source id) as runners. */
export function exportBooks(c: Catalog, sources: string[], tableRules: { name: string; text: string }[], o: ExportOpts,
  characters: Record<string, Character[]> = {}, npcs: Record<string, Character[]> = {}): ExportFile {
  const books: ExportBook[] = sources.flatMap(id => {
    const s = c.sources.get(id)
    if (!s) return []
    const mine = <T extends { source: string }>(m: Map<string, T>) => [...m.values()].filter(e => e.source === id)
    return [{
      source: { id: s.id, name: s.name, publisher: s.publisher, canon: s.canon },
      amps: mine(c.amps).map(t => {
        const { amp } = ampFromTemplate(t, () => 'export')
        return { id: t.id, source: t.source, page: t.page, canon: s.canon, type: t.type, typeName: c.ampTypes.get(t.type)?.name ?? t.type,
          name: t.name, rating: ampRating(c, amp, { isFirstQuality: false }), essence: ampEssence(c, amp),
          ...t.printedRating != null ? { printedRating: t.printedRating } : {}, mod: !!t.mod, ...ampParts(c, t.type, t.effects),
          ...t.item ? { item: { kind: t.item.kind, specialist: !!t.item.specialist, ...t.item.armor != null ? { armor: t.item.armor } : {},
            ...t.item.dv ? { dv: t.item.dv } : {}, ...t.item.ranges ? { ranges: parseRanges(t.item.ranges) } : {} } } : {},
          ...t.vehicle ? { vehicle: t.vehicle } : {}, ...o.descriptions && t.narrative ? { description: t.narrative } : {} }
      }),
      items: mine(c.items).map(i => ({ id: i.id, source: i.source, page: i.page, canon: s.canon, kind: i.kind, name: i.name,
        ...i.category ? { category: i.category } : {}, specialist: !!i.specialist, ...i.armor != null ? { armor: i.armor } : {},
        ...i.dv ? { dv: i.dv } : {}, ...i.ranges ? { ranges: parseRanges(i.ranges) } : {}, ...o.descriptions && i.text ? { description: i.text } : {} })),
      vehicles: mine(c.vehicles).map(v => ({ id: v.id, source: v.source, page: v.page, name: v.name, pilot: v.pilot, body: v.body,
        handling: v.handling, speed: v.speed, ...v.flyingSpeed != null ? { flyingSpeed: v.flyingSpeed } : {}, armor: v.armor, mount: v.mount })),
      skills: mine(c.skills).map(k => ({ id: k.id, source: k.source, page: k.page, name: k.name, attr: k.attr, ...k.alt ? { alt: k.alt } : {},
        specs: k.specs.filter(p => !p.source || p.source === id).map(p => ({ id: p.id, name: p.name, attr: p.attr })) })),
      // this book's specs on another book's skill (a new style for the core Close Combat)
      specs: [...c.skills.values()].filter(k => k.source !== id).flatMap(k => k.specs.filter(p => p.source === id)
        .map(p => ({ skill: k.id, id: p.id, name: p.name, attr: p.attr, ...p.page ? { page: p.page } : {} }))),
      metatypes: mine(c.metatypes).map(m => ({ id: m.id, source: m.source, page: m.page, canon: s.canon, name: m.name, edge: m.edge,
        ranges: m.ranges, racialQuality: m.racialQuality })),
      rules: mine(c.rules).map(r => ({ id: r.id, source: r.source, page: r.page, sheet: r.sheet, sheetName: sheetDisplayName(r.sheet),
        section: r.section.trim() || sheetDisplayName(r.sheet), title: r.title,
        ...o.descriptions && r.text ? { text: r.text } : {} })),
      ...characters[id]?.length ? { characters: characters[id].map(ch => exportRunner(c, ch, o)) } : {},
      ...npcs[id]?.length ? { npcs: npcs[id].map(ch => exportRunner(c, ch, o)) } : {},
    }]
  })
  return { ...envelope('books', o), books, tableRules: o.descriptions ? tableRules : tableRules.map(r => ({ name: r.name, text: '' })) }
}
