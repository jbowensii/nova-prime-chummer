// Catalog structure: slots offered and occupied, variants, flags and source rule data; the one fit engine (fit plan
// Stages 3-4, docs/analysis/sr6-item-classification-fit.md): a host's hooks, an item's usages and its host requirements.
import type { Sr6Entry } from '../../formats/domain/types'
import { rated } from './values'

/** A hook a host offers. unit `capacity`: fitted items' costs sum up to value (99 or more: no limit); `one`: one item
 *  per hook; none (an old catalog): one item per unit of value. maxSize: the biggest cost one item may have. */
export interface Slot {
  id: string
  value?: string
  unit?: 'capacity' | 'one'
  maxSize?: string
  /** S, V or F: the importer made it as Commlink6's code does (standard, vehicle, fashion hooks) */
  rule?: string
}
/** A hook an item fits: cost in the hook's capacity (none: 1), mode (embedded, implanted, carried, virtual), rule W/I
 *  when the importer synthesized it (vehicle mounts, implants: the item is standalone too). */
export interface Usage {
  slot: string
  cost?: string
  mode?: string
  rule?: string
}

export interface ItemStructure {
  slots: Slot[]
  fits: string[]
  usages: Usage[]
  variants: string[]
  relevance: string[]
  flags: string[]
  modOnly: boolean
  size?: string
  ammoClass?: string
  modifiers: Record<string, string>[]
  prerequisites: Record<string, string>[]
  selections: Record<string, string>[]
}

const pick = <K extends string>(attrs: Record<string, string>, keys: K[]) =>
  Object.fromEntries(keys.filter(k => attrs[k]).map(k => [k, attrs[k]])) as Partial<Record<K, string>>

export function structureOf(e: Sr6Entry): ItemStructure {
  const of = (tag: string) => e.parts.filter(p => p.tag === tag)
  const usages = of('fits')
    .map(p => ({ slot: p.attrs.slot ?? '', ...pick(p.attrs, ['cost', 'mode', 'rule']) }))
    .filter(u => u.slot)
  return {
    slots: of('slot')
      .filter(p => p.attrs.remove !== 'true') // (a hook Commlink6 takes away: the importer's marker)
      .map(p => ({ id: p.attrs.id ?? '', ...pick(p.attrs, ['value', 'maxSize', 'rule']), ...(p.attrs.unit ? { unit: p.attrs.unit as Slot['unit'] } : {}) }))
      .filter(s => s.id),
    fits: usages.map(u => u.slot),
    usages,
    variants: of('variant').map(p => p.attrs.name ?? ''),
    relevance: of('relevance').map(p => p.attrs.topic ?? ''),
    flags: of('flag').map(p => p.text),
    modifiers: of('modifier').map(p => p.attrs),
    prerequisites: of('prerequisite').map(p => p.attrs),
    selections: of('selection').map(p => p.attrs),
    modOnly: e.attrs.modonly === 'true',
    ...(e.attrs.size ? { size: e.attrs.size } : {}),
    ...(e.attrs.ammoClass ? { ammoClass: e.attrs.ammoClass } : {}),
  }
}

/** Whether an item is fitted only (never bought on its own): it declares an embedded usage of its own (not one the
 *  importer synthesized, not a carried or implanted one). */
export const fitsOnly = (s: ItemStructure) => s.usages.some(u => !u.rule && (!u.mode || u.mode === 'embedded'))

export interface SlotItem {
  uid: string
  entry?: Sr6Entry
  qty?: number
}

const UNBOUNDED = 99
const num = (v: string | undefined, rating: number) => {
  const r = rated(v ?? '1', rating)
  return r.ok && r.n !== null && Number.isFinite(r.n) ? r.n : undefined
}

/** A host's hooks at its rating, each with its room in its unit: the catalog's, plus `extra` (a GM's addedSlots), less
 *  `removed` hook ids. room: Infinity for no limit; per id the values add up (a GM's slot adds to the catalog's). */
