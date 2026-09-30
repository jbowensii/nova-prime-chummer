// Derived values shown on the sheet (CRB p.52, 60, 61, 67-68, 77).
import type { AmpEntry, AttrId, Build, Catalog, Character, KnowledgeEntry } from '../model/types'
import { ATTRS } from '../model/types'
import { ampEssence, FIREWALL_MAX } from './amps'
import { currentBuild } from './career'
import { nativeLanguage, slotLapse } from './price'

export type Thresholds = [number, number, number]
/** ammo: alternative DVs by ammunition, as the item's text or its amp's narrative lists them ("5 (gel)") */
export interface Weapon { uid: string; name: string; dv: string; ranges: string; specialist?: boolean; note?: string; ammo?: string[] }

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
export interface VehicleStats { uid: string; name: string; chassis: string; pilot: number; body: number; handling: number;
  speed: number; flying: boolean; armor: number; count: number; mount: string; thresholds: Thresholds; monitor: { light: number; serious: number } }
export interface Pool { skill: string; spec?: string; label: string; rating: number; attr: AttrId; dp: number; rr: number }
export interface Derived {
  build: Build
  edge: number
  essence: number
  essenceEffects: { magicHitsCancelled: number; healingHitsCancelled: number; socialDisadvantage: boolean; dead: boolean }
  monitor: { light: number; serious: number; incap: 1 }
  armor: { none: number; main: number; alt: number }
  thresholds: { physicalNone: Thresholds; physicalMain: Thresholds; physicalAlt: Thresholds; mental: Thresholds; matrix?: Thresholds }
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
}

/** A line of the Knowledge & languages list. at: its index in build.knowledge (-1: an automatic free slot not
 *  stored yet); source: "Free: keyword", "Free: <Skill> 4+", "Paid", or "Paid (<Skill> below 4)" / "Paid (keyword “X”
 *  removed)" for an entry whose free slot is gone, "Free: native language". key: knowledgeKey; hidden: left off the
 *  printed sheet. */
export interface KnowledgeRow extends KnowledgeEntry { paid: boolean; source: string; at: number; key: string; hidden: boolean }

/** A row's lasting identity for its place and visibility: its free slot, else the entry's own id (an entry from before
 *  ids: its kind and name). */
export const knowledgeKey = (k: Pick<KnowledgeEntry, 'from' | 'kind' | 'name' | 'id'>) => k.from ?? k.id ?? `${k.kind}:${k.name}`

/** One of the two lists (knowledge skills or languages) in display order: the player's order (build.knowledgeOrder)
 *  first, the rest A–Z. */
