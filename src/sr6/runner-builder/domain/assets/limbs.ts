// The builders' custom cyberlimbs (CRB p. 288) and the entries they are priced from. A leaf module (purchases.ts entryOf
// re-derives a limb's entry from here, so it imports nothing of the builders); assets/builders.ts re-exports it.
import type { Sr6Purchase } from '../../../formats/domain/character'
import type { Sr6Entry, Sr6Part } from '../../../formats/domain/types'
import { newId } from '../../../../core/shared/types'

// ---- custom cyberlimbs (CRB p. 288, "Cyberlimb cost and capacity"; the attribute increase, "Cyberlimb accessories")

export type LimbPart = 'skull' | 'torso' | 'arm' | 'forearm' | 'hand' | 'leg' | 'lowerleg' | 'foot'
export type LimbLook = 'synthetic' | 'obvious'
/** CRB p. 288: Essence, Availability and each look's cost (Capacity). */
export const CYBERLIMBS: Record<LimbPart, { name: string; essence: number; avail: number; synthetic: [number, number]; obvious: [number, number] }> = {
  skull: { name: 'Skull', essence: 0.75, avail: 5, synthetic: [15000, 2], obvious: [10000, 4] },
  torso: { name: 'Torso', essence: 1.5, avail: 4, synthetic: [25000, 5], obvious: [20000, 10] },
  arm: { name: 'Arm', essence: 1, avail: 4, synthetic: [20000, 8], obvious: [15000, 15] },
  forearm: { name: 'Forearm', essence: 0.45, avail: 3, synthetic: [12000, 5], obvious: [10000, 10] },
  hand: { name: 'Hand', essence: 0.25, avail: 3, synthetic: [6000, 2], obvious: [5000, 4] },
  leg: { name: 'Leg', essence: 1, avail: 4, synthetic: [20000, 10], obvious: [15000, 20] },
  lowerleg: { name: 'Lower leg', essence: 0.45, avail: 4, synthetic: [12000, 6], obvious: [10000, 12] },
  foot: { name: 'Foot', essence: 0.25, avail: 4, synthetic: [6000, 2], obvious: [5000, 4] },
}
/** CRB p. 288: "The maximum augmented increase of 4 is in place here": an increase's rating, at most. */
export const LIMB_MAX = 4
/** CRB p. 288's Attribute increase: [Rating] Capacity, Availability Rating, Rating × 5,000¥. Armor's adds to the Defense Rating
 *  ("Increases to Armor increase your Defense Ratings at all times"); Agility's and Strength's are the limb's own. */
const INC_COST = 5000
export type LimbStat = 'str' | 'agi' | 'armor'
export const LIMB_STATS: [LimbStat, string][] = [
  ['str', 'Strength'],
  ['agi', 'Agility'],
  ['armor', 'Armor'],
]
const effect = (target: string, value: string): Sr6Part => ({ tag: 'effect', attrs: { target, op: 'add', value }, text: '' })
const snap = (id: string, kind: Sr6Entry['kind'], name: string, attrs: Record<string, string>, parts: Sr6Part[] = []): Sr6Entry => ({
  id,
  kind,
  name,
  source: 'CRB',
  page: 288,
  text: '',
  attrs,
  parts,
})

/** A custom cyberlimb line (owner ruling 4): its part and look priced from the table, one Physical box for a full limb (CRB p. 288:
 *  "Each cyberlimb adds one box"; FULL_LIMBS), and the attribute increases bought with it as its add-ons. */
export function customLimb(part: LimbPart, look: LimbLook, inc: Partial<Record<LimbStat, number>> = {}): Sr6Purchase {
  const t = CYBERLIMBS[part],
    [cost, capacity] = t[look],
    id = `custom.limb-${part}-${look}`
  const name = `Cyberlimb: ${t.name} (${look})`
  return {
    uid: newId(),
    kind: 'augmentations',
    id,
    name,
    qty: 1,
    accessories: LIMB_STATS.flatMap(([k]) => (inc[k] ? [limbIncrease(k, inc[k]!)] : [])),
    snapshot: snap(
      id,
      'augmentations',
      name,
      {
        category: 'Cyberlimbs',
        type: 'Cyberware',
        essence: String(t.essence),
        avail: String(t.avail),
        cost: String(cost),
        capacity: String(capacity),
      },
      FULL_LIMBS.has(part) ? [effect('derived:physical-monitor', '1')] : [],
    ),
  }
}
/** Owner ruling 2026-10-30: only a full limb (arm, leg, skull, torso) adds the Physical box; hands, feet, forearms, lower legs don't. */
const FULL_LIMBS = new Set<LimbPart>(['skull', 'torso', 'arm', 'leg'])
/** One attribute increase on a custom limb at `rating` (1 to LIMB_MAX). */
export function limbIncrease(stat: LimbStat, rating: number): Sr6Purchase {
  const r = Math.min(LIMB_MAX, Math.max(1, Math.trunc(rating))),
    id = `custom.limb-increase-${stat}-${r}`,
    label = LIMB_STATS.find(([k]) => k === stat)![1]
  const name = `${label} increase ${r}`
  return {
    uid: newId(),
    kind: 'augmentations',
    id,
    name,
    qty: 1,
    snapshot: snap(
      id,
      'augmentations',
      name,
      { category: 'Cyberlimb accessories', type: 'Cyberware', capacity: `[${r}]`, avail: String(r), cost: String(r * INC_COST) },
      [effect(stat === 'armor' ? 'derived:defense' : `limb-attr:${stat}`, String(r))],
    ),
    accessories: [],
  }
}
/** The entry a builders' custom limb (or its attribute increase) is priced from, re-derived from the CYBERLIMBS table: a line's
 *  own snapshot is the client's word, never trusted for these. undefined: not a limb the builder makes. */
export function limbSnapshot(x: Sr6Purchase): Sr6Entry | undefined {
  const l = limbOf(x)
  if (l) return customLimb(l.part, l.look).snapshot
  const k = /^custom\.limb-increase-(str|agi|armor)-([1-9])$/.exec(x.id ?? '')
  return k && Number(k[2]) <= LIMB_MAX ? limbIncrease(k[1] as LimbStat, Number(k[2])).snapshot : undefined
}
/** A custom limb's part, look and increases back from its line (undefined: not one the builder made). */
export function limbOf(x: Sr6Purchase): { part: LimbPart; look: LimbLook; inc: Partial<Record<LimbStat, number>> } | undefined {
  const m = /^custom\.limb-(\w+)-(synthetic|obvious)$/.exec(x.id ?? '')
  if (!m || !(m[1] in CYBERLIMBS)) return undefined
  const inc: Partial<Record<LimbStat, number>> = {}
  for (const a of x.accessories) {
    const k = /^custom\.limb-increase-(str|agi|armor)-(\d)$/.exec(a.id ?? '')
    if (k) inc[k[1] as LimbStat] = Number(k[2])
  }
  return { part: m[1] as LimbPart, look: m[2] as LimbLook, inc }
}
