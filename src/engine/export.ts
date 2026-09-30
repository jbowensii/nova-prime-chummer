// src/engine/export.ts
// Chummer Anarchy export v1 (docs/export-format.md; schema public/data/schema/export.schema.json): runners and book
// data as JSON for other tools, first the Foundry importer module (jbowensii/chummer-anarchy2-foundry). Every number is
// the engine's own (derive, ampRating, balance), from the runner's current build. Pure: no DOM.
import type { AmpEntry, AttrId, Catalog, Character, EffectPick, ItemEntry } from '../model/types'
import { ampCtx, ampEssence, ampRating } from './amps'
import { isCanonSource } from './canon'
import { activeEvents, balance, changeText } from './career'
import { DEVICE_TYPES, derive } from './derive'
import { itemCost, price } from './price'

export const EXPORT_FORMAT = 'chummer-anarchy2-export', EXPORT_VERSION = 1
export type Range = 'ok' | 'disadvantage' | 'none'
export interface ExportOpts { descriptions: boolean; now: string; appVersion: string }
export interface ExportEffect { id: string; name: string; category: string; param?: string; value?: number; note?: string }
export interface ExportRR { on: 'attribute' | 'skill' | 'spec'; id: string; name: string; value: number }
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
  vehicles: { uid: string; name: string; chassis: string; pilot: number; body: number; handling: number; speed: number;
    armor: number; mount: string; flying: boolean; thresholds: number[]; monitor: { light: number; serious: number } }[]
  monitor: { light: number; serious: number; incap: number }
  thresholds: Record<string, number[]>; armor: { main: number; alt: number }
  initiative: { level: number; realm?: string; source: string } | null
  pools: { skill: string; spec?: string; label: string; attr: string; dp: number; rr: number }[]
  narrative: { keywords: string[]; dispositions: string[]; cues: string[] }; background: string; notes: string
  nuyen: { balance: number }; ledger: { at: string; type: string; summary: string; amount: number }[]
}
export interface ExportFile { format: typeof EXPORT_FORMAT; version: typeof EXPORT_VERSION; kind: 'runners' | 'books'
  exportedAt: string; app: { name: string; version: string }; descriptions: boolean
  runners?: ExportRunner[]; books?: ExportBook[]; tableRules?: { name: string; text: string }[] }
// ExportBook: Task 2
export interface ExportBook { source: { id: string; name: string; publisher: string; canon: boolean } }

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
/** An amp's effects by name, its Risk Reduction lines and its fixed bonuses. */
export function ampParts(c: Catalog, type: string, effects: EffectPick[]) {
  const eff: ExportEffect[] = effects.map(e => {
    const a = c.ampEffects.get(e.ref)
    return { id: e.ref, name: a?.name ?? e.ref, category: a?.category ?? '', ...e.param ? { param: e.param } : {},
      ...e.value ? { value: e.value } : {}, ...e.note ? { note: e.note } : {} }
  })
  const rr = new Map<string, ExportRR>()
  for (const e of effects) {
    const on = e.ref === 'rr-attr' ? 'attribute' : e.ref === 'rr-skill' ? 'skill' : e.ref === 'rr-spec' ? 'spec' : null
    if (!on || !e.param) continue
    const name = on === 'attribute' ? c.attributes.get(e.param as AttrId)?.name ?? e.param : on === 'skill' ? c.skills.get(e.param)?.name ?? e.param : specName(c, e.param)
    const k = `${on}|${e.param}`
    rr.set(k, { on, id: e.param, name, value: (rr.get(k)?.value ?? 0) + 1 })
  }
  const device = DEVICE_TYPES.includes(type) // a deck's or vehicle's boxes are its own (CRB p.62)
  const init = count(effects, 'init-3') ? 3 : count(effects, 'init-2') ? 2 : count(effects, 'init-1') ? 1 : 0
  const bonuses: ExportBonuses = { light: device ? 0 : Math.min(1, count(effects, 'wound-light')),
    serious: device ? 0 : Math.min(1, count(effects, 'wound-serious')), physicalThreshold: 0,
    mentalThreshold: count(effects, 'mental-armor'), matrixThreshold: count(effects, 'firewall-plus'),
    armor: count(effects, 'armor-plus'), anarchy: 0, initiative: init }
  return { effects: eff, rr: [...rr.values()], bonuses }
}

