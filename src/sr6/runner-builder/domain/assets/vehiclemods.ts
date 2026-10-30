// An owned vehicle's or drone's modifications (owner 2026-10-16, BUILDER Q5-Q7): with Double Clutch among the table's
// books, its rules (mod slots, p. 120; hardpoints, pp. 123-125; weapon mounts, p. 142); else the core rulebook's (weapon
// mounts up to the unaugmented Body / 3, a heavy one counting two, CRB p. 295; mods simply bought). A drone's autosofts
// (CRB p. 201) either way. The mods built in (Double Clutch p. 146: the catalog's <builtin>; a design's, its snapshot's)
// are fittings already paid for, never taken off (owner 2026-10-16, DESIGNER Q3): a built-in weapon mount holds a
// weapon and counts toward the hardpoints or mounts as a bought one; extra mod slots they give add to the vehicle's, and
// slots shifted between categories at 2:1 (DC p. 120) move them. What goes past a limit is a Review warning, never
// refused.
import { SHIFT_KINDS, SLOT_KINDS, type ShiftKind, type SlotKind, type SlotShift, type Sr6Purchase } from '../../../formats/domain/character'
import type { Sr6Entry, Sr6Part } from '../../../formats/domain/types'
import type { Sr6Data } from '../../../catalog/domain/data'
import { entryLabel } from '../../../catalog/domain/categories'
import { structureOf } from '../../../catalog/domain/structure'
import { entryOf, hardpointOf, isDrone, isMount, modKind, ratingOf, type Hardpoint, type ModKind } from '../creation/purchases'
import { bookValue, dataFind } from '../../../catalog/domain/values'
import { evalFormula } from '../../../../core/shared/formula'

export { SLOT_KINDS, SHIFT_KINDS, type SlotKind, type ShiftKind }
/** The metered mod-slot families that are shown/enforced only when Commlink6 declares a capacity for the vehicle. */
const DECLARED_ONLY: SlotKind[] = ['cf', 'accessory', 'tires']
/** The slot id of a mod-slot family (`chassis` -> `vehicle-chassis`): the generator's HOOK/fits vocabulary. */
const slotId = (k: SlotKind) => `vehicle-${k}`
/** A declared slot's capacity as a whole number (its `<slot value>`), or undefined when it carries no readable value. */
const slotCap = (v?: string) => {
  const n = Number(v)
  return v && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : undefined
}
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
/** A factory part of a vehicle or drone (the catalog's `<part>`, docs/analysis/sr6-vehicle-decomposition.md 3.2): it
 *  occupies `cost` of its `hook` exactly as a fitted mod does, until removed (removedParts, or an ancestor's). */
export interface FactoryPart {
  /** the part's id on the vehicle (a repeated id gets `#2` ...); removedParts holds these */
  id: string
  /** its uid as a weapon mount, `part:<id>` (a weapon's `mount`) */
  uid: string
  ref: string
  name: string
  hook: string
  cost: number
  rating?: string
  parent?: string
  /** the pick a factory program comes with (a tutorsoft's skill), shown with its name */
  choice?: string
  /** removed by the player (or with a removed ancestor): takes nothing of its hook, grants and holds nothing */
  removed: boolean
  review?: string
  /** cl6 (Commlink6's embed), book, or synth (the importer made it: the powerplant, plan Stage 2b) */
  origin?: string
  entry?: Sr6Entry
}
export interface VehicleMods {
  /** Double Clutch's rules (DC among the table's books), else the core rulebook's */
  dc: boolean
  drone: boolean
  /** DC: mod slots per family. Core categories (chassis/powertrain/electronics) are always present, each its unmodified
   *  Body plus what built-in mods add, less and plus what was shifted — unless Commlink6 declares a capacity for the
   *  vehicle (its `vehicle-*` slot value), which then wins. cf/accessory/tires appear only when such a capacity is
   *  declared (owner 2026-10-27). */
  slots?: Partial<Record<SlotKind, Meter>>
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
  /** the catalog's factory <part>s (decomposition plan 3), removed ones included (`removed`) */
  parts: FactoryPart[]
  /** what the live parts take of each hook, by hook id (`vehicle-chassis` ...), metered or not */
  usedByHook: Record<string, number>
  /** what removed factory parts left free of each hook (their cost), the room a GM-derived mod may take on a hook that has no meter */
  freedByHook: Record<string, number>
  /** hooks without a meter where GM-derived mods take more than the removed parts and added slots left free */
  derivedOver: string[]
  /** its <note field="builtin">s, as printed */
  notes: string[]
  warnings: { message: string; source: string; page: number }[]
}

