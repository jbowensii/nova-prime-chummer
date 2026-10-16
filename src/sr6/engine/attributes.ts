// An attribute's natural and augmented rating, and its maximum.
import { MAGIC_KINDS, type Sr6Data } from './data'
import type { Sr6Attr, Sr6Build, Sr6Quality } from '../model/character'
import { num, str, type CreationRules } from './creation'
import type { Provider } from './providers'
import { maxEffects } from './effects'
import { augmentBonus } from './bonuses'
import { noteAttr } from './choices'
import { runnerInfected } from './infected'

/** Natural rating: 1 (lifepath: what it starts at) + points + adjustment + karma; Magic or Resonance (whichever the magic kind uses) starts at the
 *  method's rating instead, the other at 0. */
export function attrRating(b: Sr6Build, k: Sr6Attr, p: Provider): number {
  const a = b.attributes[k],
    resonance = MAGIC_KINDS[b.magic].resonance
  const base = k === 'mag' ? (resonance ? 0 : p.magicRating(b)) : k === 'res' ? (resonance ? p.magicRating(b) : 0) : 1
  return base + a.points + a.adjust + a.karma + (p.attributeBonus?.(b, k) ?? 0) + (p.startBonus?.(b, k) ?? 0)
}
/** A runner's attribute as its picks raise it (natural + augmentBonus): what Charisma's contact points and Logic's
 *  knowledge skills are counted from. */
export const augmentedRating = (b: Sr6Build, data: Sr6Data, k: Sr6Attr, p: Provider) => attrRating(b, k, p) + augmentBonus(b, data, k)
/** An attribute's creation and career maximum: the metatype's (or the one a quality's effects set), plus what a
 *  quality's effects add, a chosen attribute's (`attr-max:choice`) on the attribute its note names (Exceptional +1, CRB
 *  Hong Kong p. 71; Impaired -1 a level, p. 76), never lowered below attributeMaxFloor (Impaired: "to a minimum of 2");
 *  plus 1 for each exceptionalQuality whose note names it when that quality carries no such effect. The one figure
 *  Review's caps, the editor's steppers and the Ledger read. undefined: no metatype (or Magic, Resonance). */
export function attrMax(data: Sr6Data, cr: CreationRules, b: Sr6Build, k: Sr6Attr): number | undefined {
  const m = data.metatypes[b.metatype]
  if (!m || !(k in m.ranges)) return undefined
  const id = str(cr, 'exceptionalQuality')
  // a quality's own maxima (an infected type's table, Shiva Arms' `maximum Body and Strength by one point`, effects.ts)
  let max = m.ranges[k as keyof typeof m.ranges][1],
    lowered = false
  // (an Infected type's row holds for its base metatype only, `when="Human"`; the non-human vampire adds its
  // <infectedalt> to the runner's own, infected.ts)
  const inf = runnerInfected(b, data)
  if (inf?.alt) max += inf.t.alt?.adds[k] ?? 0
  for (const q of b.qualities) {
    const fx = maxEffects(data.entry('qualities', q.id), m.name),
      x = fx[k],
      c = noteAttr(q.note) === k ? fx.choice : undefined
    if (x?.set !== undefined) max = x.set
    for (const y of [x, c])
      if (y?.add) {
        max += y.add * (y.perRating ? q.level : 1)
        lowered ||= y.add < 0
      }
  }
  const own = (q: Sr6Quality) => maxEffects(data.entry('qualities', q.id), m.name).choice !== undefined
  max += id ? b.qualities.filter(q => data.sameFamily('qualities', q.id, id) && !own(q) && noteAttr(q.note) === k).length : 0
  const floor = num(cr, 'attributeMaxFloor')
  return lowered && floor !== undefined ? Math.max(floor, max) : max
}
