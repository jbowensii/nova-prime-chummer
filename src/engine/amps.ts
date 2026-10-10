// Shadow Amp rating, Essence and change cost (CRB p.58-63, 83).
import type { AmpEffect, AmpEntry, AmpTemplate, AttrId, Build, Catalog, EffectParam, EffectPick, ItemEntry } from '../model/types'
// the kinds' ids, names and lines; also read by tools/validate-data.mjs (a data file may use them)
import RULES from './rule-effects.json'

/** The narrative effects' kinds (CRB p.59, src/engine/rule-effects.json): what an amp's narrative effect, an item or a racial
 *  quality does, machine-readable.
 *  Rating 0: the book prices narrative effects with the amp's base rating and its "Additional narrative effect"s (which
 *  stay), so a kind only says what one does; the loader adds them to every catalog's Amp effects (loadRuleEffects).
 *  `text` reads `{p}` as the effect's param (a Test for the test kinds), `{v}` as its value. */
export const RULE_EFFECTS: (Omit<AmpEffect, 'types' | 'source' | 'page'> & { text: string })[] =
  (RULES as { id: string; name: string; text: string; param?: EffectParam }[]).map(e => ({ ...e, category: 'narrative', rating: 0 }))
const RULE_TEXT = new Map(RULE_EFFECTS.map(e => [e.id, e.text]))
export const isRuleEffect = (ref: string) => RULE_TEXT.has(ref)

/** The narrative effect kinds as Amp effects every amp type may take (CRB p.59), added where the catalog has none of
 *  that id. */
export function loadRuleEffects(c: Catalog) {
  const types = [...c.ampTypes.keys()]
  for (const { text: _, ...e } of RULE_EFFECTS) if (!c.ampEffects.has(e.id)) c.ampEffects.set(e.id, { ...e, types, source: 'CRB', page: 59 })
}

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
  const p = c.ampEffects.get(e.ref)?.param === 'test' ? testName(c, e.param) : e.param ?? ''
  return t.replace('{p}', p).replace('{v}', String(e.value ?? 1)).replace(/\s+:|:\s*$/g, '').replace(/\s+/g, ' ').trim()
}

/** negativeOk: the GM approved this amp's rating below 0 (validate.ts amp.negativeRating); otherwise it counts as 0 */
export interface AmpCtx { isFirstQuality: boolean; negativeOk?: boolean }

/** case and spacing aside */
export const plain = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
/** The catalog's SINner quality (Daegann's Shadow Amps), looked up by name: there only when that book is imported. */
export const sinnerTemplate = (c: Catalog): AmpTemplate | undefined => [...c.amps.values()].find(t => plain(t.name) === 'sinner')
const effectKey = (es: EffectPick[]) => es.map(e => `${e.ref}|${e.param ?? ''}|${e.value ?? ''}`).sort().join(';')
/** An amp that is the SINner quality, and still only that: a Quality that is the catalog's SINner entry (by catalog id
 *  when the catalog is at hand, else its snapshot's name or its own; added by the box or by hand) with that entry's effects, or a
 *  hand-built Quality named exactly SINner (any case) with no effects at all. Renaming another amp, or adding any
 *  effect to a SINner (a narrative one too), makes it an amp priced like any other, first-Quality rule included.
 *  House rule (owner, 0.5.5): a SINner is always 0¥ and never takes the first-Quality slot, however it got there. */
export function isSinner(a: AmpEntry, c?: Catalog): boolean {
  if (a.type !== 'quality') return false
  const bare = a.effects.length === 0
  if (a.catalogId) {
    // without the catalog (reading a file): its snapshot, or with none its name
    const t = c ? (a.catalogId === sinnerTemplate(c)?.id ? c.amps.get(a.catalogId) : undefined)
      : plain(a.snapshot?.name ?? a.name) === 'sinner' ? a.snapshot ?? { effects: [] } : undefined
    return !!t && (bare || effectKey(a.effects) === effectKey(t.effects))
  }
  return (!!a.realSin || plain(a.name) === 'sinner') && bare
}

export function effectRating(c: Catalog, pick: EffectPick): number {
  const eff = c.ampEffects.get(pick.ref)
  if (!eff) return 0
  if (pick.ref === 'negative') return -(pick.value ?? 1)
  if (pick.ref === 'rcc') return eff.rating * (pick.value ?? 1)
  return eff.rating
}

/** base rating of the type (Qualities: 0 for the first, then baseAfterFirst) + sum of effects, never below 0 without
 *  the GM (no creation credit, CRB p.61); a SINner is free (house rule) */
export function ampRating(c: Catalog, amp: AmpEntry, ctx: AmpCtx): number {
  if (isSinner(amp, c)) return 0
  const r = rawAmpRating(c, amp, ctx)
  return ctx.negativeOk ? r : Math.max(0, r)
}
/** The rating as its effects add up, below 0 included (validate.ts). */
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

export const firstQualityUid = (b: Build, c?: Catalog) => b.amps.find(a => a.type === 'quality' && !isSinner(a, c))?.uid

export const ampCtx = (b: Build, amp: AmpEntry, c?: Catalog): AmpCtx => ({ isFirstQuality: firstQualityUid(b, c) === amp.uid })

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
  if (eff.excludes && amp.effects.some(e => e.ref === eff.excludes)) return `not with ${c.ampEffects.get(eff.excludes)?.name ?? eff.excludes}`
  return undefined
}

/** The effect an effect requires and the amp lacks, as the picker marks it. */
export const effectNeeds = (c: Catalog, amp: AmpEntry, eff: AmpEffect): string | undefined =>
  eff.requires && !amp.effects.some(e => e.ref === eff.requires) ? `requires ${c.ampEffects.get(eff.requires)?.name ?? eff.requires}` : undefined

/** The effects an amp's type may take; reason: why one is blocked, else what it still needs (allowed). */
export function legalEffects(c: Catalog, amp: AmpEntry): { effect: AmpEffect; allowed: boolean; reason?: string }[] {
  return [...c.ampEffects.values()].filter(e => e.types.includes(amp.type))
    .map(effect => { const reason = effectBlocked(c, amp, effect); return { effect, allowed: !reason, reason: reason ?? effectNeeds(c, amp, effect) } })
}

/** A catalog amp as a character entry; equipment amps also bring their base item, linked. */
export function ampFromTemplate(t: AmpTemplate, uid: () => string): { amp: AmpEntry; item?: ItemEntry } {
  const amp: AmpEntry = { uid: uid(), catalogId: t.id, type: t.type, name: t.name, narrative: t.narrative,
    effects: t.effects.map(e => ({ ...e })), vehicle: t.vehicle, snapshot: t }
  if (!t.item) return { amp }
  const item: ItemEntry = { uid: uid(), kind: t.item.kind, name: t.name, specialist: t.item.specialist, armor: t.item.armor,
    dv: t.item.dv, ranges: t.item.ranges }
  amp.linkedItem = item.uid
  return { amp, item }
}
