// Essence spent on augmentations, and the Magic or Resonance it takes off.
import type { Sr6Build, Sr6Purchase } from '../../../formats/domain/character'
import { flag, n0, num, str, type CreationRules } from '../../../table-setup/domain/creation'
import type { Sr6Data } from '../../../catalog/domain/data'
import { pool, type Budget } from './providers'
import { entryOf, priced, round2 } from './purchases'
import { infectedEssence } from './infected'
import { activeRules } from './rule-markers'
import { CYBERADEPT, cyberadeptSteps } from './cyberadept'

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
  // the Sixth World Companion's Transhumanism (p. 146): each transhumanist grade is an Essence hole of 1.0, and an
  // augmentation's Essence is paid from the hole first
  // (Permanent Damage, RULE CANNOT_USE_ESSENCE_HOLE, Body Shop p. 16: no augmentation fills a hole; owner ruling 4)
  const sealed = activeRules(b, data).has('CANNOT_USE_ESSENCE_HOLE')
  let hole = sealed ? 0 : essenceHole(b, cr),
    spent = 0
  // (an owned critter's augmentations take its Essence, never the runner's: critters.ts)
  const ess = (x: Sr6Purchase, grade: string) =>
    priced({ ...x, grade: grade === 'standard' ? undefined : grade }, data, cr).essence * sensitiveFactor(b, data, cr, x)
  // the cyberadept path (cyberadept.ts, H&S pp. 86–87): in the order taken, a step raises the grade of the ware taken
  // before it and the Essence that saves is a hole later ware is paid from
  type Ev = { seq: number; ware?: Sr6Purchase; step?: ReturnType<typeof cyberadeptSteps>[number]['step'] }
  const events = [
    ...b.purchases.filter(x => x.kind !== 'critters').map((x): Ev => ({ seq: x.seq ?? 0, ware: x })),
    ...cyberadeptSteps(b, data).map((s): Ev => ({ seq: s.seq, step: s.step })),
  ].sort((p, q) => p.seq - q.seq || (p.ware ? -1 : 1))
  const had: { x: Sr6Purchase; grade: string }[] = []
  for (const ev of events) {
    if (ev.ware) {
      const c = ess(ev.ware, ev.ware.grade ?? 'standard'),
        use = Math.min(hole, c)
      hole -= use
      spent += c - use
      had.push({ x: ev.ware, grade: ev.ware.grade ?? 'standard' })
    } else
      for (const h of had) {
        const to = CYBERADEPT[ev.step!].raise[h.grade]
        if (!to) continue
        if (!sealed) hole += Math.max(0, ess(h.x, h.grade) - ess(h.x, to))
        h.grade = to
      }
  }
  spent = round2(spent)
  // (a Strain II or III Infected starts at Essence 5, the Sixth World Companion p. 106)
  const max = infectedEssence(b, data) ?? n0(cr, 'essence')
  return { ...pool(max, spent), left: round2(max - spent), magicLoss: Math.ceil(spent - 1e-9) }
}

/** The Magic or Resonance the runner's Essence spending takes off (1 per started point, CRB p. 38): the one figure the
 *  attributes, power points and free spells all lose (essenceBudget's magicLoss). */
export const magicLoss = (b: Sr6Build, data: Sr6Data, cr: CreationRules) => essenceBudget(b, data, cr).magicLoss
