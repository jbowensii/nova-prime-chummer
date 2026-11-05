// Animalism (Bestial Nature pp. 21-22), as Commlink6 1.14.0's SR6AnimalismController handles it: the animalism powers are
// metamagics of their own type, bought outside initiation. Each animalism grade (a power, or a level of one that has levels)
// costs 10 + that grade in Karma at creation (its process(): 11, 12, 13 …); the grade at creation is capped by the rule
// CHARGEN_MAX_ANIMALISM (default 2) and the whole path by ALLOW_ANIMALISM (default on).
import type { Sr6Build } from '../../../formats/domain/character'
import type { Sr6Entry } from '../../../formats/domain/types'
import { flag, num, type CreationRules } from '../../../table-setup/domain/creation'
import type { Sr6Data } from '../../../catalog/domain/data'

/** An animalism power: a metamagic Commlink6 types ANIMALISM (`class="ANIMALISM"`), or, as a fallback, any
 *  of Bestial Nature's metamagics (its recipe imports only the animalism powers as metamagics: importer/sr6/recipes/bn.md). */
export const isAnimalism = (e: Sr6Entry | undefined): boolean => !!e && e.kind === 'metamagics' && (e.attrs.class === 'ANIMALISM' || e.source === 'BN')

/** The runner's animalism picks. */
export const animalismPicks = (b: Sr6Build, data: Sr6Data) => b.picks.filter(x => x.kind === 'metamagics' && isAnimalism(data.entry('metamagics', x.id)))

/** The animalism grade: one a power, a power with levels its level (CL6 getGrade). */
export const animalismGrade = (b: Sr6Build, data: Sr6Data) =>
  animalismPicks(b, data).reduce((t, x) => t + (x.level ?? data.levelOf(data.entry('metamagics', x.id)) ?? 1), 0)

/** Karma for the animalism grades: 10 + the grade, for each grade (CL6 process: 11 for the first, 12 for the next …). */
export function animalismKarma(b: Sr6Build, data: Sr6Data): number {
  let t = 0
  for (let g = 1; g <= animalismGrade(b, data); g++) t += 10 + g
  return t
}

/** The table's settings for the path: allowAnimalism (Commlink6 ALLOW_ANIMALISM, default on) and animalismMaxAtCreation
 *  (CHARGEN_MAX_ANIMALISM, default 2). */
export const animalismAllowed = (cr: CreationRules) => flag(cr, 'allowAnimalism') ?? true
export const animalismMax = (cr: CreationRules) => num(cr, 'animalismMaxAtCreation') ?? 2
