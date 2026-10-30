// RULE-marker engine: reads Commlink6's special-rule markers off a runner's chosen qualities and applies the
// creation-cost rules the builder enforces. CL6 flags a rule as `<itemmod type="RULE" ref="REF"/>`, which our importer
// carries as a `<modifier kind="itemmod" type="RULE" ref="REF"/>` child (structureOf reads it); CL6 hardcodes what each
// ref does, so we read the marker instead of a quality id. Combat/damage/condition refs (UNARMED_DAMAGE_IS_PHYSICAL,
// PAIN_TOLERANCE_*, WOUND_MOD_PLUS_1, …) are the Foundry sheet/effects engine's, not the builder's, and are not here.
import type { Sr6Build, Sr6Knowledge } from '../../../formats/domain/character'
import type { Sr6Data } from '../../../catalog/domain/data'
import type { Sr6Entry } from '../../../formats/domain/types'
import { structureOf } from '../../../catalog/domain/structure'

/** The creation-cost RULE refs the builder implements today. */
export type RuleRef =
  | 'POLYGLOT'
  | 'KNOWLEDGE_COST2_AT_GEN'
  | 'KARMA_COST_PLUS_1'
  | 'CONTACTS_START_LOYAL2'
  | 'DECREASE_AVAILABILITY_2'
  | 'MARTIAL_ARTS_PRODIGY'
  | 'FASHION_50_PERCENT'
  | 'DECK_5000_PER_KARMA'

/** The RULE refs an entry carries on its own (its `<modifier type="RULE" ref>` markers): the Foundry export lists them so the module
 *  can apply the same cost rule in play, and the effects list words them (RULE_TEXT). */
export const ruleRefsOf = (e: Sr6Entry): string[] =>
  structureOf(e)
    .modifiers.filter(m => m.type === 'RULE' && m.ref)
    .map(m => m.ref as string)

/** The wording of a RULE ref for the effects list (only the refs worth a line there). */
export const RULE_TEXT: Partial<Record<string, string>> = {
  POLYGLOT: 'Language ranks cost 1 Karma less (never below 1) and go to rank 4',
}

/** The set of active RULE refs, read from each chosen quality's `<modifier type="RULE" ref>` marker. */
export function activeRules(b: Sr6Build, data: Sr6Data): Set<string> {
  const refs = new Set<string>()
  for (const q of b.qualities) {
    const e = data.entry('qualities', q.id)
    if (e) for (const ref of ruleRefsOf(e)) refs.add(ref)
  }
  return refs
}

/** Per-rank Karma cost rules on a Knowledge skill at creation, by ref: each adjusts the table's base per-rank cost, and
 *  they fold in order. Add a knowledge-cost ref here in one line. */
const KNOWLEDGE_KARMA_RULES: { ref: RuleRef; apply: (base: number) => number }[] = [
  { ref: 'KNOWLEDGE_COST2_AT_GEN', apply: base => base * 2 }, // Scholastic Mage: Knowledge skills cost 2 Karma each at creation
  { ref: 'KARMA_COST_PLUS_1', apply: base => base + 1 }, // Invalid Inferences: +1 Karma a Knowledge rank
]

/** Karma per rank for a Knowledge skill (not a language) at creation, after the active cost rules (knowledgeKarma(…, 1)
 *  is 2 with Scholastic Mage, 1 without). */
export function knowledgeKarma(b: Sr6Build, data: Sr6Data, base: number): number {
  const refs = activeRules(b, data)
  return KNOWLEDGE_KARMA_RULES.reduce((n, r) => (refs.has(r.ref) ? r.apply(n) : n), base)
}

/** Starting-nuyen alternative for purchased Knowledge ranks; languages never qualify. */
export function knowledgeNuyenAvailable(b: Sr6Build, data: Sr6Data): boolean {
  return activeRules(b, data).has('KNOWLEDGE_COST2_AT_GEN')
}

export function knowledgeUsesNuyen(b: Sr6Build, data: Sr6Data, k: Sr6Knowledge): boolean {
  return k.payment === 'nuyen' && k.kind === 'knowledge' && !k.native && knowledgeNuyenAvailable(b, data)
}

/** Paid Loyalty remains on the contact; the free point never enters its budget. */
export function contactLoyalty(b: Sr6Build, data: Sr6Data, paid: number, charisma: number): number {
  return activeRules(b, data).has('CONTACTS_START_LOYAL2') ? Math.min(charisma, paid + 1) : paid
}

/** Apply after rating and grade, leaving legality and licence metadata intact. */
export function effectiveAvailability(b: Sr6Build, data: Sr6Data, base: number): number {
  // floor at 0 (owner ruling 2026-10-24): the quality never makes a freely available (avail-0) item harder to get
  return activeRules(b, data).has('DECREASE_AVAILABILITY_2') ? Math.max(0, base - 2) : base
}

/** Fashion Influencer: designer-fashion clothing (armor with a fashion slot) costs half. */
export const fashionDiscount = (b: Sr6Build, data: Sr6Data): boolean => activeRules(b, data).has('FASHION_50_PERCENT')

/** Discount each paid style and technique separately at creation. */
export function martialCreationKarma(b: Sr6Build, data: Sr6Data, base: number): number {
  return activeRules(b, data).has('MARTIAL_ARTS_PRODIGY') ? Math.max(0, base - 2) : base
}

/** Nuyen a Karma is worth toward a cyberdeck or cyberhack with Deck Builder (Hack & Slash p. 81: 5,000¥ instead of 4,000¥). */
export const DECK_NUYEN_PER_KARMA = 5000

/** A cyberdeck or cyberhack, or a part of one: its class names a CYBERDECK table, or its category is Cyberhack. */
export const isDeckPart = (e?: { attrs: { class?: string; category?: string } }) =>
  /CYBERDECK/i.test(e?.attrs.class ?? '') || /^cyberhacks?$/i.test(e?.attrs.category ?? '')

/** Karma the runner has put into deck-building: karmaToDeck, but only with Deck Builder (else 0). */
export const deckKarma = (b: Sr6Build, data: Sr6Data) => (activeRules(b, data).has('DECK_5000_PER_KARMA') ? Math.max(0, b.karmaToDeck) : 0)
