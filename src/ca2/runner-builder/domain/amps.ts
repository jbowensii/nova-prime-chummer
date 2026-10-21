// Shadow Amp rating, Essence and change cost (CRB p.58-63, 83).
import { FREE_SINNER } from '../../formats/domain/types'
import type { AmpEffect, AmpEntry, AmpTemplate, AttrId, Build, Catalog, Character, EffectPick, ItemEntry, TableFlags } from '../../formats/domain/types'
import { RULE_EFFECTS } from '../../catalog/domain/load'
import { isSinner, realSinItem, sinnerTemplate } from '../../formats/domain/file'

const RULE_TEXT = new Map(RULE_EFFECTS.map(e => [e.id, e.text]))
export const isRuleEffect = (ref: string) => RULE_TEXT.has(ref)

/** A Test as the sheet names it: a skill, `Skill (spec)`, an attribute-based one, a custom one's own words, or all Tests. */
export function testName(c: Catalog, param?: string): string {
  if (!param) return 'all'
  const sk = c.skills.get(param) ?? c.skills.get(param.split('.')[0])
  const sp = sk?.specs.find(x => x.id === param)
  if (sk) return sp ? `${sk.name} (${sp.name})` : sk.name
  const at = c.attributes.get(param as AttrId)
  return at ? `${at.name}-based` : param.replace(/^custom:/, '')
}

