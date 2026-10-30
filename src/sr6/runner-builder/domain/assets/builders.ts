// The weapon and cyberware builders' domain (owner rulings, weapon-cyber-builders): what a line holds and what more fits
// it (accessoryState, the one reading the Accessories chips and the builders share), a custom cyberlimb priced from the
// core rulebook's table, a player's own add-on (Review asks a GM to approve it), a saved item design bought onto a
// runner, and the step that takes an add-on off (career: the GM's refund, a factory part never refunds).
import type { Sr6Build, Sr6Character, Sr6Purchase } from '../../../formats/domain/character'
import type { Sr6Entry, Sr6Part } from '../../../formats/domain/types'
import type { Sr6Data } from '../../../catalog/domain/data'
import type { Sr6Advance } from '../../../formats/domain/character'
import { capacityRemaining, offeredOn } from '../../../catalog/domain/categories'
import { mountSlots, requirementsOf } from '../../../catalog/domain/structure'
import { newId } from '../../../../core/shared/types'
import { entryOf, ratingOf } from '../creation/purchases'
import { fittedParts, modsOf } from './vehiclemods'

/** A line's add-ons as its host carries them, its Capacity and mount slots left, whether it is full, and the picker's
 *  tests: `fits` (offered at all) and `blocked` (fits by hook but fails a host requirement: shown greyed with why).
 *  `filter`: what an entry with no category record must pass (the tab's isAccessory); critter/ammo: those pickers'. */
export function accessoryState(
  host: Sr6Purchase,
  data: Sr6Data,
  opts: { filter?: (e: Sr6Entry) => boolean; isAccessory: (e: Sr6Entry) => boolean; critter?: boolean; ammo?: boolean },
) {
  const he = entryOf(host, data)
  // (an accessory's qty is the line's whole: per host, what one of the line's items carries)
  const items = host.accessories.map(a => ({
    ...a,
    qty: Math.ceil((a.qty ?? 1) / Math.max(1, host.qty ?? 1)),
    entry: entryOf(a, data),
    rating: ratingOf(a, entryOf(a, data)),
  }))
  const remaining = capacityRemaining(he, items, ratingOf(host, he))
  const slots = mountSlots(he, [...fittedParts(host, data), ...items], ratingOf(host, he), host.addedSlots)
  for (const [id, left] of slots.remaining) if (left === Infinity) slots.remaining.delete(id) // (a hook with no limit: nothing to count)
  // a vehicle's factory parts take their hooks too (vehiclemods.ts usedByHook: the figure the guard and Review use)
  if (host.kind === 'vehicles')
    for (const [id, used] of Object.entries(modsOf(host, data).usedByHook))
      if (slots.remaining.has(id)) slots.remaining.set(id, slots.remaining.get(id)! - used)
  // a host with a Capacity is full by its Capacity (the add-time guard governs it that way); only a slot-only host by its mount slots
  const full = remaining !== null ? remaining <= 0 : slots.remaining.size > 0 && [...slots.remaining.values()].every(n => n <= 0)
  const { filter, critter, ammo } = opts
  const fits = (e: Sr6Entry) => (critter || ammo ? !filter || filter(e) : offeredOn(data.categories, e, he, filter, opts.isAccessory, host.addedSlots))
  const blocked = (e: Sr6Entry) => {
    const failed = critter || ammo ? [] : requirementsOf(e, he).failed
    return failed.length ? `needs ${failed.join('; ')}` : undefined
  }
  return { he, items, remaining, slots, full, fits, blocked }
}

/** A line anywhere in the build by its uid path (`host/weapon`: a weapon built into a cyberarm), or by a bare uid at any depth. */
export function lineAt(b: Sr6Build, path: string): Sr6Purchase | undefined {
  const uids = path.split('/').filter(Boolean)
  if (uids.length === 1) {
    const deep = (xs: Sr6Purchase[]): Sr6Purchase | undefined => {
      for (const x of xs) {
        if (x.uid === uids[0]) return x
        const y = deep(x.accessories)
        if (y) return y
      }
    }
    return deep(b.purchases)
  }
  let xs = b.purchases,
    x: Sr6Purchase | undefined
  for (const u of uids) {
    x = xs.find(y => y.uid === u)
    if (!x) return undefined
    xs = x.accessories
  }
  return x
}

