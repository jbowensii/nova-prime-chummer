// Magic at creation: free spells and complex forms, those bought past them, power points, data structures, the Magic cap.
import type { Sr6Build } from '../../../formats/domain/character'
import { flag, n0, num, type CreationRules } from '../../../table-setup/domain/creation'
import { MAGIC_KINDS, type Sr6Data } from '../../../catalog/domain/data'
import { normName } from '../../../catalog/domain/names'
import type { Budget, Provider } from './providers'
import { TEST_TYPES } from '../../../catalog/domain/effects'
import { round2 } from './purchases'
import { noteSkill } from './choices'
import { attrRating } from './attributes'
import { magicLoss } from './essence'
import { infectedMagicMax } from './infected'

/** How many picks of these kinds the runner has. */
export const countPicks = (b: Sr6Build, ...kinds: Sr6Build['picks'][number]['kind'][]) => b.picks.filter(x => kinds.includes(x.kind)).length

/** The spells and rituals, and the complex forms, past the free ones (freeSpellSlots): bought with Karma. */
export function extraMagic(b: Sr6Build, data: Sr6Data, cr: CreationRules, p: Provider): { spells: number; forms: number } {
  const free = freeSpellSlots(b, data, cr, p),
    res = MAGIC_KINDS[b.magic].resonance
  return { spells: Math.max(0, countPicks(b, 'spells', 'rituals') - (res ? 0 : free)), forms: Math.max(0, countPicks(b, 'complexforms') - (res ? free : 0)) }
}

/** Free spells and rituals (complex forms for a technomancer): the method's Magic or Resonance rating (not as adjusted,
 *  but less what Essence took: CRB Hong Kong p. 66) times the setting; a mystic adept first takes off the power points it
 *  bought (CRB pp. 65–66), from its actual Magic (as raised), not the table's base, since that is what it buys them against.
 *  Point buy buys them with character points instead (R: the Sixth World Companion's method). */
export function freeSpellSlots(b: Sr6Build, data: Sr6Data, cr: CreationRules, p: Provider): number {
  const k = MAGIC_KINDS[b.magic]
  if (b.method === 'pointbuy') return k.resonance ? b.cp.complexForms : k.spells ? b.cp.spells : 0
  const rating = Math.max(0, p.magicRating(b) - magicLoss(b, data, cr)),
    karma = b.method === 'karma' // (the Karma build has its own)
  if (k.resonance) return rating * n0(cr, karma ? 'karmaBuild.freeFormsPerResonance' : 'freeFormsPerResonance')
  if (!k.spells) return 0
  // (a mystic adept buys its power points against its actual Magic, as powerPoints() does, so what's left casts)
  const casting = k.paysPowers ? Math.max(0, attrRating(b, 'mag', p) - magicLoss(b, data, cr) - b.powerPointsBought) : rating
  return casting * n0(cr, karma ? 'karmaBuild.freeSpellsPerMagic' : 'freeSpellsPerMagic')
}

/** An adept's power points are its Magic: one per point, the priority's and any raised with adjustment points or karma
 *  (CRB p.157); a mystic adept's are the ones it bought (capped by that Magic); in point buy they're bought with
 *  character points. A leveled power costs per level. */
export function powerPoints(b: Sr6Build, data: Sr6Data, cr: CreationRules, p: Provider): Budget & { cap: number } {
  // (Magic as Essence leaves it: a point of Magic lost is a power point lost, CRB pp. 38, 156)
  const k = MAGIC_KINDS[b.magic],
    rating = Math.max(0, attrRating(b, 'mag', p) - magicLoss(b, data, cr))
  // (the Sixth World Companion's Alternate Mystic Adept, p. 148: half a point a point of Magic, and half a point for each
  // point of Magic raised past the priority's)
  const alt = k.paysPowers && !!flag(cr, 'alternateMysticAdept')
  const bought = alt ? (b.powerPointsBought + Math.max(0, attrRating(b, 'mag', p) - p.magicRating(b))) / 2 : b.powerPointsBought
  const max = !k.powers ? 0 : b.method === 'pointbuy' ? b.cp.powerPoints : k.paysPowers ? bought : rating
  const spent = round2(b.picks.filter(x => x.kind === 'adeptpowers').reduce((t, x) => t + powerCost(data, x), 0))
  return { max, spent, left: round2(max - spent), cap: rating }
}

/** A power's power points at its level: Improved Ability's combat price when the skill its note names is a combat skill
 *  (CRB Hong Kong p. 157: 1.0 a level, other skills 0.5; the combat skills Close Combat, Exotic Weapons and Firearms,
 *  p. 95). */
export function powerCost(data: Sr6Data, x: Pick<Sr6Build['picks'][number], 'id' | 'level' | 'note'>): number {
  const v = data.powers[x.id],
    sk = x.note ? noteSkill(data, x.note) : undefined
  const combat = !!sk && TEST_TYPES.combat.includes(normName(data.skills[sk]?.name ?? ''))
  return ((combat && v?.costCombat != null ? v.costCombat : v?.cost) ?? 0) * (v?.perLevel ? (x.level ?? 1) : 1)
}

/** The levels of the runner's data structures added up (their Karma and, times dataStructureNuyen, their nuyen). */
export const dataStructureLevels = (b: Sr6Build) => b.picks.filter(x => x.kind === 'datastructures').reduce((t, x) => t + (x.level ?? 1), 0)

/** The highest Magic or Resonance at creation: magicMax (CRB Hong Kong p. 65), plus the initiation or submersion grade
 *  with the option magicAboveSixByGrade (p. 167); an Infected's Magic its type's (infected.ts infectedMagicMax, with
 *  `data`). undefined: magicMax unset. */
export function magicCap(b: Sr6Build, cr: CreationRules, attr: 'mag' | 'res', data?: Sr6Data): number | undefined {
  const infected = attr === 'mag' && data ? infectedMagicMax(b, data, cr) : undefined
  if (infected !== undefined) return infected
  const max = num(cr, 'magicMax')
  return max === undefined ? undefined : max + (flag(cr, 'magicAboveSixByGrade') ? (attr === 'mag' ? b.initiation : b.submersion) : 0)
}