/** A narrative effect kind's line (`Advantage on Perception (physical) Tests`), else undefined. */
export function ruleText(c: Catalog, e: EffectPick): string | undefined {
  const t = RULE_TEXT.get(e.ref)
  if (!t) return undefined
  const p = c.ampEffects.get(e.ref)?.param === 'test' ? testName(c, e.param) : (e.param ?? '')
  return t
    .replace('{p}', p)
    .replace('{v}', String(e.value ?? 1))
    .replace(/\s+:|:\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** freeSinner: the SINner house rule in play for this runner (sinnerFree); undefined: in play */
export interface AmpCtx {
  isFirstQuality: boolean
  freeSinner?: boolean
}

/** The house rule (owner, 0.5.5) that a SINner is always free and never the first Quality, a Table setup switch since
 *  0.12, on by default: the runner's own switch unless the GM locked it, else the table's, else on. */
export const sinnerFree = (ch: Pick<Character, 'optionalRules'>, table?: Pick<TableFlags, 'freeSinner' | 'locked'>) =>
  (table?.locked?.includes(FREE_SINNER) ? undefined : ch.optionalRules?.[FREE_SINNER]) ?? table?.freeSinner ?? true

export function effectRating(c: Catalog, pick: EffectPick): number {
  const eff = c.ampEffects.get(pick.ref)
  if (!eff || pick.unpriced) return 0
  if (pick.ref === 'negative') return -(pick.value ?? 1)
  if (pick.ref === 'rcc') return eff.rating * (pick.value ?? 1)
  return eff.rating
}

/** base rating of the type (Qualities: 0 for the first, then baseAfterFirst) + sum of effects; below 0 too, and a
 *  negative rating gives nuyen back (owner, 2026-10-10: the book only leaves reductions to the GM, p.61); a SINner is
 *  free (house rule) */
export function ampRating(c: Catalog, amp: AmpEntry, ctx: AmpCtx): number {
  return ctx.freeSinner !== false && isSinner(amp, c) ? 0 : rawAmpRating(c, amp, ctx)
}
/** The rating as its effects add up. */
export function rawAmpRating(c: Catalog, amp: AmpEntry, ctx: AmpCtx): number {
  const t = c.ampTypes.get(amp.type)
  const base = !t ? 0 : amp.type === 'quality' && !ctx.isFirstQuality ? (t.baseAfterFirst ?? t.base) : t.base
  return base + amp.effects.reduce((s, e) => s + effectRating(c, e), 0)
}

/** Essence lost to an amp: its type's cost, adjusted by implant grades (delta, omega, cultivated). */
export function ampEssence(c: Catalog, amp: AmpEntry): number {
  const base = c.ampTypes.get(amp.type)?.essence ?? 0
  if (!base) return 0
  return Math.max(0, base + amp.effects.reduce((s, e) => s + (c.ampEffects.get(e.ref)?.essence ?? 0), 0))
}

/** Apply a book add-on (mod="true" template) to an amp: its effects and story text are appended. */
export function applyMod(amp: AmpEntry, mod: AmpTemplate): AmpEntry {
  return {
    ...amp,
    effects: [...amp.effects, ...mod.effects.map(e => ({ ...e, note: mod.name }))],
    narrative: [amp.narrative, mod.narrative ? `${mod.name}: ${mod.narrative}` : mod.name].filter(Boolean).join(' '),
  }
}

export const firstQualityUid = (b: Build, c?: Catalog, freeSinner = true) => b.amps.find(a => a.type === 'quality' && !(freeSinner && isSinner(a, c)))?.uid

export const ampCtx = (b: Build, amp: AmpEntry, c?: Catalog, freeSinner = true): AmpCtx => ({
  isFirstQuality: firstQualityUid(b, c, freeSinner) === amp.uid,
  freeSinner,
})

/** Initiative levels an amp holds (init-1..3): the most "limited to one realm" reductions it may take (CRB p.61). */
export const initLevels = (amp: AmpEntry) => new Set(amp.effects.map(e => e.ref).filter(r => /^init-[123]$/.test(r))).size
/** A cyberdeck's Firewall: 1, +1 per Firewall effect, 5 at most (CRB p.62, p.210-211). */
export const FIREWALL_MAX = 5

/** Advancing an amp costs the rating difference x ampPoint; lowering refunds only if pricing says so. */
export function ampChangeCost(c: Catalog, before: AmpEntry, after: AmpEntry, ctx: AmpCtx): number {
  const diff = ampRating(c, after, ctx) - ampRating(c, before, ctx)
  if (diff >= 0 || c.pricing.refundEffectRemoval) return diff * c.pricing.ampPoint
  return 0
}

/** Why an effect can't be added to an amp right now (undefined = allowed): a cap, or an effect it can't be combined with.
 *  One whose required effect the amp lacks may be added (Review's amp.requires error): effectNeeds names it. */
export function effectBlocked(c: Catalog, amp: AmpEntry, eff: AmpEffect): string | undefined {
  if (!eff.types.includes(amp.type)) return `not available for ${c.ampTypes.get(amp.type)?.name ?? amp.type}`
  const count = amp.effects.filter(e => e.ref === eff.id).length
  if (eff.max != null && count >= eff.max) return `max ${eff.max} per amp`
  if (eff.id === 'init-realm' && count >= initLevels(amp)) return 'one per initiative level held'
  if (eff.id === 'firewall-plus' && amp.type === 'cyberdeck' && 1 + count >= FIREWALL_MAX) return `Firewall ${FIREWALL_MAX} at most`
  const body = vehicleBody(c, amp)
  if (eff.id === 'vehicle-armor' && body != null && count >= body) return `Armor at most the vehicle's Body (${body})`
  if (eff.excludes && amp.effects.some(e => e.ref === eff.excludes)) return `not with ${c.ampEffects.get(eff.excludes)?.name ?? eff.excludes}`
  return undefined
}

const vehicleBody = (c: Catalog, amp: AmpEntry) => (amp.type === 'vehicle' ? (c.vehicles.get(amp.vehicle ?? '') ?? amp.chassis)?.body : undefined)

/** Why an amp's effects go past a cap (an effect's max, a cyberdeck's Firewall 5, a vehicle's Armor above its Body, CRB
 *  p.61-62), else undefined: an add-on that would do so isn't offered (DHSA's Additional plates: up to the Body). */
export function overCap(c: Catalog, amp: AmpEntry): string | undefined {
  const n = (ref: string) => amp.effects.filter(e => e.ref === ref).length
  for (const ref of new Set(amp.effects.map(e => e.ref))) {
    const d = c.ampEffects.get(ref)
    if (d?.max != null && n(ref) > d.max) return `${d.name}: max ${d.max} per amp`
  }
  if (amp.type === 'cyberdeck' && 1 + n('firewall-plus') > FIREWALL_MAX) return `Firewall ${FIREWALL_MAX} at most`
  const body = vehicleBody(c, amp)
  if (body != null && n('vehicle-armor') > body) return `Armor at most the vehicle's Body (${body})`
  return undefined
}

/** The effect an effect requires and the amp lacks, as the picker marks it. */
export const effectNeeds = (c: Catalog, amp: AmpEntry, eff: AmpEffect): string | undefined =>
  eff.requires && !amp.effects.some(e => e.ref === eff.requires) ? `requires ${c.ampEffects.get(eff.requires)?.name ?? eff.requires}` : undefined

/** The effects an amp's type may take; reason: why one is blocked, else what it still needs (allowed). */
export function legalEffects(c: Catalog, amp: AmpEntry): { effect: AmpEffect; allowed: boolean; reason?: string }[] {
  return [...c.ampEffects.values()]
    .filter(e => e.types.includes(amp.type))
    .map(effect => {
      const reason = effectBlocked(c, amp, effect)
      return { effect, allowed: !reason, reason: reason ?? effectNeeds(c, amp, effect) }
    })
}

/** A catalog amp as a character entry; equipment amps also bring their base item, linked. */
export function ampFromTemplate(t: AmpTemplate, uid: () => string): { amp: AmpEntry; item?: ItemEntry } {
  const amp: AmpEntry = {
    uid: uid(),
    catalogId: t.id,
    type: t.type,
    name: t.name,
    narrative: t.narrative,
    effects: t.effects.map(e => ({ ...e })),
    vehicle: t.vehicle,
    snapshot: t,
  }
  if (!t.item) return { amp }
  const item: ItemEntry = {
    uid: uid(),
    kind: t.item.kind,
    name: t.name,
    specialist: t.item.specialist,
    armor: t.item.armor,
    dv: t.item.dv,
    ranges: t.item.ranges,
  }
  amp.linkedItem = item.uid
  return { amp, item }
}

/** The Concept tab's "Has a real SIN": on adds a free Real SIN entry and, when a book has one and the runner lacks it,
 *  the SINner quality; off removes the entry and every SINner quality. */
export function setRealSin(c: Catalog, b: Build, on: boolean): void {
  if (!on) {
    b.items = b.items.filter(i => i.starting !== 'real-sin')
    b.amps = b.amps.filter(a => !isSinner(a, c))
    return
  }
  if (!b.items.some(i => i.starting === 'real-sin')) b.items.push(realSinItem())
  const t = sinnerTemplate(c)
  if (t && !b.amps.some(a => isSinner(a, c))) {
    const { amp } = ampFromTemplate(t, () => 'real-sin-amp')
    b.amps.push({ ...amp, realSin: true })
  }
}

/** After every edit: a SINner quality brings its free Real SIN entry, and taking the last one off takes the entry with it
 *  (kept when no book has a SINner, so a runner from before stays as it was). */
export function syncRealSin(c: Catalog, b: Build): void {
  const has = b.amps.some(a => isSinner(a, c)),
    entry = b.items.some(i => i.starting === 'real-sin')
  if (has && !entry) b.items.push(realSinItem())
  if (!has && entry && sinnerTemplate(c)) b.items = b.items.filter(i => i.starting !== 'real-sin')
}
