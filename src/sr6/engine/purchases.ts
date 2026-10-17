// A purchase line: its catalog entry, rating, fitted accessories and price (cost, Availability, Essence), and the limits on
// what a runner may install or carry (augmentation families, vehicle seats and cargo, foci).
import type { PurchaseKind, Sr6Build, Sr6Purchase } from '../model/character'
import type { Sr6Entry } from '../model/types'
import { flag, type CreationRules } from './creation'
import type { Sr6Data } from './data'
import { normName } from './names'
import { gradeFactor, type GradeFactor } from './grades'
import { fieldName } from '../../shared/formula'
import { availability, bookValue, dataFind, ratingRange } from './values'
import { capacityUsed } from './categories'
import { qualityChoice } from './choices'
import { critterPrice, critterStat, critterValue } from './critters'

/** The editor tab each purchase kind is bought on. */
export const PURCHASE_TAB: Record<PurchaseKind, string> = {
  weapons: 'gear',
  armor: 'gear',
  electronics: 'gear',
  programs: 'gear',
  gear: 'gear',
  augmentations: 'augmentations',
  vehicles: 'vehicles',
  ammotypes: 'gear',
  critters: 'critters',
}
export const round2 = (x: number) => Math.round(x * 100) / 100

/** The catalog entry a purchase is priced from: the live one, else the snapshot it was exported with. */
export const entryOf = (x: Sr6Purchase, data: Sr6Data): Sr6Entry | undefined => (x.id ? (data.entry(x.kind, x.id) ?? x.snapshot) : undefined)
/** The rating a purchase is priced at and its per-rating effects count at: its own, else the lowest its entry comes in
 *  (one row of a book's per-rating split, `Wired Reflexes 3`, or a level's entry, levels.ts, comes in that rating only), else 1. */
export const ratingOf = (x: Sr6Purchase, e?: Sr6Entry) => x.rating ?? ratingRange(e?.attrs.rating)[0] ?? 1

/** An accessory as its host carries it: on an augmentation it has the host's grade, whatever the file says ("All
 *  accessories and add-ons must be of the same grade as the implant to which they are added", CRB p. 282). */
export function fitted(host: Sr6Purchase, a: Sr6Purchase): Sr6Purchase {
  if (host.kind !== 'augmentations' || a.grade === host.grade) return a
  const { grade: _, ...rest } = a
  return host.grade ? { ...rest, grade: host.grade } : rest
}

/** `x1.5`, `×2`: an add-on's price as a multiple of its host's (an ammunition type, CRB p. 261), else null. */
export const hostTimes = (v?: string): number | null => {
  const m = /^\s*[x×]\s*(\d+(?:\.\d+)?)\s*$/.exec(v ?? '')
  return m ? Number(m[1]) : null
}

/** A purchase line's cost (× qty, accessories added), Availability (its own; accessories are checked one by one) and
 *  Essence (× qty, accessories added but those taking the host's Capacity), at its rating, quantity and grade: an entry's <formula> when it has one
 *  (bookValue), else the printed value. A custom item (no id) uses the player's numbers. A value the app can't read or
 *  work out counts 0 and makes ok false (unpriced: the cost is the one); notes: what a formula had to assume. A critter
 *  is priced by Wild Life p. 180 (critters.ts critterPrice; its Essence: what its augmentations take) and gives its
 *  natural `body` to what is fitted to it: a value printed in Body (`Critter's Body x 50¥`, WL p. 186), and an
 *  augmentation's +10% a point of Body over 8 (Body Shop p. 135). */
