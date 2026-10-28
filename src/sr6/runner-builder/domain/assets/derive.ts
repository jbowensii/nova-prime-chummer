// A GM-derived mod (docs/analysis/sr6-vehicle-decomposition.md 4.8, owner ruling D5): custom content made FROM any catalog
// item (a jammer), with the hook and size the GM sets (vehicle-body, 0.5), kept on the vehicle it is fitted to. Its price,
// availability, rating range, rules and description are the source's, copied into the snapshot so a later catalog fix
// does not move an installed copy; the GM sets only where it sits and how much of it. origin synth: the app made the entry, so
// it is flagged for a GM to review (Review lists it until `review` is cleared).
import { newId } from '../../../../core/shared/types'
import type { Sr6Purchase } from '../../../formats/domain/character'
import type { Sr6Entry, Sr6Kind } from '../../../formats/domain/types'

/** The mod a GM derives from `from`, ready to be an accessory of a vehicle: not yet fitted (the add-time guard does that). */
export function deriveMod(from: Sr6Entry, o: { hook: string; size: number; rating?: number }): Sr6Purchase {
  const id = `custom.${from.id}@${o.hook}`
  const name = `${from.name} (derived: ${o.hook.replace(/^vehicle-/, '')} ${o.size})`
  // (its own placement replaces the source's: one fits, the GM's hook)
  const parts = [...from.parts.filter(p => p.tag !== 'fits' && p.tag !== 'slot'), { tag: 'fits', attrs: { slot: o.hook }, text: '' }]
  const snapshot: Sr6Entry = { ...structuredClone(from), id, name, parts, attrs: { ...from.attrs, origin: 'synth', review: 'needs-owner' } }
  return {
    uid: newId(),
    kind: from.kind as Sr6Purchase['kind'],
    id,
    name,
    qty: 1,
    accessories: [],
    ...(o.rating !== undefined ? { rating: o.rating } : {}),
    snapshot,
    derived: { from: from.id, kind: from.kind as Sr6Kind, hook: o.hook, size: o.size, review: 'needs-owner' },
  }
}
