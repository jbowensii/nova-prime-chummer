// Essence spent on augmentations, and the Magic or Resonance it takes off.
import type { Sr6Build, Sr6Purchase } from '../model/character'
import { flag, n0, num, str, type CreationRules } from './creation'
import type { Sr6Data } from './data'
import { pool, type Budget } from './providers'
import { entryOf, priced, round2 } from './purchases'

/** The Essence factor Sensitive System puts on a line (CRB Hong Kong p. 78: doubled for cyberware, bioware and nanoware,
 *  not geneware; sensitiveSystemQuality, sensitiveSystemEssence): 1 without it. */
export function sensitiveFactor(b: Sr6Build, data: Sr6Data, cr: CreationRules, x: Sr6Purchase): number {
  const id = str(cr, 'sensitiveSystemQuality'),
    f = num(cr, 'sensitiveSystemEssence')
  if (!id || f === undefined || !b.qualities.some(q => q.id === id)) return 1
  return /^(cyberware|bioware|nanoware)/i.test(entryOf(x, data)?.attrs.type ?? '') ? f : 1
}

/** The Essence hole a mundane's transhumanist grades make (1.0 each, Sixth World Companion p. 146); none with the rule off. */
export const essenceHole = (b: Sr6Build, cr: CreationRules) => (flag(cr, 'transhumanism') ? b.transhuman : 0)

export function essenceBudget(b: Sr6Build, data: Sr6Data, cr: CreationRules): Budget & { magicLoss: number } {
  const all = round2(b.purchases.reduce((t, x) => t + priced(x, data, cr).essence * sensitiveFactor(b, data, cr, x), 0))
  // the Sixth World Companion's Transhumanism (p. 146): each transhumanist grade is an Essence hole of 1.0, and an
  // augmentation's Essence is paid from the hole first
  const spent = round2(Math.max(0, all - essenceHole(b, cr)))
  return { ...pool(n0(cr, 'essence'), spent), left: round2(n0(cr, 'essence') - spent), magicLoss: Math.ceil(spent - 1e-9) }
}

/** The Magic or Resonance the runner's Essence spending takes off (1 per started point, CRB p. 38): the one figure the
 *  attributes, power points and free spells all lose (essenceBudget's magicLoss). */
export const magicLoss = (b: Sr6Build, data: Sr6Data, cr: CreationRules) => essenceBudget(b, data, cr).magicLoss
