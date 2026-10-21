// An owned vehicle's or drone's modifications (owner 2026-10-16, BUILDER Q5-Q7): with Double Clutch among the table's
// books, its rules (mod slots, p. 120; hardpoints, pp. 123-125; weapon mounts, p. 142); else the core rulebook's (weapon
// mounts up to the unaugmented Body / 3, a heavy one counting two, CRB p. 295; mods simply bought). A drone's autosofts
// (CRB p. 201) either way. The mods built in (Double Clutch p. 146: the catalog's <builtin>; a design's, its snapshot's)
// are fittings already paid for, never taken off (owner 2026-10-16, DESIGNER Q3): a built-in weapon mount holds a
// weapon and counts toward the hardpoints or mounts as a bought one; extra mod slots they give add to the vehicle's, and
// slots shifted between categories at 2:1 (DC p. 120) move them. What goes past a limit is a Review warning, never
// refused.
import { SLOT_KINDS, type SlotKind, type SlotShift, type Sr6Purchase } from '../../../formats/domain/character'
import type { Sr6Entry } from '../../../formats/domain/types'
import type { Sr6Data } from '../../../catalog/domain/data'
import { entryLabel } from '../../../catalog/domain/categories'
import { entryOf, hardpointOf, isDrone, isMount, modKind, ratingOf, type Hardpoint, type ModKind } from '../creation/purchases'
import { bookValue, dataFind } from '../../../catalog/domain/values'

export { SLOT_KINDS, type SlotKind }
/** A hardpoint in standard ones: one standard splits into two small, two make a large, three a huge (DC p. 124). */
export const HARDPOINT_UNITS: Record<Hardpoint, number> = { small: 0.5, standard: 1, large: 2, huge: 3 }

export interface Meter {
  used: number
  max: number
}
/** What a fitted line is to its vehicle: its kind and the mod slots or (DC) standard hardpoints it takes. */
export interface Fitted {
  uid: string
  kind: ModKind | 'weapon' | 'program' | 'other'
  slots: number
  units: number
}
export interface Builtin {
  /** its uid on the vehicle, `builtin:<n>` by its place among the vehicle's <builtin>s (from 0): a weapon in a built-in
   *  mount names it */
  uid: string
  name: string
  ref?: string
  rating?: string
  /** extra mod slots of a category it gives (`4 additional Chassis mod slots`); universal: a designed vehicle's Easily
   *  Modified slots, for any category (DC p. 152) */
  slots?: number
  category?: SlotKind | 'universal'
}
export interface VehicleMods {
  /** Double Clutch's rules (DC among the table's books), else the core rulebook's */
  dc: boolean
  drone: boolean
  /** DC: mod slots per category, each its unmodified Body plus what built-in mods add, less and plus what was shifted */
  slots?: Record<SlotKind, Meter>
  /** DC: the shifts between categories counted in `slots` (2 slots of one give 1 of another, p. 120) */
  shifts?: SlotShift[]
  /** DC: hardpoints, in standard ones */
  hardpoints?: Meter
  /** core rulebook: weapon mounts */
  mounts?: Meter
  /** a drone's autosofts and other programs: half its Pilot, rounded up */
  autosofts?: Meter
  fitted: Fitted[]
  builtin: Builtin[]
  /** its <note field="builtin">s, as printed */
  notes: string[]
  warnings: { message: string; source: string; page: number }[]
}

/** Slots a shift takes from one category to give one to another (DC p. 120: a 2:1 ratio). */
export const SHIFT_COST = 2
/** Why mod slots can't be shifted from one category to another on this vehicle now, or undefined: only with Double Clutch's
 *  rules, between two categories, out of slots not in use (p. 120: "any available ... mod slots"). */
export function shiftProblem(x: Sr6Purchase, from: SlotKind, to: SlotKind, data: Sr6Data): 'no-slots' | 'same-slot' | 'no-free-slots' | undefined {
  const m = modsOf(x, data)
  if (!m.slots) return 'no-slots'
  if (from === to) return 'same-slot'
  return m.slots[from].max - m.slots[from].used < SHIFT_COST ? 'no-free-slots' : undefined
}