export function priced(
  x: Sr6Purchase,
  data: Sr6Data,
  cr: CreationRules,
  host?: { cost: number; avail: number; essence: number; body?: number },
): { cost: number; avail: number; essence: number; ok: boolean; unpriced: boolean; notes: string[]; body?: number } {
  let cost: number,
    avail: number,
    essence: number,
    ok = true,
    unpriced = false
  const notes: string[] = [],
    perLine = new Set<string>()
  if (!x.id) {
    cost = x.cost ?? 0
    avail = x.avail ?? 0
    essence = x.essence ?? 0
  } else if (x.kind === 'critters') {
    const c = critterPrice(x, data)
    cost = c.cost
    avail = c.avail
    essence = 0
    unpriced = !c.ok
    ok = c.ok
    notes.push(...c.notes)
  } else {
    // ratingOf's rating, but none for an unrated item (a formula then notes it; a printed value reads at 1 as before)
    const e = entryOf(x, data),
      r = x.rating ?? ratingRange(e?.attrs.rating)[0],
      find = dataFind(data)
    const read = (attr: string) => {
      // (on a critter: a value printed in its Body, WL p. 186)
      if (host?.body !== undefined && !e?.formulas?.some(f => f.field === attr) && /\bbody\b/i.test(e?.attrs[attr] ?? '')) {
        const n = critterValue(e!.attrs[attr], { Body: host.body })
        if (n === null) ok = false
        if (n === null && attr === 'cost') unpriced = true
        return n ?? 0
      }
      // (H: the item an add-on is fitted to, its line's own value: a material's `x5` of the ammunition it goes on)
      const v = bookValue(e, attr, r, find, { Q: x.qty, H: host?.[attr as 'cost' | 'avail' | 'essence'] })
      if (!v.ok) {
        ok = false
        if (attr === 'cost') unpriced = true
      }
      if (v.perLine) perLine.add(attr)
      notes.push(...v.notes.map(n => `${fieldName(attr)}: ${n}`))
      return v.n ?? 0
    }
    // an add-on priced as a multiple of what it's fitted to (an ammunition type's `x2`, CRB p. 261: the ammunition's
    // price times it) adds host × (N − 1) to its host's line
    const times = host && !e?.formulas?.some(f => f.field === 'cost') ? hostTimes(e?.attrs.cost) : null
    if (times !== null) {
      cost = host!.cost * (times - 1)
      perLine.add('cost')
    } else cost = read('cost')
    avail = read('avail')
    essence = read('essence')
  }
  if (x.grade) {
    const g = (k: GradeFactor) => gradeFactor(cr, data, x.grade!, k)
    cost *= g('cost') ?? 1
    essence *= g('essence') ?? 1
    avail += g('avail') ?? 0
  }
  // a vehicle mod the player installs: half its nuyen (Double Clutch p. 120), never an accessory's (owner Q6)
  if (x.diy && diyAllowed(entryOf(x, data))) cost /= 2
  // an augmentation on a critter of natural Body over 8: +10% a point over (Body Shop p. 135)
  if (x.kind === 'augmentations' && host?.body !== undefined && host.body > 8) cost *= 1 + (host.body - 8) / 10
  // a formula with Q in it already works out the whole line
  if (!perLine.has('cost')) cost *= x.qty
  if (!perLine.has('essence')) essence *= x.qty
  const body = x.kind === 'critters' ? critterStat(entryOf(x, data), 'bod') : undefined
  const own = { cost, avail, essence, body }
  for (const a of x.accessories.map(a => fitted(x, a))) {
    const pa = priced(a, data, cr, own),
      ae = entryOf(a, data)
    // one fitted into the host's Capacity (`[2]`) costs no Essence of its own unless capacityAccessoryEssence (the
    // owner hasn't ruled: CRB pp. 285–286's tables print both; the book's samples print the host's alone, Smooth
    // Operations p. 99's cybereyes 3 with five enhancements: Essence 4.54)
    const ess = capacityUsed(ae, ratingOf(a, ae)) > 0 && !flag(cr, 'capacityAccessoryEssence') ? 0 : pa.essence
    cost += pa.cost
    essence += ess
    ok &&= pa.ok
  }
  return { cost, avail, essence: round2(essence), ok, unpriced, notes, ...(body !== undefined ? { body } : {}) }
}

/** The licence fee an owned line's Availability prints (`2, 500¥`): what its licence on a real SIN costs (on a fake SIN
 *  it is a fake licence, priced by rating: budgets.ts sinCost); undefined: none printed (a custom item prints none). */
