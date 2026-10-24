// Skills at creation: skill points, specializations and expertises, aptitudes, and the free knowledge points.
import type { Sr6Build, Sr6Skill } from '../../../formats/domain/character'
import { flag, n0, num, str, type CreationRules } from '../../../table-setup/domain/creation'
import type { Sr6Data } from '../../../catalog/domain/data'
import { normName } from '../../../catalog/domain/names'
import { knowledgeSpend, pool, type Budget, type Provider } from './providers'
import { activeRules } from './rule-markers'
import { noteSkill } from './choices'
import { augmentedRating } from './attributes'

/** Polyglot (SWC p. 135): a language costs 1 Karma less a rank (never below 1) and goes to rank 4. Languages only.
 *  Driven by the RULE-marker engine (rule-markers.ts): the quality's `<modifier type="RULE" ref="POLYGLOT">` marker is
 *  active, or (back-compat) it is the known quality id — the catalog carries both. */
export const POLYGLOT = 'swc.polyglot'
export const hasPolyglot = (b: Sr6Build, data: Sr6Data) => activeRules(b, data).has('POLYGLOT') || b.qualities.some(q => q.id === POLYGLOT)
export const languageKarma = (b: Sr6Build, data: Sr6Data, perRank: number) => (hasPolyglot(b, data) ? Math.max(1, perRank - 1) : perRank)
export const languageCap = (b: Sr6Build, data: Sr6Data, most: number | undefined) => (most !== undefined && hasPolyglot(b, data) ? Math.max(most, 4) : most)

/** The skills the aptitude qualities name (CRB Hong Kong p. 70: "for the selected skill"): null without one; a quality
 *  whose note names no skill adds none (Review's quality.choice asks for it). */
export function aptitudeSkills(data: Sr6Data, cr: CreationRules, b: Sr6Build): string[] | null {
  const id = str(cr, 'aptitudeQuality'),
    qs = b.qualities.filter(q => data.sameFamily('qualities', q.id, id))
  return id && qs.length ? qs.map(q => noteSkill(data, q.note)).filter((x): x is string => !!x) : null
}
export const skillRank = (s: Pick<Sr6Skill, 'points' | 'karma'>) => s.points + s.karma

/** Skill points spent, and how many specializations (karma) and expertises (expertise) karma buys: the ranks take their
 *  points; a specialization on a skill with skill points takes the points still left, and one they don't cover is bought
 *  with karma (CRB p.66: a specialization costs a skill rank; p.68: or 5 karma), as is one on a skill with only karma
 *  ranks. An expertise is bought with the customization karma at its advancement price (owner, 2026-10-09: CRB p. 65's
 *  "you cannot acquire an expertise" is the priority skill points'; step four, p. 66, buys advancement at p. 68's
 *  prices), unless the table gives it skill points (skillPointsExpertise), which it then takes as a specialization does. */
export function skillSpend(b: Sr6Build, cr: CreationRules, pool: number, data?: Sr6Data): { points: number; karma: number; expertise: number } {
  let points = b.skills.reduce((t, sk) => t + sk.points, 0),
    karma = 0,
    expertise = 0
  const take = (on: boolean, cost: number) => {
    if (on && (cost === 0 || points + cost <= pool)) {
      points += cost
      return true
    }
    return false
  }
  const expPoints = num(cr, 'skillPointsExpertise')
  // (the house rule exoticFirstSpecFree, owner 2026-10-11: Exotic Weapons' first specialization costs nothing)
  const free = (id: string) => !!data && !!flag(cr, 'exoticFirstSpecFree') && normName(data.skills[id]?.name ?? '') === 'exotic weapons'
  for (const sk of b.skills) {
    if (sk.spec && !free(sk.id) && !take(sk.points > 0, n0(cr, 'skillPointsSpec'))) karma++
    // (a further specialization, Exotic Weapons' or with Expanded Specializations: priced as the first)
    for (const _ of sk.specs ?? []) if (!take(sk.points > 0, n0(cr, 'skillPointsSpec'))) karma++
    if (sk.expertise && (expPoints === undefined || !take(sk.points > 0, expPoints))) expertise++
  }
  return { points, karma, expertise }
}

/** Whether a skill may have several specializations: Exotic Weapons (CRB Hong Kong p. 95), or any with the Sixth World
 *  Companion's Expanded Specializations (p. 153, expandedSpecializations). */
export const manySpecs = (data: Sr6Data, cr: CreationRules, skill: string) =>
  !!flag(cr, 'expandedSpecializations') || normName(data.skills[skill]?.name ?? '') === 'exotic weapons'

/** Free knowledge points: baseline (CRB p. 97) Logic x knowledgePerLog (default 1); optional rule knowledgeLogicIntuition (p. 98) (Logic + Intuition) x 2. */
export function knowledgePoints(b: Sr6Build, data: Sr6Data, cr: CreationRules, p: Provider): Budget {
  const log = augmentedRating(b, data, 'log', p)
  const free = flag(cr, 'knowledgeLogicIntuition') ? (log + augmentedRating(b, data, 'int', p)) * 2 : log * n0(cr, 'knowledgePerLog')
  return p.knowledgePoints?.(b) ?? pool(free, knowledgeSpend(b))
}
