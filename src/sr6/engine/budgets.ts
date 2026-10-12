// Itemized creation budgets (a port of SR6 Forge's budgets.mjs): pure functions over a build, the catalog views
// (Sr6Data), the table's creation rules and the method's provider. Prices come from the catalog through bookValue (a
// <formula>, else the printed string read by rated());
// a value the app can't read counts 0 (priced().ok false, Review warns); an unset creation setting counts 0 (Review
// warns that it isn't set). Never NaN.
// The figures live in the modules re-exported here; this one adds every budget at once.
import { SR6_ATTRS, type Sr6Build } from '../model/character'
import type { CreationRules } from './creation'
import { MAGIC_KINDS, type Sr6Data } from './data'
import { pool, type Budget, type Provider } from './providers'
import { essenceBudget } from './essence'
import { countPicks as count, freeSpellSlots, powerPoints } from './magic'
import { skillSpend, knowledgePoints } from './skills'
import { contactPoints } from './contacts'
import { karmaBudget } from './karma'
import { nuyenBudget } from './nuyen'

export type { Budget, BudgetLine } from './providers'
export * from './choices'
export * from './purchases'
export * from './bonuses'
export * from './attributes'
export * from './essence'
export * from './magic'
export * from './skills'
export * from './contacts'
export * from './karma'
export * from './nuyen'

export interface Sr6Budgets {
  attributePoints: Budget; adjustmentPoints: Budget; skillPoints: Budget
  karma: Budget; nuyen: Budget
  /** magicLoss: the Magic or Resonance lost, 1 per started point of Essence spent (CRB p. 38) */
  essence: Budget & { magicLoss: number }
  /** cap: the most power points a mystic adept may buy (its priority Magic) */
  powerPoints: Budget & { cap: number }
  /** free spells and rituals (complex forms for a technomancer) */
  spellSlots: Budget
  contactPoints: Budget & { ratingCap: number; karma?: number }
  knowledgePoints: Budget
  /** point buy only */
  characterPoints?: Budget
}

/** Every budget, as the editor's budget panel shows them. */
export function allBudgets(b: Sr6Build, data: Sr6Data, cr: CreationRules, p: Provider): Sr6Budgets {
  const spend = (pool_: 'points' | 'adjust') => SR6_ATTRS.reduce((t, k) => t + b.attributes[k][pool_], 0)
  const k = MAGIC_KINDS[b.magic], slots = freeSpellSlots(b, data, cr, p)
  const cp = p.characterPoints?.(b)
  return {
    attributePoints: pool(p.attributePoints(b), spend('points')),
    adjustmentPoints: pool(p.adjustmentPoints(b), spend('adjust')),
    skillPoints: pool(p.skillPoints(b), skillSpend(b, cr, p.skillPoints(b), data).points),
    karma: karmaBudget(b, data, cr, p),
    nuyen: nuyenBudget(b, data, cr, p),
    essence: essenceBudget(b, data, cr),
    powerPoints: powerPoints(b, data, cr, p),
    spellSlots: pool(slots, k.resonance ? count(b, 'complexforms') : count(b, 'spells', 'rituals')),
    contactPoints: contactPoints(b, data, cr, p),
    knowledgePoints: knowledgePoints(b, data, cr, p),
    ...(cp ? { characterPoints: cp } : {}),
  }
}