export function hookBudgets(host: Sr6Entry | undefined, rating = 1, extra: Slot[] = [], removed: string[] = []) {
  const out = new Map<string, { room: number; unit?: Slot['unit']; maxSize?: number }>()
  for (const s of [...(host ? structureOf(host).slots : []), ...extra]) {
    if (removed.includes(s.id)) continue
    const n = num(s.value, rating)
    if (n === undefined) continue
    const room = s.unit === 'one' ? 1 : s.unit === 'capacity' && n >= UNBOUNDED ? Infinity : s.unit === 'capacity' ? n : Math.max(0, Math.floor(n))
    const was = out.get(s.id)
    const maxSize = s.maxSize ? num(s.maxSize, rating) : undefined
    out.set(s.id, {
      room: (was?.room ?? 0) + room,
      unit: s.unit ?? was?.unit,
      ...(maxSize !== undefined ? { maxSize } : was?.maxSize !== undefined ? { maxSize: was.maxSize } : {}),
    })
  }
  return out
}

/** What an item takes of a hook: its usage's cost in a capacity hook (none: 1, as Commlink6 sums it), else 1. */
const costIn = (u: Usage, unit: Slot['unit'], rating: number) => (unit === 'capacity' ? (num(u.cost, rating) ?? 1) : 1)

/** Usages list alternatives: each unit of an accessory is placed into one hook it fits that has room (its cost in a
 *  capacity hook, one item in a one-item hook, one unit of value in an old catalog's), moving an earlier one to another
 *  hook when that frees room. `extra` are slots added to the host instance (character.ts addedSlots).
 *  ponytail: reassignment is the unit-count augmenting path, made cost-aware by trying the move, not an optimal packer. */
export function mountSlots(host: Sr6Entry | undefined, accessories: SlotItem[], rating = 1, extra: Slot[] = [], removed: string[] = []) {
  const budgets = hookBudgets(host, rating, extra, removed)
  const remaining = new Map([...budgets].map(([id, b]) => [id, b.room]))
  const units = accessories.flatMap(a => {
    const us = a.entry ? structureOf(a.entry).usages : []
    return us.length ? Array.from({ length: a.qty ?? 1 }, () => ({ uid: a.uid, usages: us })) : []
  })
  const cost = (unit: number, slot: string) =>
    costIn(
      units[unit].usages.find(u => u.slot === slot)!,
      budgets.get(slot)?.unit,
      rating,
    )
  const owners = new Map<string, number[]>()
  const put = (unit: number, slot: string) => {
    owners.set(slot, [...(owners.get(slot) ?? []), unit])
    remaining.set(slot, remaining.get(slot)! - cost(unit, slot))
  }
  const take = (unit: number, slot: string) => {
    owners.set(
      slot,
      owners.get(slot)!.filter(u => u !== unit),
    )
    remaining.set(slot, remaining.get(slot)! + cost(unit, slot))
  }
  const place = (unit: number, seen: Set<string>): boolean => {
    for (const { slot } of units[unit].usages) {
      if (seen.has(slot) || !remaining.has(slot)) continue
      seen.add(slot)
      if (remaining.get(slot)! >= cost(unit, slot) - 1e-9) {
        put(unit, slot)
        return true
      }
      for (const other of [...(owners.get(slot) ?? [])]) {
        take(other, slot)
        if (remaining.get(slot)! >= cost(unit, slot) - 1e-9 && place(other, seen)) {
          put(unit, slot)
          return true
        }
        put(other, slot)
      }
    }
    return false
  }
  const unplaced = units.flatMap((unit, i) => (place(i, new Set()) ? [] : [unit.uid]))
  const occupied = new Map<string, string>()
  for (const [slot, fitted] of owners) for (const unit of fitted) occupied.set(units[unit].uid, slot)
  return { remaining, occupied, unplaced }
}

export interface Fit {
  /** null: the item declares no usage (nothing to check by hook) */
  ok: boolean | null
  /** the gate that failed: no hook the host offers, too big for every hook it could take, or no room left */
  reason?: 'hook' | 'size' | 'room'
  /** the hook it went into (ok) or the hooks it could use (failed) */
  hooks: string[]
}

/** The one fit test (the hook layer): does `item` go into `host` next to what is fitted already. The host's hooks are
 *  its catalog's plus the instance's `extra` less `removed`; a usage only counts where the host offers its hook; a
 *  hook's maxSize caps one item's cost; then the item must still find room (mountSlots). Requirements are separate
 *  (requirementsOf). */