export function licenceFee(x: Sr6Purchase, data: Sr6Data): number | undefined {
  const e = entryOf(x, data)
  return e && availability(e.attrs.avail, x.rating ?? ratingRange(e.attrs.rating)[0] ?? 1).fee
}

/** The Core Rulebook's licence types (CRB p. 273, the catalog's licencetypes) by the item they cover: `<purchase kind>
 *  <entry class>`, the first match (owner 2026-10-16). */
const LICENCE_TYPES: [RegExp, string][] = [
  [/^augmentations /, 'crb.cyberware-license'],
  [/^weapons WEAPON_FIREARMS\/RIFLE_HUNTING$/, 'crb.hunting-license'],
  [/^weapons /, 'crb.firearm-license'],
  [/ (ELECTRONICS\/CYBERDECK|CYBERDECK\/)/, 'crb.cyberdeck-license'],
  [/ ELECTRONICS\/RIGGER_CONSOLE$/, 'crb.rigger-remote-console-license'],
  [/^vehicles /, 'crb.drivers-license'],
]
/** An item's licence's name until the player renames it: the licence type covering it (LICENCE_TYPES, named as the
 *  catalog has it), else `Licence (<its category>)`. */
export function licenceName(x: Sr6Purchase, data: Sr6Data): string {
  const e = entryOf(x, data),
    id = LICENCE_TYPES.find(([re]) => re.test(`${x.kind} ${e?.attrs.class ?? ''}`))?.[1],
    t = id && data.entry('licencetypes', id)
  return t ? t.name : `Licence (${e?.attrs.category ?? x.kind})`
}

/** An augmentation's family and how many a runner may have (owner's decision 9, 2026-10-11: implied by biology): each
 *  augmentation once, its ratings one family (`Wired Reflexes 2` is Wired Reflexes); a cyberlimb once per body part, any
 *  variant, a paired part (arm, forearm, hand, leg, lower leg, foot) once per side, so twice. null: no limit (not an
 *  augmentation, or one naming its choice, `Reflex recorder (Skill)`, once per choice). */
export function augmentationSlot(e?: Sr6Entry): { family: string; most: number } | null {
  if (!e || e.kind !== 'augmentations' || qualityChoice(e.name)) return null
  if (/^cyberlimbs?$/i.test(e.attrs.category ?? '')) {
    const part = normName(e.name.split('(')[0])
    return { family: `limb:${part}`, most: ['arm', 'forearm', 'hand', 'leg', 'lower leg', 'foot'].includes(part) ? 2 : 1 }
  }
  return { family: normName(e.name).replace(/ (rating )?\d+$/, ''), most: 1 }
}
/** How many more of `e`'s family the runner may install (augmentationSlot; Infinity: no limit). */
export function augmentationRoom(b: Sr6Build, data: Sr6Data, e?: Sr6Entry): number {
  const slot = augmentationSlot(e)
  if (!slot) return Infinity
  return slot.most - b.purchases.filter(x => x.kind === 'augmentations' && augmentationSlot(entryOf(x, data))?.family === slot.family).length
}

/** A vehicle's Seating (two printed, `1/4`: the higher, Double Clutch p. 126). */
export const seatsOf = (e?: Sr6Entry) =>
  Math.max(
    0,
    ...(e?.attrs.seats ?? '')
      .split(/[^\d]+/)
      .filter(Boolean)
      .map(Number),
  )
/** A vehicle's Cargo Factor (Double Clutch p. 126): 150 percent of its Seating (125 on a motorcycle), 4 more on a truck;
 *  each seat removed adds its share (the option cargoWithoutSeats). null: no seats printed. */
export function cargoFactor(x: Sr6Purchase, e?: Sr6Entry): { seats: number; cargo: number } | null {
  const seats = seatsOf(e)
  if (!seats) return null
  const cat = e?.attrs.category ?? '',
    per = /bike|motorcycle/i.test(cat) ? 1.25 : 1.5,
    removed = Math.min(seats, x.seatsRemoved ?? 0)
  return { seats: seats - removed, cargo: Math.floor(per * seats + per * removed) + (/truck/i.test(cat) ? 4 : 0) }
}

