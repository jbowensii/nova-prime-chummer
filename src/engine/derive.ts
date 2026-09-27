// Derived values shown on the sheet (CRB p.52, 60, 61, 67-68, 77).
import type { AmpEntry, AttrId, Build, Catalog, Character } from '../model/types'
import { ATTRS } from '../model/types'
import { ampEssence } from './amps'
import { currentBuild } from './career'

export type Thresholds = [number, number, number]
export interface Weapon { uid: string; name: string; dv: string; ranges: string; specialist?: boolean; note?: string }
export interface VehicleStats { uid: string; name: string; chassis: string; pilot: number; body: number; handling: number;
  speed: number; flying: boolean; armor: number; count: number; mount: string; thresholds: Thresholds }
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
  knowledge: string[]
  awakened: { perception: boolean; projection: boolean; sorcery: boolean; conjuring: boolean; adept: boolean }
  firewall?: number
  attack?: number
}

const RR_CAP = 3 // max Risk Reduction on one Test (CRB p.61)
const t3 = (x: number): Thresholds => [x, x + 3, x + 6]

/** Vehicle or drone stats: chassis + upgrades (CRB p.60, 62-63). Flying doubles base Speed. */
export function vehicleStats(c: Catalog, a: AmpEntry): VehicleStats | undefined {
  const ch = a.vehicle ? c.vehicles.get(a.vehicle) : undefined
  if (!ch) return undefined
  const n = (ref: string) => a.effects.filter(e => e.ref === ref).length
  const flying = n('flying') > 0
  const fixed = n('fixed') > 0
  const ground = ch.speed + n('speed-plus')
  const speed = fixed ? 0 : flying ? (n('speed-plus') === 0 && ch.flyingSpeed != null ? ch.flyingSpeed : Math.max(1, ground * 2)) : ground
  const armor = ch.armor + n('vehicle-armor')
  return { uid: a.uid, name: a.name, chassis: ch.name, pilot: ch.pilot + n('pilot-plus'), body: ch.body, handling: ch.handling + n('handling-plus'),
    speed, flying, armor, count: 1 + n('extra-drone'), mount: ch.mount,
    thresholds: [ch.body + armor, 2 * ch.body + armor, 3 * ch.body + armor] }
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

  // Armor: an item's own rating plus armor-plus from equipment amps linked to it;
  // armor-plus on any other amp (orthoskin, mystic armor...) is always on.
  const itemArmor = (uid?: string) => {
    if (!uid) return 0
    const it = b.items.find(i => i.uid === uid)
    if (!it) return 0
    const linked = b.amps.filter(a => a.type === 'equipment' && a.linkedItem === uid)
      .reduce((s, a) => s + a.effects.filter(e => e.ref === 'armor-plus').length, 0)
    return (it.armor ?? 0) + linked
  }
  const alwaysOn = picks.filter(p => p.e.ref === 'armor-plus' && p.amp.type !== 'equipment').length
  // mental protection from Astral/Mystic Armor, biofeedback filters, code shells...: always on
  const mentalProtection = picks.filter(p => p.e.ref === 'mental-armor').length
  const armor = { none: alwaysOn, main: itemArmor(b.mainArmor) + alwaysOn, alt: itemArmor(b.altArmor) + alwaysOn }

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
  const firewall = emerged ? attr('wil') : deck ? 1 + deck.effects.filter(e => e.ref === 'firewall-plus').length : undefined
  const attack = emerged ? attr('cha') : deck ? deck.effects.filter(e => e.ref === 'attack-plus').length : undefined

  // Weapons with damage worked out: unarmed is STR (CRB p.142) plus DV bonuses from implants and
  // adept powers; a weapon's own Equipment amp adds its DV bonuses, unless the book already printed
  // the final DV on the item (named book weapons).
  const unarmedPlus = picks.filter(p => p.e.ref === 'dv-plus' && p.amp.type !== 'equipment').length
  const weapons: Weapon[] = [{ uid: 'unarmed', name: 'Unarmed', dv: weaponDV('STR', attr('str'), unarmedPlus), ranges: 'OK/–/–/–' }]
  for (const it of b.items.filter(i => i.kind === 'weapon')) {
    const cat = (it.catalogId ? c.items.get(it.catalogId) : undefined) ?? it.snapshot
    const amp = b.amps.find(a => a.type === 'equipment' && a.linkedItem === it.uid)
    const plus = it.dv ? 0 : amp?.effects.filter(e => e.ref === 'dv-plus').length ?? 0
    const range = amp?.effects.find(e => e.ref === 'range-improve')?.param
    weapons.push({ uid: it.uid, name: it.name, dv: weaponDV(it.dv ?? cat?.dv ?? '?', attr('str'), plus),
      ranges: it.ranges ?? cat?.ranges ?? '', specialist: it.specialist, note: range ? `range improved: ${range}` : undefined })
  }
  const vehicles = b.amps.filter(a => a.type === 'vehicle').map(a => vehicleStats(c, a)).filter((x): x is VehicleStats => !!x)

  const knowledge = [...b.knowledge, ...ch.narrative.keywords.filter(Boolean),
    ...b.skills.filter(s => s.rating >= 4).map(s => c.skills.get(s.id)?.name ?? s.id)]

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
    monitor: { light: 2 + (has('wound-light') ? 1 : 0), serious: 1 + (has('wound-serious') ? 1 : 0), incap: 1 },
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
