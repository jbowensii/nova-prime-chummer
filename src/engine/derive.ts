// Derived values shown on the sheet (CRB p.52, 60, 61, 67-68, 77).
import type { AttrId, Build, Catalog, Character } from '../model/types'
import { ATTRS } from '../model/types'
import { ampEssence } from './amps'
import { currentBuild } from './career'

export type Thresholds = [number, number, number]
export interface Pool { skill: string; spec?: string; label: string; rating: number; attr: AttrId; dp: number; rr: number }
export interface Derived {
  build: Build
  edge: number
  essence: number
  essenceEffects: { magicHitsCancelled: number; healingHitsCancelled: number; socialDisadvantage: boolean; dead: boolean }
  monitor: { light: number; serious: number; incap: 1 }
  armor: { none: number; main: number; alt: number }
  thresholds: { physicalNone: Thresholds; physicalMain: Thresholds; physicalAlt: Thresholds; mental: Thresholds; matrix?: Thresholds }
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
    for (const specId of s.specs) {
      const spec = sk.specs.find(x => x.id === specId)
      const a = spec?.attr ?? sk.attr
      const name = spec?.name ?? specId.replace(/^custom:/, '')
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

  const deck = b.amps.find(a => a.type === 'cyberdeck')
  const firewall = deck ? 1 + deck.effects.filter(e => e.ref === 'firewall-plus').length : undefined
  const attack = deck ? deck.effects.filter(e => e.ref === 'attack-plus').length : undefined

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
      physicalAlt: t3(attr('str') + armor.alt), mental: t3(attr('wil')),
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
  }
}
