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
 *  work out counts 0 and makes ok false (unpriced: the cost is the one); notes: what a formula had to assume. */
export function priced(
  x: Sr6Purchase,
  data: Sr6Data,
  cr: CreationRules,
  host?: { cost: number; avail: number; essence: number },
): { cost: number; avail: number; essence: number; ok: boolean; unpriced: boolean; notes: string[]; licence?: number } {
  let cost: number,
    avail: number,
    essence: number,
    ok = true,
    unpriced = false,
    licence: number | undefined
  const notes: string[] = [],
    perLine = new Set<string>()
  if (!x.id) {
    cost = x.cost ?? 0
    avail = x.avail ?? 0
    essence = x.essence ?? 0
  } else {
    // ratingOf's rating, but none for an unrated item (a formula then notes it; a printed value reads at 1 as before)
    const e = entryOf(x, data),
      r = x.rating ?? ratingRange(e?.attrs.rating)[0],
      find = dataFind(data)
    const read = (attr: string) => {
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
    // its licences: the fee its Availability prints (`2, 500¥`) once for each SIN it is licensed on (owner 2026-10-16)
    const fee = x.licensedOn?.length ? licenceFee(x, data) : undefined
    if (fee !== undefined) licence = fee * x.licensedOn!.length
  }
  if (x.grade) {
    const g = (k: GradeFactor) => gradeFactor(cr, data, x.grade!, k)
    cost *= g('cost') ?? 1
    essence *= g('essence') ?? 1
    avail += g('avail') ?? 0
  }
  // a formula with Q in it already works out the whole line
  if (!perLine.has('cost')) cost *= x.qty
  if (!perLine.has('essence')) essence *= x.qty
  const own = { cost, avail, essence }
  if (licence) cost += licence
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
  return { cost, avail, essence: round2(essence), ok, unpriced, notes, ...(licence ? { licence } : {}) }
}

/** The licence fee an owned line's Availability prints (`2, 500¥`), paid once for each SIN it is licensed on; undefined:
 *  none printed (a custom item prints none). */
export function licenceFee(x: Sr6Purchase, data: Sr6Data): number | undefined {
  const e = entryOf(x, data)
  return e && availability(e.attrs.avail, x.rating ?? ratingRange(e.attrs.rating)[0] ?? 1).fee
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

/** The statuses an item applies (its <status>s, CRB p. 51: the Molotov's `Burning 4`, No Future errata), as shown. */
export const statusesOf = (e?: Sr6Entry) =>
  (e?.parts ?? []).filter(p => p.tag === 'status' && p.attrs.name).map(p => `${p.attrs.name}${p.attrs.level ? ` ${p.attrs.level}` : ''}`)

/** A focus (CRB Hong Kong pp. 154–155, 294: the catalog's Foci category). */
export const isFocus = (e?: Sr6Entry) => !!e && /\bfoci\b/i.test(e.attrs.category ?? '')
