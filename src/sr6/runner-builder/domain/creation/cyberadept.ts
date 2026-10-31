// The cyberadept quality path (Hack & Slash pp. 86–87; owner ruling 4, 2026-10-31: from the book, as Commlink6 declares
// CYBERADEPT_NOVICE/DISCIPLE/MASTER but applies nothing). Each step raises the grade of the ware the runner already has,
// the Essence it saves an Essence hole for later ware, and later ware must be of a minimum grade. "Already has" and
// "later" come from the order lines were taken (`seq`, stamped by stampOrder: creation actions and career advances).
import type { Sr6Build } from '../../../formats/domain/character'
import type { Sr6Data } from '../../../catalog/domain/data'
import { ruleRefsOf } from './rule-markers'

type Step = 'CYBERADEPT_NOVICE' | 'CYBERADEPT_DISCIPLE' | 'CYBERADEPT_MASTER'
/** Per step: the grade raises on ware taken before it, and the least grade of ware taken after it. */
export const CYBERADEPT: Record<Step, { raise: Record<string, string>; min: string; name: string; page: number }> = {
  CYBERADEPT_NOVICE: { raise: { used: 'standard', omega: 'standard', standard: 'alpha' }, min: 'alpha', name: 'Cyberadept Novice', page: 86 },
  CYBERADEPT_DISCIPLE: { raise: { standard: 'alpha', alpha: 'beta' }, min: 'beta', name: 'Cyberadept Disciple', page: 87 },
  CYBERADEPT_MASTER: { raise: { alpha: 'beta', beta: 'delta' }, min: 'delta', name: 'Cyberadept Master', page: 87 },
}
/** The standard grades low to high (Body Shop's omega replaces used); others (gamma, exoware) aren't ranked. */
export const GRADE_RANK: Record<string, number> = { used: 0, omega: 0, standard: 1, alpha: 2, beta: 3, delta: 4, gamma: 5 }

/** The cyberadept steps the runner has, each with its order (a line without one: before everything taken later). */
export function cyberadeptSteps(b: Sr6Build, data: Sr6Data): { step: Step; seq: number }[] {
  return b.qualities.flatMap(q => {
    const e = data.entry('qualities', q.id)
    const refs = e ? ruleRefsOf(e) : []
    return (Object.keys(CYBERADEPT) as Step[]).filter(s => refs.includes(s)).map(step => ({ step, seq: q.seq ?? Infinity }))
  })
}

/** Give every purchase and quality without an order the next one (purchases first, so lines from before ordering existed
 *  count as taken before any quality). Called after each creation action and career advance. */
export function stampOrder(b: Sr6Build): void {
  let n = Math.max(0, ...b.purchases.map(x => x.seq ?? 0), ...b.qualities.map(q => q.seq ?? 0))
  for (const x of b.purchases) x.seq ??= ++n
  for (const q of b.qualities) q.seq ??= ++n
}
