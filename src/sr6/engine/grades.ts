// Augmentation grades. A grade's Essence and cost factors and its Availability modifier come from the creation settings
// (`grade:<key>:essence|cost|avail`: the core rulebook's five ship as defaults), else from a catalog grade (kind grades:
// the core rulebook's table, Body Shop's omega grade and exoware) by its key, the name without "ware" or "grade"
// (Alphaware: alpha). A grade is offered once its Essence factor is set (a catalog grade also needs its cost: gammaware
// prints none, it isn't bought). Grades are for cyberware and bioware; a catalog grade may name fewer types (exoware).
import { GRADED_TYPES, type Sr6Entry } from '../model/types'
import { flag, num, type CreationRules } from './creation'
import type { Sr6Data } from './types'

export const STANDARD_GRADES = ['standard', 'alpha', 'beta', 'delta', 'used']
export type GradeFactor = 'essence' | 'cost' | 'avail'

export function gradeFactor(cr: CreationRules, data: Sr6Data, g: string, k: GradeFactor): number | undefined {
  return num(cr, `grade:${g}:${k}`) ?? data.grades[g]?.[k] ?? undefined
}

/** Whether a grade can be bought: its Essence factor set (a catalog grade's cost too). */
export function gradeKnown(cr: CreationRules, data: Sr6Data, g: string): boolean {
  if (num(cr, `grade:${g}:essence`) !== undefined) return true
  const c = data.grades[g]
  return !!c && c.essence !== null && c.cost !== null
}

/** The grades a catalog entry (none: a custom line) can take, the standard five first, then the catalog's; a grade a later
 *  book redefines (the core rulebook's used, Body Shop's omega) gives way to the new one. With the house rule
 *  noUsedCulturedBioware (owner, 2026-10-11) cultured bioware takes no used grade (nor the omega grade that replaces it). */
export function gradesFor(cr: CreationRules, data: Sr6Data, e?: Sr6Entry): string[] {
  const known = [...new Set([...STANDARD_GRADES, ...Object.keys(data.grades)])].filter(g => gradeKnown(cr, data, g))
  const gone = new Set(known.map(g => data.grades[g]?.replaces).filter((g): g is string => !!g))
  const all = known.filter(g => !gone.has(g))
  const used = (g: string) => g === 'used' || data.grades[g]?.replaces === 'used'
  const cultured = !!e && !!flag(cr, 'noUsedCulturedBioware') && /cultured/i.test(e.attrs.category ?? '')
  return e ? all.filter(g => (data.grades[g]?.types ?? GRADED_TYPES).includes(e.attrs.type ?? '') && !(cultured && used(g))) : all
}

/** Whether entry `e` comes in grade `g`: one offered, or one a later book redefined as an offered one (a used line once
 *  Body Shop's omega replaces it). */
export function gradeFits(cr: CreationRules, data: Sr6Data, e: Sr6Entry, g: string): boolean {
  const offered = gradesFor(cr, data, e)
  return offered.includes(g) || offered.some(o => data.grades[o]?.replaces === g)
}

/** A grade as shown: the catalog's name, else the key with a capital. */
export const gradeName = (data: Sr6Data, g: string) => data.grades[g]?.name ?? g[0].toUpperCase() + g.slice(1)

/** Why a grade can't go on a line at all (null when it can): unknown (its factors unset), or the line no augmentation
 *  (a custom line may take any). A grade an augmentation's type doesn't take may go on it: Review's gear.grade. */
export function gradeProblem(cr: CreationRules, data: Sr6Data, g: string, e?: Sr6Entry): 'unknown-grade' | 'no-grade' | null {
  if (!gradeKnown(cr, data, g)) return 'unknown-grade'
  return !e || e.kind === 'augmentations' ? null : 'no-grade'
}

/** The grades a picker offers an entry: an augmentation every grade that can be bought, those its type takes first (the
 *  others marked: gear.grade); anything else none. */
export function gradeOptions(cr: CreationRules, data: Sr6Data, e?: Sr6Entry): string[] {
  if (e && e.kind !== 'augmentations') return []
  const fit = gradesFor(cr, data, e)
  return [...fit, ...gradesFor(cr, data).filter(g => !fit.includes(g))]
}