/** Whether a line takes add-ons (the builders' Customise button): a weapon, or an augmentation with a Capacity or hooks. */
export function customisable(x: Sr6Purchase, data: Sr6Data): boolean {
  if (x.kind === 'weapons') return true
  if (x.kind !== 'augmentations') return false
  const e = entryOf(x, data)
  return !!e && ((!!e.attrs.capacity && !/^\s*\[/.test(e.attrs.capacity)) || e.parts.some(p => p.tag === 'slot'))
}

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

// ---- a player's own add-on (owner ruling 6)

export interface CustomAddon {
  name: string
  cost: number
  avail: number
  /** what it takes of a Capacity host ([n]); 0: none */
  capacity: number
  /** the hook it goes in on a weapon (`top`, `barrel`, `under` …); none: no hook */
  slot?: string
  essence?: number
  /** what it changes: item:ar / item:dv / item:concealability / test:combat on a weapon, limb-attr:str|agi or derived:* */
  effects: { target: string; value: string }[]
}
export const CUSTOM_ADDON_PREFIX = 'custom.addon-'
/** The add-on line a player's custom add-on makes: of the host's kind, with its own snapshot; Review flags it until a GM approves. */
export function customAddon(host: Sr6Purchase, a: CustomAddon): Sr6Purchase {
  const id = `${CUSTOM_ADDON_PREFIX}${newId()}`,
    kind = host.kind === 'augmentations' ? 'augmentations' : host.kind
  const parts: Sr6Part[] = a.effects.filter(f => f.target && f.value.trim()).map(f => effect(f.target, f.value.trim()))
  if (a.slot) parts.push({ tag: 'fits', attrs: { slot: a.slot }, text: '' })
  return {
    uid: newId(),
    kind,
    id,
    name: a.name.trim() || 'Custom add-on',
    qty: 1,
    accessories: [],
    snapshot: {
      id,
      kind,
      name: a.name.trim() || 'Custom add-on',
      source: 'Custom',
      page: 0,
      text: '',
      attrs: {
        category: host.kind === 'augmentations' ? 'Cyberlimb accessories' : 'Weapon accessories',
        cost: String(Math.max(0, a.cost)),
        avail: String(Math.max(0, a.avail)),
        ...(a.capacity > 0 ? { capacity: `[${a.capacity}]` } : {}),
        ...(a.essence ? { essence: String(Math.max(0, a.essence)) } : {}),
      },
      parts,
    },
  }
}
export const isCustomAddon = (x: Sr6Purchase) => !!x.id?.startsWith(CUSTOM_ADDON_PREFIX)

// ---- saved item designs (owner ruling 2)

/** The line a runner buys from a saved weapon or cyberware design: as built, marked with the design, approved when a GM
 *  made or approved the design (Review then asks nothing). Later edits to the design never change it. */
export function boughtItemDesign(doc: Sr6Character): Sr6Purchase {
  const d = doc.itemDesign!
  const { approved: _a, ...line } = structuredClone(d.line) // (the saved line's own mark is never trusted: only the design's)
  return { ...line, uid: newId(), qty: 1, design: doc.id, ...(d.approved ? { approved: true as const } : {}) }
}
/** A line saved as an item design (its own copy, no runner-specific SIN or design mark). */
export function itemDesignOf(x: Sr6Purchase): Sr6Character['itemDesign'] {
  const { sin: _s, design: _d, approved: _a, ...line } = structuredClone(x)
  return { kind: x.kind === 'weapons' ? 'weapon' : 'cyberware', line }
}

// ---- taking an add-on off (owner rulings 7 and 8)

/** The career step that takes an add-on off a line: a factory part comes off free (it was in the printed price), anything
 *  else with the GM's refund (typed; blank or not a number: 0). */
export function removalAdvance(host: Sr6Purchase, target: string, factory: boolean, refund: string | null): Sr6Advance | null {
  if (factory) return { op: 'part', target: host.uid, part: target }
  if (refund === null) return null // (the GM cancelled the prompt)
  const r = Math.max(0, Math.round(Number(refund.trim() || '0')))
  return { op: 'unfit', target, ...(Number.isFinite(r) && r > 0 ? { refund: r } : {}) }
}