/** Slots a shift takes from one category to give one to another (DC p. 120: a 2:1 ratio). */
export const SHIFT_COST = 2
/** Why mod slots can't be shifted from one category to another on this vehicle now, or undefined: only with Double Clutch's
 *  rules, between two categories, out of slots not in use (p. 120: "any available ... mod slots"). */
export function shiftProblem(x: Sr6Purchase, from: ShiftKind, to: ShiftKind, data: Sr6Data): 'no-slots' | 'same-slot' | 'no-free-slots' | undefined {
  const m = modsOf(x, data)
  if (!m.slots) return 'no-slots'
  if (from === to) return 'same-slot'
  return m.slots[from]!.max - m.slots[from]!.used < SHIFT_COST ? 'no-free-slots' : undefined
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
  // its WEAPON_SIZE (Commlink6's, or the importer's rule Z): the mount bands of rule W (TINY-MEDIUM any mount, LARGE a
  // standard or large one, BIG and up a large one); the class/category words only for a weapon with no size
  const z = (e?.attrs.size ?? '').toUpperCase()
  if (z) return /^(TINY|SMALL|MEDIUM)$/.test(z) ? 0 : z === 'LARGE' ? 1 : 2
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
export const mountHolds = (e: Sr6Entry) => {
  // by the weapon hook it offers (Commlink6's VEHICLE_WEAPON_SMALL/-/LARGE/MILITARY); by its name only when it offers none
  const ids = structureOf(e).slots.map(s => s.id)
  if (ids.some(i => /^vehicle-weapon-(large|military)$/.test(i))) return 2
  if (ids.includes('vehicle-weapon')) return 1
  if (ids.includes('vehicle-weapon-small')) return 0
  return /\bsmall\b/i.test(e.name) ? 0 : /\b(heavy|large|huge)\b/i.test(e.name) ? 2 : 1
}
export const HOLDS = ['an SMG or smaller', 'an assault rifle or smaller', 'any weapon']

/** The mods built into a vehicle: its entry's (or design snapshot's) <builtin>s, each with its uid; those the GM removed
 *  from the instance (`removed`, by builtin uid) are left out (owner 2026-10-27). On an entry that has factory <part>s the
 *  uid is `slot-builtin:<n>` (what is left of its builtins is the slot grants): a `builtin:<n>` removal saved before the
 *  parts existed numbered the old, longer list, so it must not land on a different builtin now (see legacyRemovals). */
function builtinsOf(e?: Sr6Entry, removed: string[] = []): Builtin[] {
  const pre = e?.parts.some(p => p.tag === 'part') ? 'slot-builtin' : 'builtin'
  const list: Builtin[] = (e?.parts ?? [])
    .filter(p => p.tag === 'builtin' && p.attrs.name)
    .map((p, i) => {
      const cat = normCat(p.attrs.category) === 'universal' ? 'universal' : SLOT_KINDS.find(k => k === normCat(p.attrs.category))
      return {
        uid: `${pre}:${i}`,
        name: p.attrs.name,
        ...(p.attrs.ref ? { ref: p.attrs.ref } : {}),
        ...(p.attrs.rating ? { rating: p.attrs.rating } : {}),
        ...(p.attrs.slots && cat ? { slots: first(p.attrs.slots), category: cat } : {}),
      }
    })
  return list.filter(b => !removed.includes(b.uid))
}
/** Removals saved as `builtin:<n>` against an entry that now has <part>s: they numbered the old builtin list, which the
 *  parts replaced (the character file keeps no names), so they can't be mapped to a part. Kept, reported, never applied. */
const legacyRemovals = (e: Sr6Entry | undefined, removed: string[] = []) =>
  e?.parts.some(p => p.tag === 'part') ? removed.filter(u => u.startsWith('builtin:')) : []

const PART_KINDS = ['gear', 'weapons', 'programs', 'electronics', 'armor'] as const
const partEntry = (ref: string, data: Sr6Data) => PART_KINDS.map(k => data.entry(k, ref)).find(Boolean)
/** A part's cost in its hook's unit: a number, or the importer's host formula (`$$ARMOR*0.25`, `$RATING-$$SENSORS`) at the
 *  vehicle's stats and the part's rating (1 unrated); one that can't be worked out counts 1, as Commlink6 does by default.
 *  ponytail: exact, never rounded up to whole slots; round here if Commlink6's meters are shown to. */
function partCost(p: Sr6Part, vehicle: Sr6Entry | undefined): number | undefined {
  const raw = (p.attrs.cost ?? '1').trim()
  const expr = raw
    .replace(/\$\$([A-Za-z]+)/g, (_, n: string) => String(first(vehicle?.attrs[n.toLowerCase()] ?? vehicle?.attrs[n.toLowerCase().replace(/s$/, '')])))
    .replace(/\$RATING/g, String(first(p.attrs.rating) || 1))
  // (evalFormula rounds up to a whole number; a part's cost is fractional (0.5 of a hardpoint), so work it in thousandths)
  const n = evalFormula({ field: 'cost', expr: `(${expr})*1000` }, {}).n
  return n === null ? undefined : Math.max(0, n / 1000)
}
/** The vehicle's factory parts (the entry's <part>s), each with whether it is removed: its id is in removedParts, or an
 *  ancestor's (`parent`) is, so a mount's weapon goes with the mount and returns with it. */
/** A weapon's fitted standard upgrades as slot items: they fill their hooks in slot counting (a factory foregrip takes the
 *  under-barrel slot); a removed one frees it. Other kinds: none (a vehicle's parts are metered by modsOf). */
export const fittedParts = (x: Sr6Purchase, data: Sr6Data) =>
  x.kind === 'weapons' ? partsOf(x, data).flatMap(p => (p.removed || !p.entry ? [] : [{ uid: p.uid, entry: p.entry }])) : []

export function partsOf(x: Sr6Purchase, data: Sr6Data): FactoryPart[] {
  const e = entryOf(x, data),
    seen = new Map<string, number>(),
    gone = new Set(x.removedParts ?? [])
  const all = (e?.parts ?? [])
    .filter(p => p.tag === 'part' && p.attrs.ref && p.attrs.id)
    .map(p => {
      // (a repeated id gets #2, #3 ...: the importer's table repeats a few, so a removal must name one part, not both)
      const n = (seen.get(p.attrs.id) ?? 0) + 1
      seen.set(p.attrs.id, n)
      const id = n > 1 ? `${p.attrs.id}#${n}` : p.attrs.id,
        entry = partEntry(p.attrs.ref, data)
      return {
        id,
        uid: `part:${id}`,
        ref: p.attrs.ref,
        name: (entry ? entryLabel(entry) : p.attrs.ref) + (p.attrs.choice ? ` (${p.attrs.choice})` : ''),
        hook: p.attrs.hook ?? '',
        cost: partCost(p, e) ?? 1,
        ...(p.attrs.rating ? { rating: p.attrs.rating } : {}),
        ...(p.attrs.parent ? { parent: p.attrs.parent } : {}),
        ...(p.attrs.choice ? { choice: p.attrs.choice } : {}),
        removed: gone.has(id),
        ...(p.attrs.review === 'needs-owner' ? { review: 'needs-owner' } : {}),
        ...(p.attrs.origin ? { origin: p.attrs.origin } : {}),
        ...(entry ? { entry } : {}),
      } as FactoryPart
    })
  const byId = new Map(all.map(p => [p.id, p]))
  const dead = (p: FactoryPart, depth = 0): boolean => p.removed || (!!p.parent && depth < 20 && !!byId.get(p.parent) && dead(byId.get(p.parent)!, depth + 1))
  return all.map(p => (dead(p) ? { ...p, removed: true } : p))
}
/** A line's factory-installed tutorsofts (a weapon's integral commlink's, Krime Katalog p. 12): each makes Instruction
 *  tests for its chosen skill with a pool of its rating x 2 (CRB p. 273: learning the skill, never a bonus to it), while
 *  the player has it switched on (`sit`, key `part:<id>`, the situational switch). Owner ruling 2026-10-30. */
export const instructionPools = (x: Sr6Purchase, data: Sr6Data) =>
  partsOf(x, data).flatMap(p =>
    !p.removed && p.entry && /^tutorsoft$/i.test(p.entry.name)
      ? [{ part: p, key: `part:${p.id}`, skill: p.choice ?? 'skill', pool: 2 * (Number(p.rating) || 1), on: (x.sit?.[`part:${p.id}`] ?? 0) > 0 }]
      : [],
  )
export const instructionText = (i: { skill: string; pool: number }) => `Instruction pool (${i.skill}): ${i.pool}`
/** D4 (owner): removing a factory part refunds nothing; a GM's custom refund is Stage 4's, and reads here. */
export const partRefund = (_x: Sr6Purchase, _part: FactoryPart): number => 0
/** A built-in mod's catalog gear entry (its ref); none: a name only. */
const builtinEntry = (b: Builtin, data: Sr6Data) => (b.ref ? data.entry('gear', b.ref) : undefined)

export interface Mount {
  uid: string
  e: Sr6Entry
  name: string
  /** built in: already paid for, never taken off */
  builtin?: true
  /** a factory part (`part:<id>`): the weapon is in it already (a child part), so no other can be put in */
  taken?: true
}
/** The weapon mounts on the vehicle a weapon can sit in: those fitted, then those built in (DESIGNER Q3). */
export function mountsOf(x: Sr6Purchase, data: Sr6Data): Mount[] {
  const out: Mount[] = []
  for (const a of x.accessories) {
    const e = entryOf(a, data)
    if (e && isMount(e)) out.push({ uid: a.uid, e, name: entryLabel(e) })
  }
  for (const b of builtinsOf(entryOf(x, data), x.removedBuiltins)) {
    const e = builtinEntry(b, data)
    if (e && isMount(e)) out.push({ uid: b.uid, e, name: builtinText(b), builtin: true })
  }
  const parts = partsOf(x, data).filter(p => !p.removed)
  for (const p of parts)
    if (p.entry && isMount(p.entry))
      out.push({
        uid: p.uid,
        e: p.entry,
        name: p.name,
        builtin: true,
        ...(parts.some(c => c.parent === p.id.replace(/#\d+$/, '')) ? { taken: true as const } : {}),
      })
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
  const builtin = builtinsOf(e, x.removedBuiltins)
  const parts = partsOf(x, data),
    live = parts.filter(p => !p.removed),
    usedByHook: Record<string, number> = {}
  // (a synthesized part, the powerplant, is not on the meters: its size is only the room a replacement may take, so a stock
  // vehicle's powertrain figure and Review are what they were)
  for (const p of live) if (p.origin !== 'synth') usedByHook[p.hook] = (usedByHook[p.hook] ?? 0) + p.cost
  // a GM-derived mod takes `size` of its hook exactly as a part does (derive.ts); the space freed by removed parts is what it may take
  const freedByHook: Record<string, number> = {},
    derivedUse: Record<string, number> = {}
  for (const p of parts) if (p.removed) freedByHook[p.hook] = (freedByHook[p.hook] ?? 0) + p.cost
  for (const a of x.accessories)
    if (a.derived) {
      usedByHook[a.derived.hook] = (usedByHook[a.derived.hook] ?? 0) + a.derived.size
      derivedUse[a.derived.hook] = (derivedUse[a.derived.hook] ?? 0) + a.derived.size
    }
  const metered = (h: string) => h === 'vehicle-hardpoint' || SLOT_KINDS.some(k => slotId(k) === h)
  const added = [...(e ? structureOf(e).slots : []), ...(x.addedSlots ?? [])]
  const derivedOver = Object.keys(derivedUse).filter(h => {
    const room = (freedByHook[h] ?? 0) + added.filter(s => s.id === h).reduce((t, s) => t + (slotCap(s.value) ?? 0), 0)
    return !metered(h) && derivedUse[h] > room + 1e-9
  })
  // a synthesized powerplant taken off and nothing derived into its place: the vehicle can't move under its own power
  if (
    parts.some(p => p.origin === 'synth' && p.hook === 'vehicle-powertrain' && p.removed) &&
    !x.accessories.some(a => a.derived?.hook === 'vehicle-powertrain')
  )
    warn(`${vname}: no powerplant installed — vehicle cannot move under own power.`, 'DC', 120)
  const stale = legacyRemovals(e, x.removedBuiltins)
  if (stale.length)
    warn(
      `${vname}: ${stale.length} built-in part${stale.length > 1 ? 's' : ''} removed before the factory parts were listed couldn’t be matched to them; remove the ones you want gone again.`,
      'DC',
      146,
    )
  const notes = (e?.notes ?? []).filter(n => n.field === 'builtin').map(n => n.text)

  const fitted: Fitted[] = x.accessories.map(f => {
    const fe = entryOf(f, data),
      kind = f.derived ? 'other' : f.kind === 'weapons' ? 'weapon' : f.kind === 'programs' ? 'program' : (modKind(fe) ?? 'other')
    let slots = 0
    if (dc && kind !== 'weapon' && kind !== 'program' && kind !== 'other' && kind !== 'accessory') {
      const v = bookValue(fe, 'slots', ratingOf(f, fe), find)
      if (v.ok) slots = v.n ?? 0
      else warn(`${vname}: ${fe ? entryLabel(fe) : 'a mod'}’s mod slots “${fe?.attrs.slots ?? ''}” aren’t a number the app can read; counted 0.`, 'DC', 120)
    }
    const h = hardpointOf(fe)
    return { uid: f.uid, kind, slots, units: dc && h ? HARDPOINT_UNITS[h] : 0 }
  })
  for (const h of derivedOver) warn(`${vname}: GM-derived mods take more of ${h} than the removed parts and added slots left free.`, 'DC', 120)
  for (const a of x.accessories)
    if (a.derived?.review === 'needs-owner')
      warn(`${vname}: ${a.name ?? 'a mod'} is a mod a GM derived from ${a.derived.from}; a GM must review it.`, 'DC', 120)
  const out: VehicleMods = { dc, drone, fitted, builtin, parts, usedByHook, freedByHook, derivedOver, notes, warnings }
  const line = (uid: string) => x.accessories.find(f => f.uid === uid)!
  const lineName = (uid: string) => {
    const fe = entryOf(line(uid), data)
    return fe ? entryLabel(fe) : (line(uid).name ?? 'Custom item')
  }

  if (dc) {
    // the slots the vehicle declares (Commlink6's `vehicle-*` HOOKs, slotmap.py) plus any a GM added to this instance
    const hostSlots = [...(e ? structureOf(e).slots : []), ...(x.addedSlots ?? [])]
    const declaredCap = (k: SlotKind) => {
      const caps = hostSlots.filter(s => s.id === slotId(k)).map(s => slotCap(s.value))
      const nums = caps.filter((n): n is number => n !== undefined)
      return nums.length ? nums.reduce((a, b) => a + b, 0) : undefined
    }
    // which declared-only family (cf/accessory/tires) a fitted mod takes, one unit each (its generator `<fits>`)
    const fitFamily = (uid: string): SlotKind | undefined => {
      if (line(uid).derived) return undefined
      const fe = entryOf(line(uid), data)
      const fits = fe ? structureOf(fe).fits : []
      return DECLARED_ONLY.find(k => fits.includes(slotId(k)))
    }
    const slots: Partial<Record<SlotKind, Meter>> = {}
    // core categories: the declared capacity if Commlink6 gives one, else the unmodified Body plus what built-in mods
    // add (p. 120); a hardpoint device's printed slots are chassis ones (p. 124: "Core mod slots")
    for (const k of SHIFT_KINDS)
      slots[k] = {
        used: fitted.reduce((t, f) => t + ((f.kind === 'hardpoint' ? 'chassis' : f.kind) === k ? f.slots : 0), usedByHook[slotId(k)] ?? 0),
        max: declaredCap(k) ?? body + builtin.reduce((t, b) => t + (b.category === k ? (b.slots ?? 0) : 0), 0),
      }
    // cf/accessory/tires: metered only where Commlink6 declares a capacity for the vehicle (owner 2026-10-27); each mod
    // that fits the family takes one
    for (const k of DECLARED_ONLY) {
      const max = declaredCap(k)
      if (max !== undefined) slots[k] = { used: x.accessories.filter(f => fitFamily(f.uid) === k).length + (usedByHook[slotId(k)] ?? 0), max }
    }
    out.slots = slots
    // slots shifted to another core category: two of one give one of another (p. 120)
    out.shifts = x.slotShifts ?? []
    for (const t of out.shifts) {
      slots[t.from]!.max -= SHIFT_COST
      slots[t.to]!.max += 1
    }
    // (a designed vehicle's universal slots take what a category goes past, DC p. 152)
    const present = Object.keys(slots) as SlotKind[]
    const universal = builtin.reduce((t, b) => t + (b.category === 'universal' ? (b.slots ?? 0) : 0), 0),
      over = present.reduce((t, k) => t + Math.max(0, slots[k]!.used - slots[k]!.max), 0)
    if (over > universal)
      for (const k of present) {
        const m = slots[k]!
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
    // factory parts: a hardpoint device adds its hardpoint as a bought one does; what sits on the hardpoint hook takes its cost
    for (const p of live) {
      const h = addsHardpoint(p.entry)
      if (h) added += HARDPOINT_UNITS[h]
    }
    // a drone's body holds its hardpoints, so vehicle-body is on the same meter (owner D6: the Hornet's injector sits on the hardpoint at 0.5)
    builtUsed += usedByHook['vehicle-hardpoint'] ?? 0
    // ponytail: only factory parts count here, not a GM-derived mod in the freed room (derivedOver already bounds that)
    // and the body's factory capacity (live or removed) is its own hardpoint room, so a mini drone's stock injector isn't over budget
    for (const p of parts)
      if (p.hook === 'vehicle-body') {
        added += p.cost
        if (!p.removed) builtUsed += p.cost
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
    inMount.set(m, (inMount.get(m) ?? (m.taken ? 1 : 0)) + 1)
    const size = weaponSize(entryOf(f, data))
    if (size !== undefined && size > mountHolds(m.e))
      warn(`${vname}: ${lineName(f.uid)} is too big for its ${m.name} (it holds ${HOLDS[mountHolds(m.e)]}).`, ...cite)
  }
  for (const [m, n] of inMount) if (n > 1) warn(`${vname}: ${n} weapons in one ${m.name}.`, ...cite)
  return out
}
const normCat = (s?: string) => (s ?? '').toLowerCase().replace(/ mod.*$/, '')
