// Catalog structure: slots offered and occupied, variants, flags and source rule data.
import type { Sr6Entry } from '../../formats/domain/types'
import { rated } from './values'

export interface ItemStructure {
  slots: { id: string; value?: string }[]
  fits: string[]
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

export function structureOf(e: Sr6Entry): ItemStructure {
  const of = (tag: string) => e.parts.filter(p => p.tag === tag)
  return {
    slots: of('slot')
      .map(p => ({ id: p.attrs.id ?? '', ...(p.attrs.value ? { value: p.attrs.value } : {}) }))
      .filter(s => s.id),
    fits: of('fits')
      .map(p => p.attrs.slot ?? '')
      .filter(Boolean),
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

export interface SlotItem {
  uid: string
  entry?: Sr6Entry
  qty?: number
}

/** Fits lists alternatives: each unit occupies one slot, with reassignment when another fitting needs it. `extra` are
 *  slots added to the host instance (a GM override, character.ts addedSlots), treated as if the catalog entry carried them. */
export function mountSlots(host: Sr6Entry | undefined, accessories: SlotItem[], rating = 1, extra: { id: string; value?: string }[] = []) {
  const remaining = new Map<string, number>()
  for (const slot of [...(host ? structureOf(host).slots : []), ...extra]) {
    const value = rated(slot.value ?? '1', rating)
    if (value.ok && value.n !== null && Number.isFinite(value.n)) remaining.set(slot.id, (remaining.get(slot.id) ?? 0) + Math.max(0, Math.floor(value.n)))
  }
  const units = accessories.flatMap(a => {
    const fits = a.entry ? structureOf(a.entry).fits : []
    return fits.length ? Array.from({ length: a.qty ?? 1 }, () => ({ uid: a.uid, fits })) : []
  })
  const owners = new Map<string, number[]>()
  const place = (unit: number, seen: Set<string>): boolean => {
    for (const slot of units[unit].fits) {
      if (seen.has(slot) || !remaining.has(slot)) continue
      seen.add(slot)
      const fitted = owners.get(slot) ?? []
      if (fitted.length < remaining.get(slot)!) {
        fitted.push(unit)
        owners.set(slot, fitted)
        return true
      }
      for (let i = 0; i < fitted.length; i++) {
        if (place(fitted[i], seen)) {
          fitted[i] = unit
          return true
        }
      }
    }
    return false
  }
  const unplaced = units.flatMap((unit, i) => (place(i, new Set()) ? [] : [unit.uid]))
  const occupied = new Map<string, string>()
  for (const [slot, fitted] of owners) {
    remaining.set(slot, remaining.get(slot)! - fitted.length)
    for (const unit of fitted) occupied.set(units[unit].uid, slot)
  }
  return { remaining, occupied, unplaced }
}

export const slotLabel = (id: string) =>
  id
    .replace(/^FIREARMS_/, '')
    .replaceAll('_', ' ')
    .toLowerCase()
