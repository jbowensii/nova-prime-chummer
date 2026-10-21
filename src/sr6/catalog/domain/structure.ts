// An item's structure as Commlink6 gives it (docs/sr6-data-format.md, Item structure): the slots it offers and fits, its
// variants, the topics it is relevant to, kind flags, and the add-on and size attributes. Read from the entry's parts and
// attributes; no rule reads them yet (the pickers and the Foundry export may).
import type { Sr6Entry } from '../../formats/domain/types'

export interface ItemStructure {
  /** slots the item offers (id; value: how many, a formula like the cost) */
  slots: { id: string; value?: string }[]
  /** slots it fits */
  fits: string[]
  /** the variants it comes in, by name */
  variants: string[]
  /** the topics it is relevant to */
  relevance: string[]
  flags: string[]
  /** bought only as an add-on to another item */
  modOnly: boolean
  size?: string
  ammoClass?: string
  /** Commlink6's own rule data for the item, kept as it gives it and never applied: <modifier> (a modification), <prerequisite>
   *  (datareq or valuereq) and <selection> (a pick it offers); each part's attributes as written */
  modifiers: Record<string, string>[]
  prerequisites: Record<string, string>[]
  selections: Record<string, string>[]
}

export function structureOf(e: Sr6Entry): ItemStructure {
  const of = (tag: string) => e.parts.filter(p => p.tag === tag)
  return {
    slots: of('slot').map(p => ({ id: p.attrs.id ?? '', ...(p.attrs.value ? { value: p.attrs.value } : {}) })),
    fits: of('fits').map(p => p.attrs.slot ?? ''),
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
