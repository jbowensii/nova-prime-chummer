// Shadow Amp rating, Essence and change cost (CRB p.58-63, 83).
import type { AmpEffect, AmpEntry, AmpTemplate, Build, Catalog, EffectPick, ItemEntry } from '../model/types'

export interface AmpCtx { isFirstQuality: boolean }

export function effectRating(c: Catalog, pick: EffectPick): number {
  const eff = c.ampEffects.get(pick.ref)
  if (!eff) return 0
  if (pick.ref === 'negative') return -(pick.value ?? 1)
  if (pick.ref === 'rcc') return eff.rating * (pick.value ?? 1)
  return eff.rating
}

/** base rating of the type (Qualities: 0 for the first, then baseAfterFirst) + sum of effects */
export function ampRating(c: Catalog, amp: AmpEntry, ctx: AmpCtx): number {
  const t = c.ampTypes.get(amp.type)
  const base = !t ? 0 : amp.type === 'quality' && !ctx.isFirstQuality ? (t.baseAfterFirst ?? t.base) : t.base
  return base + amp.effects.reduce((s, e) => s + effectRating(c, e), 0)
}

export const ampEssence = (c: Catalog, amp: AmpEntry) => c.ampTypes.get(amp.type)?.essence ?? 0

export const firstQualityUid = (b: Build) => b.amps.find(a => a.type === 'quality')?.uid

export const ampCtx = (b: Build, amp: AmpEntry): AmpCtx => ({ isFirstQuality: firstQualityUid(b) === amp.uid })

/** Advancing an amp costs the rating difference x ampPoint; lowering refunds only if pricing says so. */
export function ampChangeCost(c: Catalog, before: AmpEntry, after: AmpEntry, ctx: AmpCtx): number {
  const diff = ampRating(c, after, ctx) - ampRating(c, before, ctx)
  if (diff >= 0 || c.pricing.refundEffectRemoval) return diff * c.pricing.ampPoint
  return 0
}

/** Why an effect can't be added to an amp right now (undefined = allowed). */
export function effectBlocked(c: Catalog, amp: AmpEntry, eff: AmpEffect): string | undefined {
  if (!eff.types.includes(amp.type)) return `not available for ${c.ampTypes.get(amp.type)?.name ?? amp.type}`
  const count = amp.effects.filter(e => e.ref === eff.id).length
  if (eff.max != null && count >= eff.max) return `max ${eff.max} per amp`
  if (eff.requires && !amp.effects.some(e => e.ref === eff.requires)) return `requires ${c.ampEffects.get(eff.requires)?.name ?? eff.requires}`
  if (eff.excludes && amp.effects.some(e => e.ref === eff.excludes)) return `not with ${c.ampEffects.get(eff.excludes)?.name ?? eff.excludes}`
  return undefined
}

export function legalEffects(c: Catalog, amp: AmpEntry): { effect: AmpEffect; allowed: boolean; reason?: string }[] {
  return [...c.ampEffects.values()].filter(e => e.types.includes(amp.type))
    .map(effect => { const reason = effectBlocked(c, amp, effect); return { effect, allowed: !reason, reason } })
}

/** A catalog amp as a character entry; equipment amps also bring their base item, linked. */
export function ampFromTemplate(t: AmpTemplate, uid: () => string): { amp: AmpEntry; item?: ItemEntry } {
  const amp: AmpEntry = { uid: uid(), catalogId: t.id, type: t.type, name: t.name, narrative: t.narrative,
    effects: t.effects.map(e => ({ ...e })), vehicle: t.vehicle, snapshot: t }
  if (!t.item) return { amp }
  const item: ItemEntry = { uid: uid(), kind: t.item.kind, name: t.name, specialist: t.item.specialist, armor: t.item.armor }
  amp.linkedItem = item.uid
  return { amp, item }
}