export function knowledgeList(rows: KnowledgeRow[], kind: KnowledgeEntry['kind'], order: string[] = []): KnowledgeRow[] {
  const pos = new Map(order.map((k, i) => [k, i]))
  // Infinity - Infinity is NaN (falsy): two unordered rows fall through to A–Z
  return rows.filter(r => r.kind === kind).sort((a, b) => ((pos.get(a.key) ?? Infinity) - (pos.get(b.key) ?? Infinity))
    || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

/** Every keyword and every skill at 4+ is a free entry (a stored entry with that `from` renames it or marks it a
 *  language; a keyword entry, keyed by the keyword's text, keeps its name); the other stored entries are paid. */
export function knowledgeRows(c: Catalog, b: Build, keywords: string[]): KnowledgeRow[] {
  const used = new Set<number>()
  const slot = (from: string) => { const at = b.knowledge.findIndex(k => k.from === from); if (at >= 0) used.add(at); return at }
  const skillName = (id: string) => c.skills.get(id)?.name ?? id
  const rows: Omit<KnowledgeRow, 'key' | 'hidden'>[] = []
  const native = (at: number) => b.knowledge[at]?.native ? { native: true as const } : {}
  for (const kw of new Set(keywords.map(k => k.trim()).filter(Boolean))) {
    const from = `keyword:${kw}`, at = slot(from)
    rows.push({ name: kw, kind: b.knowledge[at]?.kind ?? 'knowledge', from, ...native(at), paid: false, source: 'Free: keyword', at })
  }
  for (const s of b.skills.filter(s => s.rating >= 4)) {
    const from = `skill:${s.id}`, at = slot(from)
    rows.push({ name: b.knowledge[at]?.name || skillName(s.id), kind: b.knowledge[at]?.kind ?? 'knowledge', from, ...native(at), paid: false,
      source: `Free: ${skillName(s.id)} 4+`, at })
  }
  const first = nativeLanguage(b)
  b.knowledge.forEach((k, at) => {
    if (used.has(at)) return
    if (k === first) return rows.push({ ...k, paid: false, source: 'Free: native language', at })
    const lapse = slotLapse(b, keywords, k, skillName)
    rows.push({ ...k, paid: true, source: lapse ? `Paid (${lapse})` : k.native && k.kind === 'language' ? 'Paid (a second native language)' : 'Paid', at })
  })
  const hidden = new Set(b.knowledgeHidden ?? [])
  return rows.map(r => ({ ...r, key: knowledgeKey(r), hidden: hidden.has(knowledgeKey(r)) }))
}

const RR_CAP = 3 // max Risk Reduction on one Test (CRB p.61)
/** Amps whose extra wound boxes belong to a device, not the character (CRB p.62). */
export const DEVICE_TYPES = ['cyberdeck', 'vehicle']
const boxes = (effects: { ref: string }[]) => ({ light: 2 + (effects.some(e => e.ref === 'wound-light') ? 1 : 0), serious: 1 + (effects.some(e => e.ref === 'wound-serious') ? 1 : 0) })
/** An effect's most a character gets from all amps together (Armor +1, DV +1: p.61 "can't exceed the maximum bonus"). */
export const capped = (c: Catalog, ref: string, n: number) => Math.min(n, c.ampEffects.get(ref)?.max ?? Infinity)
const t3 = (x: number): Thresholds => [x, x + 3, x + 6]

/** Vehicle or drone stats: chassis + upgrades (CRB p.60, 62-63). Flying doubles the base Speed only (the chassis' flying
 *  speed when it has one); Speed upgrades add after that. */
export function vehicleStats(c: Catalog, a: AmpEntry): VehicleStats | undefined {
  const ch = a.vehicle ? c.vehicles.get(a.vehicle) : undefined
  if (!ch) return undefined
  const n = (ref: string) => a.effects.filter(e => e.ref === ref).length
  const flying = n('flying') > 0
  const fixed = n('fixed') > 0
  const speed = fixed ? 0 : (flying ? ch.flyingSpeed ?? Math.max(1, ch.speed * 2) : ch.speed) + n('speed-plus')
  const armor = ch.armor + n('vehicle-armor')
  return { uid: a.uid, name: a.name, chassis: ch.name, pilot: ch.pilot + n('pilot-plus'), body: ch.body, handling: ch.handling + n('handling-plus'),
    speed, flying, armor, count: 1 + n('extra-drone'), mount: ch.mount,
    thresholds: [ch.body + armor, 2 * ch.body + armor, 3 * ch.body + armor], monitor: boxes(a.effects) }
}

/** "STR+1", "S+2", "STR", "5", "12 (anti-vehicle 16)" -> damage value with this Strength. */
export function weaponDV(dv: string, str: number, plus = 0): string {
  const m = dv.trim().match(/^(?:STR|S)(?=\s*\+|\s*$)(?:\s*\+\s*(\d+))?(.*)$/i)
  if (m) return `${str + Number(m[1] ?? 0) + plus}${m[2]}`
  const k = dv.trim().match(/^(\d+)(.*)$/)
  return k ? `${Number(k[1]) + plus}${k[2]}` : dv
}

export function derive(c: Catalog, ch: Character): Derived {
  const b = ch.finalizedAt ? currentBuild(ch) : ch.build
  const meta = c.metatypes.get(ch.identity.metatype)
  const attr = (a: AttrId) => b.attributes[a] ?? 0
  const picks = b.amps.flatMap(a => a.effects.map(e => ({ amp: a, e })))
  const has = (ref: string) => picks.some(p => p.e.ref === ref)

  const essence = 6 - b.amps.reduce((s, a) => s + ampEssence(c, a), 0)

  // Armor: an item's own rating plus the armor an add-on is worn over; Armor +1 from equipment amps linked to those
  // items, and on any other amp (orthoskin, mystic armor...) always on, all together no more than the effect's max.
  const alwaysOn = picks.filter(p => p.e.ref === 'armor-plus' && p.amp.type !== 'equipment').length
  const worn = (uid?: string) => {
    let base = 0, plus = alwaysOn
    for (let it = b.items.find(i => i.uid === uid), depth = 0; it && depth < 4; it = b.items.find(i => i.uid === it!.over), depth++) {
      base += it.armor ?? 0
      plus += b.amps.filter(a => a.type === 'equipment' && a.linkedItem === it!.uid).reduce((s, a) => s + a.effects.filter(e => e.ref === 'armor-plus').length, 0)
      if (!it.over) break
    }
    return base + capped(c, 'armor-plus', plus)
  }
  // mental protection from Astral/Mystic Armor, biofeedback filters, code shells...: always on
  const mentalProtection = picks.filter(p => p.e.ref === 'mental-armor').length
  const armor = { none: worn(), main: worn(b.mainArmor), alt: worn(b.altArmor) }

  // Risk Reduction from amps
  const rrAttr = Object.fromEntries(ATTRS.map(a => [a, 0])) as Record<AttrId, number>
  const rrSkill = new Map<string, number>(), rrSpec = new Map<string, number>()
  for (const { e } of picks) {
    if (!e.param) continue
    if (e.ref === 'rr-attr') rrAttr[e.param as AttrId] = (rrAttr[e.param as AttrId] ?? 0) + 1
    if (e.ref === 'rr-skill') rrSkill.set(e.param, (rrSkill.get(e.param) ?? 0) + 1)
    if (e.ref === 'rr-spec') rrSpec.set(e.param, (rrSpec.get(e.param) ?? 0) + 1)
  }

  const pools: Pool[] = []
  for (const s of b.skills) {
    const sk = c.skills.get(s.id)
    if (!sk) continue
    const skRR = rrSkill.get(s.id) ?? 0
    if (s.rating > 0) {
      for (const a of [sk.attr, ...(sk.alt ? [sk.alt] : [])])
        pools.push({ skill: s.id, label: sk.name, rating: s.rating, attr: a, dp: s.rating + attr(a), rr: Math.min(RR_CAP, skRR + rrAttr[a]) })
    }
    // Where every spec uses the skill's attribute and the skill has an alternative
    // (Conjuring: Logic for mages, Charisma for shamans), specs get a row for both.
    const specAlt = sk.alt && sk.specs.every(x => x.attr === sk.attr) ? sk.alt : undefined
    for (const specId of s.specs) {
      const spec = sk.specs.find(x => x.id === specId)
      const name = spec?.name ?? specId.replace(/^custom:/, '')
      const first = spec?.attr ?? sk.attr
      for (const a of [first, ...(specAlt && first === sk.attr ? [specAlt] : [])])
        pools.push({ skill: s.id, spec: specId, label: `${sk.name} (${name})`, rating: s.rating, attr: a,
          dp: s.rating + 2 + attr(a), rr: Math.min(RR_CAP, skRR + (rrSpec.get(specId) ?? 0) + rrAttr[a]) })
    }
  }

  // Initiative: best single source; enhancements from different sources don't stack.
  let initiative: Derived['initiative']
  for (const a of b.amps) {
    const refs = a.effects.map(e => e.ref)
    const level = refs.includes('init-3') ? 3 : refs.includes('init-2') ? 2 : refs.includes('init-1') ? 1 : 0
    if (level && (!initiative || level > initiative.level))
      initiative = { level, realm: a.effects.find(e => e.ref === 'init-realm')?.param, source: a.name }
  }

  const emerged = b.amps.some(a => a.type === 'emerged')
  const deck = b.amps.find(a => a.type === 'cyberdeck')
  const firewall = emerged ? attr('wil') : deck ? Math.min(FIREWALL_MAX, 1 + deck.effects.filter(e => e.ref === 'firewall-plus').length) : undefined
  const attack = emerged ? attr('cha') : deck ? deck.effects.filter(e => e.ref === 'attack-plus').length : undefined

  // Weapons with damage worked out: unarmed is STR (CRB p.142) plus DV bonuses from implants and
  // adept powers; a weapon's own Equipment amp adds its DV bonuses, unless the book already printed
  // the final DV on the item (named book weapons).
  const unarmedPlus = capped(c, 'dv-plus', picks.filter(p => p.e.ref === 'dv-plus' && p.amp.type !== 'equipment').length)
  const weapons: Weapon[] = [{ uid: 'unarmed', name: 'Unarmed', dv: weaponDV('STR', attr('str'), unarmedPlus), ranges: 'OK/–/–/–' }]
  for (const it of b.items.filter(i => i.kind === 'weapon')) {
    const cat = (it.catalogId ? c.items.get(it.catalogId) : undefined) ?? it.snapshot
    const amp = b.amps.find(a => a.type === 'equipment' && a.linkedItem === it.uid)
    const plus = it.dv ? 0 : capped(c, 'dv-plus', amp?.effects.filter(e => e.ref === 'dv-plus').length ?? 0)
    const range = amp?.effects.find(e => e.ref === 'range-improve')?.param
    weapons.push({ uid: it.uid, name: it.name, dv: weaponDV(it.dv ?? cat?.dv ?? '?', attr('str'), plus),
      ranges: it.ranges ?? cat?.ranges ?? '', specialist: it.specialist, note: range ? `range improved: ${range}` : undefined })
    const ammo = ammoDVs([cat?.text, amp?.narrative, it.note].filter(Boolean).join('\n'))
    if (ammo.length) weapons[weapons.length - 1].ammo = ammo
  }
  const vehicles = b.amps.filter(a => a.type === 'vehicle').map(a => vehicleStats(c, a)).filter((x): x is VehicleStats => !!x)

  const knowledge = knowledgeRows(c, b, ch.narrative.keywords)

  return {
    build: b,
    edge: meta?.edge ?? 3,
    essence,
    essenceEffects: {
      magicHitsCancelled: (essence <= 5 ? 1 : 0) + (essence <= 3 ? 1 : 0),
      healingHitsCancelled: (essence <= 4 ? 1 : 0) + (essence <= 2 ? 1 : 0),
      socialDisadvantage: essence <= 1,
      dead: essence <= 0,
    },
    monitor: { ...boxes(picks.filter(p => !DEVICE_TYPES.includes(p.amp.type)).map(p => p.e)), incap: 1 },
    deckMonitor: deck && boxes(deck.effects),
    armor,
    thresholds: {
      physicalNone: t3(attr('str') + armor.none), physicalMain: t3(attr('str') + armor.main),
      physicalAlt: t3(attr('str') + armor.alt), mental: t3(attr('wil') + mentalProtection),
      matrix: firewall != null ? t3(firewall) : undefined,
    },
    pools,
    rrAttr,
    initiative,
    knowledge,
    awakened: { perception: has('awk-astral-perception') || has('awk-astral-projection'), projection: has('awk-astral-projection'),
      sorcery: has('awk-sorcery'), conjuring: has('awk-conjuring'), adept: has('awk-adept') },
    firewall,
    attack,
    mentalProtection,
    weapons,
    vehicles,
    emerged,
  }
}
