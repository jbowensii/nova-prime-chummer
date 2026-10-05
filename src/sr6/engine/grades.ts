// Augmentation grades. A grade's Essence and cost factors and its Availability modifier come from the creation settings
// (`grade:<key>:essence|cost|avail`: the core rulebook's five ship as defaults), else from a catalog grade (kind grades:
// the core rulebook's table, Body Shop's omega grade and exoware) by its key, the name without "ware" or "grade"
// (Alphaware: alpha). A grade is offered once its Essence factor is set (a catalog grade also needs its cost: gammaware
// prints none, it isn't bought). Grades are for cyberware and bioware; a catalog grade may name fewer types (exoware).
import { GRADED_TYPES, type Sr6Entry } from '../model/types'
import { num, type CreationRules } from './creation'
import { normName, type Sr6Data } from './data'

export const STANDARD_GRADES = ['standard', 'alpha', 'beta', 'delta', 'used']
export type GradeFactor = 'essence' | 'cost' | 'avail'

/** A catalog grade's key: its name in lower case without "ware" or "grade" (Omega Grade: omega, Exoware: exo). */
export const gradeKey = (name: string) => normName(name).replace(/\s+grade$/, '').replace(/ware$/, '').trim().replace(/\s+/g, '-')

export function gradeFactor(cr: CreationRules, data: Sr6Data, g: string, k: GradeFactor): number | undefined {
  return num(cr, `grade:${g}:${k}`) ?? data.grades[g]?.[k] ?? undefined
}

/** Whether a grade can be bought: its Essence factor set (a catalog grade's cost too). */
export function gradeKnown(cr: CreationRules, data: Sr6Data, g: string): boolean {
  if (num(cr, `grade:${g}:essence`) !== undefined) return true
  const c = data.grades[g]
  return !!c && c.essence !== null && c.cost !== null
}

/** The grades a catalog entry (none: a custom line) can take, the standard five first, then the catalog's. */
export function gradesFor(cr: CreationRules, data: Sr6Data, e?: Sr6Entry): string[] {
  const all = [...new Set([...STANDARD_GRADES, ...Object.keys(data.grades)])].filter(g => gradeKnown(cr, data, g))
  return e ? all.filter(g => (data.grades[g]?.types ?? GRADED_TYPES).includes(e.attrs.type ?? '')) : all
}

/** A grade as shown: the catalog's name, else the key with a capital. */
export const gradeName = (data: Sr6Data, g: string) => data.grades[g]?.name ?? g[0].toUpperCase() + g.slice(1)

/** Why a grade can't go on a line (null when it can): unknown, or not for this entry's type. */
export function gradeProblem(cr: CreationRules, data: Sr6Data, g: string, e?: Sr6Entry): 'unknown-grade' | 'no-grade' | null {
  if (!gradeKnown(cr, data, g)) return 'unknown-grade'
  return gradesFor(cr, data, e).includes(g) ? null : 'no-grade'
}