function exportAmp(c: Catalog, b: Character['build'], a: AmpEntry, o: ExportOpts): ExportAmp {
  const t = a.catalogId ? c.amps.get(a.catalogId) ?? a.snapshot : a.snapshot
  return { uid: a.uid, ...a.catalogId ? { catalogId: a.catalogId } : {}, ...t ? { source: t.source, page: t.page } : {},
    canon: isCanonSource(c, t?.source), type: a.type, typeName: c.ampTypes.get(a.type)?.name ?? a.type, name: a.name,
    rating: ampRating(c, a, ampCtx(b, a, c)), essence: ampEssence(c, a), ...ampParts(c, a.type, a.effects),
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

const ledgerLine = (e: ReturnType<typeof activeEvents>[number]) => ({ at: e.at, type: e.type,
  summary: e.type === 'earn' ? e.run : e.type === 'note' ? e.text : e.type === 'change' ? e.changes.map(changeText).join('; ') : e.type,
  amount: e.type === 'earn' ? e.amount : 'cost' in e && typeof e.cost === 'number' ? -e.cost : 0 })

export function exportRunner(c: Catalog, ch: Character, o: ExportOpts): ExportRunner {
  const d = derive(c, ch), b = d.build, meta = c.metatypes.get(ch.identity.metatype), life = c.lifestyles.get(ch.identity.lifestyle ?? 'low')
  const dv = new Map(d.weapons.map(w => [w.uid, { dv: w.dv, ammo: w.ammo ?? [] }]))
  return {
    id: ch.id, updatedAt: ch.updatedAt, exportedAt: o.now, streetName: ch.identity.streetName, realName: ch.identity.name,
    finalized: !!ch.finalizedAt,
    metatype: { id: ch.identity.metatype, name: meta?.name ?? ch.identity.metatype, ranges: meta?.ranges ?? {} as never, edge: d.edge },
    level: { id: ch.level, name: c.levels.get(ch.level)?.name ?? ch.level },
    lifestyle: { id: ch.identity.lifestyle ?? 'low', name: life?.name ?? '', perRun: life?.perRun ?? 0 },
    portrait: ch.identity.portrait ?? null, attributes: b.attributes, edge: d.edge, essence: d.essence,
    skills: b.skills.map(s => { const sk = c.skills.get(s.id)
      return { id: s.id, name: sk?.name ?? s.id, attr: sk?.attr ?? '', rating: s.rating,
        specs: s.specs.map(id => { const sp = sk?.specs.find(x => x.id === id)
          return { id, name: sp?.name ?? id.replace(/^custom:/, ''), attr: sp?.attr ?? sk?.attr ?? '', custom: id.startsWith('custom:') } }) } }),
    knowledge: d.knowledge.map(k => ({ name: k.name, kind: k.kind, native: !!k.native })),
    amps: b.amps.map(a => exportAmp(c, b, a, o)),
    items: b.items.map(it => exportItem(c, it, dv, o)),
    vehicles: d.vehicles.map(v => ({ uid: v.uid, name: v.name, chassis: v.chassis, pilot: v.pilot, body: v.body, handling: v.handling,
      speed: v.speed, armor: v.armor, mount: v.mount, flying: v.flying, thresholds: v.thresholds, monitor: v.monitor })),
    monitor: d.monitor, thresholds: { ...d.thresholds } as Record<string, number[]>, armor: { main: d.armor.main, alt: d.armor.alt },
    initiative: d.initiative ?? null,
    pools: d.pools.map(p => ({ skill: p.skill, ...p.spec ? { spec: p.spec } : {}, label: p.label, attr: p.attr, dp: p.dp, rr: p.rr })),
    narrative: { keywords: ch.narrative.keywords, dispositions: ch.narrative.dispositions, cues: ch.narrative.cues },
    background: ch.identity.background, notes: ch.identity.notes,
    nuyen: { balance: ch.finalizedAt ? balance(c, ch) : price(c, ch).remaining },
    ledger: activeEvents(ch).map(ledgerLine),
  }
}

const envelope = (kind: ExportFile['kind'], o: ExportOpts): ExportFile =>
  ({ format: EXPORT_FORMAT, version: EXPORT_VERSION, kind, exportedAt: o.now, app: { name: 'Chummer Anarchy 2.0', version: o.appVersion }, descriptions: o.descriptions })

export const exportRunners = (c: Catalog, chs: Character[], o: ExportOpts): ExportFile =>
  ({ ...envelope('runners', o), runners: chs.map(ch => exportRunner(c, ch, o)) })