/** A drone (by its class, `DRONE_SMALL/AIR`, else its category, `Small drone`): bought on the Drones tab. */
export const isDrone = (e?: Sr6Entry) => /^DRONE_/i.test(e?.attrs.class ?? '') || /drone/i.test(e?.attrs.category ?? '')
/** The editor tab a line is bought on: a drone's Drones (its Review path stays `vehicles.<uid>`: GM approvals keep). */
export const purchaseTab = (x: Sr6Purchase, data: Sr6Data) => (x.kind === 'vehicles' && isDrone(entryOf(x, data)) ? 'drones' : PURCHASE_TAB[x.kind])

/** A vehicle weapon mount (`Standard weapon mount`, `Small Turreted Weapon Mount`: by its name). */
export const isMount = (e?: Sr6Entry) => !!e && /\bweapon mount\b/i.test(e.name)
export type Hardpoint = 'small' | 'standard' | 'large' | 'huge'
/** The hardpoint a device attaches to (Double Clutch pp. 124, 142-145): its printed `hardpoint`; a mount printing none (the
 *  core rulebook's) by its name, a heavy one large. ponytail: a rack or arm without the attribute takes none. */
export function hardpointOf(e?: Sr6Entry): Hardpoint | undefined {
  const h = e?.attrs.hardpoint
  if (h === 'small' || h === 'standard' || h === 'large' || h === 'huge') return h
  return isMount(e) ? (/\bsmall\b/i.test(e!.name) ? 'small' : /\b(heavy|large)\b/i.test(e!.name) ? 'large' : 'standard') : undefined
}
export type ModKind = 'chassis' | 'powertrain' | 'electronics' | 'hardpoint' | 'accessory'
/** A gear entry as a vehicle mod (Double Clutch pp. 120-145): the slots it takes (chassis, skins included; powertrain;
 *  electronics), a device on a hardpoint (hardpointOf), or an accessory (no slots, no do-it-yourself saving, p. 120);
 *  null: not a vehicle mod. By its class (`MOD_POWER/…`), else its printed category. */
export function modKind(e?: Sr6Entry): ModKind | null {
  if (!e || e.kind !== 'gear') return null
  if (hardpointOf(e)) return 'hardpoint'
  const cls = (e.attrs.class ?? '').toUpperCase(),
    cat = e.attrs.category ?? ''
  if (/^ACCESSORY\/(VEHICLE|TIRES)/.test(cls) || /^accessory equipment$/i.test(cat)) return 'accessory'
  if (cls.startsWith('MOD_POWER') || /^powertrain mod/i.test(cat)) return 'powertrain'
  if (cls.startsWith('MOD_ELEC') || /^electronics? mod/i.test(cat)) return 'electronics'
  if (/^MOD_(CHASSIS|SKIN|HARD)/.test(cls) || /^(chassis|skin) mod|^vehicle modification$/i.test(cat)) return 'chassis'
  return null
}
/** Whether a fitted line may be installed by the player at half price: a vehicle mod, not an accessory (owner Q6). */
export const diyAllowed = (e?: Sr6Entry) => {
  const k = modKind(e)
  return k !== null && k !== 'accessory'
}

/** The statuses an item applies (its <status>s, CRB p. 51: the Molotov's `Burning 4`, No Future errata), as shown. */
export const statusesOf = (e?: Sr6Entry) =>
  (e?.parts ?? []).filter(p => p.tag === 'status' && p.attrs.name).map(p => `${p.attrs.name}${p.attrs.level ? ` ${p.attrs.level}` : ''}`)

/** A focus (CRB Hong Kong pp. 154–155, 294: the catalog's Foci category). */
export const isFocus = (e?: Sr6Entry) => !!e && /\bfoci\b/i.test(e.attrs.category ?? '')
