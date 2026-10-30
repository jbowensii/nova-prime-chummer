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

export { CYBERLIMBS, LIMB_MAX, LIMB_STATS, customLimb, limbIncrease, limbOf, limbSnapshot } from './limbs'
export type { LimbPart, LimbLook, LimbStat } from './limbs'
const effect = (target: string, value: string): Sr6Part => ({ tag: 'effect', attrs: { target, op: 'add', value }, text: '' })

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