/** A built-in mod in words: `Ceramic plate armor`, `Realistic features 4`, `4 more chassis mod slots`. */
export const builtinText = (b: Builtin) =>
  b.slots ? `${b.slots} more ${b.category} mod slots` : `${b.name}${b.rating && !b.name.endsWith(b.rating) ? ` ${b.rating}` : ''}`
/** The first whole number printed (`5`, `4/6`: 4), else 0. */
const first = (s?: string) => Number(/-?\d+/.exec(s ?? '')?.[0] ?? 0)
/** A drone's size (its class `DRONE_SMALL/…`, else its category's word); undefined: not a drone or not known. */
export function droneSize(e?: Sr6Entry): 'micro' | 'mini' | 'small' | 'medium' | 'large' | undefined {
  const m = /^DRONE_(MICRO|MINI|SMALL|MEDIUM|LARGE)/i.exec(e?.attrs.class ?? '') ?? /\b(micro|mini|small|medium|large)/i.exec(e?.attrs.category ?? '')
  return isDrone(e) && m ? (m[1].toLowerCase() as 'micro') : undefined
}
/** A hardpoint mod (`Small hardpoint`, DC pp. 124-125): the hardpoint it adds. */
const addsHardpoint = (e?: Sr6Entry): Hardpoint | undefined => /^(small|standard|large|huge) hardpoint$/i.exec(e?.name ?? '')?.[1].toLowerCase() as Hardpoint
/** How big a weapon is for a mount (DC p. 142; CRB p. 295): 0 an SMG or smaller, 1 an assault rifle or smaller (a rifle,
 *  a shotgun), 2 bigger (machine guns, cannons, launchers); undefined: not known (not checked). */
export function weaponSize(e?: Sr6Entry): 0 | 1 | 2 | undefined {
  const s = `${e?.attrs.class ?? ''} ${e?.attrs.category ?? ''}`
  return /hold-?outs?|pistol|submachine|taser/i.test(s)
    ? 0
    : /rifle|shotgun/i.test(s)
      ? 1
      : /\b[lmh]mg\b|machine gun|cannon|launcher|missile/i.test(s)
        ? 2
        : undefined
}
/** The biggest weapon a mount holds: a small one an SMG, a standard one an assault rifle, a large (heavy) one any. */
const mountHolds = (e: Sr6Entry) => (/\bsmall\b/i.test(e.name) ? 0 : /\b(heavy|large|huge)\b/i.test(e.name) ? 2 : 1)
const HOLDS = ['an SMG or smaller', 'an assault rifle or smaller', 'any weapon']

/** The mods built into a vehicle: its entry's (or design snapshot's) <builtin>s, each with its uid. */
function builtinsOf(e?: Sr6Entry): Builtin[] {
  return (e?.parts ?? [])
    .filter(p => p.tag === 'builtin' && p.attrs.name)
    .map((p, i) => {
      const cat = normCat(p.attrs.category) === 'universal' ? 'universal' : SLOT_KINDS.find(k => k === normCat(p.attrs.category))
      return {
        uid: `builtin:${i}`,
        name: p.attrs.name,
        ...(p.attrs.ref ? { ref: p.attrs.ref } : {}),
        ...(p.attrs.rating ? { rating: p.attrs.rating } : {}),
        ...(p.attrs.slots && cat ? { slots: first(p.attrs.slots), category: cat } : {}),
      }
    })
}
/** A built-in mod's catalog gear entry (its ref); none: a name only. */
const builtinEntry = (b: Builtin, data: Sr6Data) => (b.ref ? data.entry('gear', b.ref) : undefined)