export function fit(host: Sr6Entry | undefined, item: Sr6Entry, fitted: SlotItem[], rating = 1, extra: Slot[] = [], removed: string[] = []): Fit {
  const us = structureOf(item).usages
  if (!us.length) return { ok: null, hooks: [] }
  const budgets = hookBudgets(host, rating, extra, removed)
  const offered = us.filter(u => budgets.has(u.slot))
  if (!offered.length) return { ok: false, reason: 'hook', hooks: us.map(u => u.slot) }
  const sized = offered.filter(u => {
    const b = budgets.get(u.slot)!
    return b.maxSize === undefined || costIn(u, b.unit, rating) <= b.maxSize + 1e-9
  })
  if (!sized.length) return { ok: false, reason: 'size', hooks: offered.map(u => u.slot) }
  const before = mountSlots(host, fitted, rating, extra, removed).unplaced.length
  const after = mountSlots(host, [...fitted, { uid: '\u0000new', entry: item }], rating, extra, removed)
  if (after.unplaced.length > before) return { ok: false, reason: 'room', hooks: sized.map(u => u.slot) }
  return { ok: true, hooks: [after.occupied.get('\u0000new') ?? sized[0].slot] }
}

/** The host requirements an item fails, each in words, and the ones the app can't test (`unchecked`). As Commlink6 at
 *  embed time (Stage 0 findings, owner 2026-10-29): only `apply="DATA_ITEM"` tests; a `<selreq>` group (`group` n > 0)
 *  holds when any one of its tests holds, and a member with no `apply` holds by itself, so such a group never fails.
 *  One exception, owner ruling 6: a holster's gun-type group is tested whatever its `apply`. `negate` turns a test
 *  round. Owner ruling 5: a warning, not an error, for now. */
export function requirementsOf(item: Sr6Entry, host: Sr6Entry | undefined): { failed: string[]; unchecked: string[] } {
  const holster = /holster/i.test(item.name)
  const all = structureOf(item).prerequisites
  const grouped = (p: Record<string, string>) => !!p.group && p.group !== '0'
  const tests = all.filter(p => (grouped(p) ? holster || all.every(q => q.group !== p.group || q.apply === 'DATA_ITEM') : p.apply === 'DATA_ITEM'))
  const failed: string[] = [],
    unchecked: string[] = []
  if (!host || !tests.length) return { failed, unchecked }
  const [type, sub = ''] = (host.attrs.class ?? '').toUpperCase().split('/')
  const key = (s?: string) => (s ?? '').toUpperCase().replace(/[\s-]+/g, '_')
  const holds = (p: Record<string, string>): boolean | undefined => {
    const ref = key(p.type === 'ITEM_ATTRIBUTE' ? p.ref : p.type),
      want = key(p.type === 'ITEM_ATTRIBUTE' ? p.value : p.ref)
    let r: boolean | undefined
    if (ref === 'ITEMTYPE') r = type === want
    else if (ref === 'ITEMSUBTYPE') r = sub === want
    else if (ref === 'WEAPON_SIZE') r = key(host.attrs.size) === want
    else if (ref === 'AMMUNITION_CLASS') r = key(host.attrs.ammoClass) === want
    return r === undefined ? undefined : p.negate === 'true' ? !r : r
  }
  const words = (p: Record<string, string>) =>
    `${p.negate === 'true' ? 'not ' : ''}${(p.type === 'ITEM_ATTRIBUTE' ? `${p.ref} ${p.value}` : `${p.type} ${p.ref}`).toLowerCase().replaceAll('_', ' ')}`
  const groups = new Map<string, Record<string, string>[]>()
  for (const p of tests) groups.set(p.group ?? '0', [...(groups.get(p.group ?? '0') ?? []), p])
  for (const [g, ps] of groups) {
    const got = ps.map(holds)
    for (const [i, r] of got.entries()) if (r === undefined) unchecked.push(words(ps[i]))
    if (g === '0') ps.forEach((p, i) => got[i] === false && failed.push(words(p)))
    else if (got.every(r => r === false)) failed.push(ps.map(words).join(' or '))
  }
  return { failed, unchecked }
}

export const slotLabel = (id: string) =>
  id
    .replace(/^FIREARMS_/, '')
    .replaceAll('_', ' ')
    .toLowerCase()