export interface Mount {
  uid: string
  e: Sr6Entry
  name: string
  /** built in: already paid for, never taken off */
  builtin?: true
}
/** The weapon mounts on the vehicle a weapon can sit in: those fitted, then those built in (DESIGNER Q3). */
export function mountsOf(x: Sr6Purchase, data: Sr6Data): Mount[] {
  const out: Mount[] = []
  for (const a of x.accessories) {
    const e = entryOf(a, data)
    if (e && isMount(e)) out.push({ uid: a.uid, e, name: entryLabel(e) })
  }
  for (const b of builtinsOf(entryOf(x, data))) {
    const e = builtinEntry(b, data)
    if (e && isMount(e)) out.push({ uid: b.uid, e, name: builtinText(b), builtin: true })
  }
  return out
}

/** The vehicle's or drone's mod slots, hardpoints or weapon mounts, autosofts, built-in mods and what goes past them. */
export function modsOf(x: Sr6Purchase, data: Sr6Data): VehicleMods {
  const e = entryOf(x, data),
    a = e?.attrs ?? {},
    vname = e ? entryLabel(e) : (x.name ?? 'Custom vehicle'),
    dc = !!data.hasSource?.('DC'),
    drone = isDrone(e),
    body = first(a.body),
    find = dataFind(data)
  const warnings: VehicleMods['warnings'] = []
  const warn = (message: string, source: string, page: number) => warnings.push({ message, source, page })
  const builtin = builtinsOf(e)
  const notes = (e?.notes ?? []).filter(n => n.field === 'builtin').map(n => n.text)

  const fitted: Fitted[] = x.accessories.map(f => {
    const fe = entryOf(f, data),
      kind = f.kind === 'weapons' ? 'weapon' : f.kind === 'programs' ? 'program' : (modKind(fe) ?? 'other')
    let slots = 0
    if (dc && kind !== 'weapon' && kind !== 'program' && kind !== 'other' && kind !== 'accessory') {
      const v = bookValue(fe, 'slots', ratingOf(f, fe), find)
      if (v.ok) slots = v.n ?? 0
      else warn(`${vname}: ${fe ? entryLabel(fe) : 'a mod'}’s mod slots “${fe?.attrs.slots ?? ''}” aren’t a number the app can read; counted 0.`, 'DC', 120)
    }
    const h = hardpointOf(fe)
    return { uid: f.uid, kind, slots, units: dc && h ? HARDPOINT_UNITS[h] : 0 }
  })
  const out: VehicleMods = { dc, drone, fitted, builtin, notes, warnings }
  const line = (uid: string) => x.accessories.find(f => f.uid === uid)!
  const lineName = (uid: string) => {
    const fe = entryOf(line(uid), data)
    return fe ? entryLabel(fe) : (line(uid).name ?? 'Custom item')
  }

  if (dc) {
    // mod slots: the unmodified Body in each category (p. 120), more from a built-in mod; a hardpoint device's printed
    // slots are chassis ones (p. 124: "Core mod slots")
    out.slots = Object.fromEntries(
      SLOT_KINDS.map(k => [
        k,
        {
          used: fitted.reduce((t, f) => t + ((f.kind === 'hardpoint' ? 'chassis' : f.kind) === k ? f.slots : 0), 0),
          max: body + builtin.reduce((t, b) => t + (b.category === k ? (b.slots ?? 0) : 0), 0),
        },
      ]),
    ) as Record<SlotKind, Meter>
    // slots shifted to another category: two of one give one of another (p. 120)
    out.shifts = x.slotShifts ?? []
    for (const t of out.shifts) {
      out.slots[t.from].max -= SHIFT_COST
      out.slots[t.to].max += 1
    }
    // (a designed vehicle's universal slots take what a category goes past, DC p. 152)
    const universal = builtin.reduce((t, b) => t + (b.category === 'universal' ? (b.slots ?? 0) : 0), 0),
      over = SLOT_KINDS.reduce((t, k) => t + Math.max(0, out.slots![k].used - out.slots![k].max), 0)
    if (over > universal)
      for (const k of SLOT_KINDS) {
        const m = out.slots[k]
        if (m.used > m.max)
          warn(`${vname}: its ${k} mods take ${m.used} mod slots; it has ${m.max}${universal ? ` (and ${universal} universal)` : ''}.`, 'DC', 120)
      }
    // hardpoints: one standard a full three points of Body; a small drone with a Body of 3 or more one small instead (the
    // owner reads "over three" so, 2026-10-16), a micro or mini drone none (p. 124); hardpoint mods add theirs, built-in
    // ones too, and a built-in device (a weapon mount) takes its share as a bought one
    const size = droneSize(e)
    const free = size === 'micro' || size === 'mini' ? 0 : size === 'small' ? (body >= 3 ? 0.5 : 0) : Math.floor(body / 3)
    let added = 0,
      builtUsed = 0
    for (const b of builtin) {
      const be = builtinEntry(b, data),
        h = addsHardpoint(be),
        on = hardpointOf(be)
      if (h) added += HARDPOINT_UNITS[h]
      if (on) builtUsed += HARDPOINT_UNITS[on]
    }
    for (const f of x.accessories) {
      const h = addsHardpoint(entryOf(f, data))
      if (!h) continue
      added += HARDPOINT_UNITS[h]
      if (size === 'micro' || ((size === 'small' || size === 'mini') && h !== 'small'))
        warn(`${vname}: a ${size} drone ${size === 'micro' ? 'can’t add a hardpoint' : 'may only add a small hardpoint'} (${lineName(f.uid)}).`, 'DC', 124)
    }
    out.hardpoints = { used: fitted.reduce((t, f) => t + f.units, builtUsed), max: free + added }
    if (out.hardpoints.used > out.hardpoints.max)
      warn(`${vname}: what is on its hardpoints takes ${out.hardpoints.used} standard hardpoints; it has ${out.hardpoints.max}.`, 'DC', 124)
  } else {
    // the core rulebook: up to Body / 3 weapon mounts (rounded down, p. 201), a heavy one counting two (p. 295); built-in
    // ones too
    const used = mountsOf(x, data).reduce((t, m) => t + (mountHolds(m.e) === 2 ? 2 : 1), 0)
    out.mounts = { used, max: Math.floor(body / 3) }
    if (used > out.mounts.max) warn(`${vname}: ${used} weapon mounts (a heavy one counts two); its Body allows ${out.mounts.max}.`, 'CRB', 295)
  }
  // a drone runs half its Pilot in autosofts and programs, rounded up; more when slaved to a rigger command console (p. 201)
  if (drone) {
    out.autosofts = { used: fitted.filter(f => f.kind === 'program').length, max: Math.ceil(first(a.pilot) / 2) }
    if (out.autosofts.used > out.autosofts.max)
      warn(
        `${vname}: ${out.autosofts.used} autosofts and programs; its Pilot runs ${out.autosofts.max} (more when slaved to a rigger command console).`,
        'CRB',
        201,
      )
  }
  // every vehicle weapon sits in a weapon mount, one a mount, no bigger than it holds (DC p. 142; CRB p. 295)
  const cite: [string, number] = dc ? ['DC', 142] : ['CRB', 295]
  const mounts = mountsOf(x, data),
    inMount = new Map<Mount, number>()
  for (const f of x.accessories.filter(f => f.kind === 'weapons')) {
    const m = f.mount ? mounts.find(y => y.uid === f.mount) : undefined
    if (!m) {
      warn(`${vname}: ${lineName(f.uid)} isn’t in a weapon mount.`, ...cite)
      continue
    }
    inMount.set(m, (inMount.get(m) ?? 0) + 1)
    const size = weaponSize(entryOf(f, data))
    if (size !== undefined && size > mountHolds(m.e))
      warn(`${vname}: ${lineName(f.uid)} is too big for its ${m.name} (it holds ${HOLDS[mountHolds(m.e)]}).`, ...cite)
  }
  for (const [m, n] of inMount) if (n > 1) warn(`${vname}: ${n} weapons in one ${m.name}.`, ...cite)
  return out
}
const normCat = (s?: string) => (s ?? '').toLowerCase().replace(/ mod.*$/, '')
