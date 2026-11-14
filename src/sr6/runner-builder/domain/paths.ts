// Graph quality paths (the books' Quality Paths, catalog/domain/data.ts QualityPath) on a runner: start a path, step to one
// of the current step's nextSteps (a loop revisits a step, so visitedStepIds repeats), pick a choice, rewind or drop it.
// A step's `add`/`remove` mods grant and revoke quality rows through the engine's own `quality` op; valmod and choice
// mods are display-only (applied at the table). A mod that can't be applied (no such catalog quality, or the engine
// refuses) is logged and skipped, and its sentence is returned so the card can show it.
import type { CreationRules } from '../../table-setup/domain/creation'
import type { PathStep, QualityPath, Sr6Data } from '../../catalog/domain/data'
import type { Sr6Character } from '../../formats/domain/character'
import { apply } from './creation/actions'

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** A path ref `quality:<id>` as a catalog quality id (`<book>.<name>`): the id's name part matches ignoring case and
 *  punctuation, the path's own book first. null: not a quality ref, or not in the catalog. */
export function qualityIdOf(data: Pick<Sr6Data, 'qualities'>, ref: string, bookKey = ''): string | null {
  const m = /^quality:(.+)$/.exec(ref)
  if (!m) return null
  const ids = Object.keys(data.qualities).filter(id => norm(id.slice(id.indexOf('.') + 1)) === norm(m[1]))
  return ids.find(id => id.startsWith(`${bookKey}.`)) ?? ids[0] ?? null
}

/** Whether the runner meets a step's QUALITY requirements (`<datareq type="QUALITY" ref negate>`). Other requirement
 *  types are not checked (ponytail: the engine has no evaluator for them; they let the path through). */
export function meets(ch: Sr6Character, data: Pick<Sr6Data, 'qualities'>, step: PathStep, bookKey = ''): boolean {
  for (const x of step.requires)
    for (const m of x.matchAll(/<datareq\s[^>]*>/g)) {
      const tag = m[0]
      if (!/type="QUALITY"/.test(tag)) continue
      const ref = /ref="([^"]+)"/.exec(tag)?.[1]
      const id = ref && qualityIdOf(data, `quality:${ref}`, bookKey)
      if (!id) continue
      if (ch.build.qualities.some(q => q.id === id) === /negate="true"/.test(tag)) return false
    }
  return true
}

export const stepOf = (path: QualityPath, id: string) => path.steps.find(s => s.id === id)
export const progressOf = (ch: Sr6Character, path: QualityPath) => ch.pathProgress?.find(p => p.pathId === path.id)

/** The paths the runner may add (it meets the first step's requirements) or is already on. */
export const pathsFor = (ch: Sr6Character, data: Pick<Sr6Data, 'qualities'>, paths: QualityPath[]) =>
  paths.filter(p => progressOf(ch, p) || (p.steps[0] && meets(ch, data, p.steps[0], p.bookKey)))

/** Apply (or, `undo`, reverse) a step's add/remove mods on the runner's build; the sentences of those skipped. */
function applyMods(ch: Sr6Character, path: QualityPath, step: PathStep, data: Sr6Data, cr: CreationRules, undo: boolean): string[] {
  const skipped: string[] = []
  for (const m of step.modifications) {
    if (m.op !== 'add' && m.op !== 'remove') continue
    const grant = (m.op === 'add') !== undo
    const id = qualityIdOf(data, m.ref, path.bookKey)
    const skip = (why: string) => {
      const s = `${grant ? 'Add' : 'Remove'} ${m.ref} (${step.name}): ${why}`
      console.warn(`[quality path ${path.id}] ${s}`)
      skipped.push(s)
    }
    if (!id) {
      skip('not in the catalog')
      continue
    }
    const row = ch.build.qualities.find(q => q.id === id && !q.free)
    if (grant ? row : !row) continue // already so
    const r = apply(ch.build, grant ? { op: 'quality', id } : { op: 'quality', remove: row!.uid }, data, cr)
    if (!r.ok) skip(`refused (${String(r.reason)})`)
  }
  return skipped
}

/** Start the path at its first step. */
export function startPath(ch: Sr6Character, path: QualityPath, data: Sr6Data, cr: CreationRules): string[] {
  const first = path.steps[0]
  if (!first || progressOf(ch, path)) return []
  ;(ch.pathProgress ??= []).push({ pathId: path.id, currentStepId: first.id, visitedStepIds: [first.id], choicesByStepId: {} })
  return applyMods(ch, path, first, data, cr, false)
}

/** Move to one of the current step's nextSteps (a loop back to an earlier step is one of them). */
export function advancePath(ch: Sr6Character, path: QualityPath, to: string, data: Sr6Data, cr: CreationRules): string[] {
  const p = progressOf(ch, path),
    cur = p && stepOf(path, p.currentStepId),
    next = stepOf(path, to)
  if (!p || !cur || !next || !cur.nextSteps.includes(to)) return []
  p.currentStepId = to
  p.visitedStepIds.push(to)
  return applyMods(ch, path, next, data, cr, false)
}

/** Back one step (its mods reversed), or, from the first step, off the path. */
export function rewindPath(ch: Sr6Character, path: QualityPath, data: Sr6Data, cr: CreationRules): string[] {
  const p = progressOf(ch, path),
    cur = p && stepOf(path, p.currentStepId)
  if (!p || !cur) return []
  const skipped = applyMods(ch, path, cur, data, cr, true)
  p.visitedStepIds.pop()
  if (!p.visitedStepIds.includes(cur.id)) delete p.choicesByStepId[cur.id]
  const prev = p.visitedStepIds.at(-1)
  if (prev === undefined) ch.pathProgress = ch.pathProgress.filter(x => x !== p)
  else p.currentStepId = prev
  return skipped
}

/** Drop the path, rewinding every step. */
export function removePath(ch: Sr6Character, path: QualityPath, data: Sr6Data, cr: CreationRules): string[] {
  const skipped: string[] = []
  while (progressOf(ch, path)) skipped.push(...rewindPath(ch, path, data, cr))
  return skipped
}

/** Record the pick for a step's choice ('' as the option clears it). */
export function chooseAt(ch: Sr6Character, path: QualityPath, stepId: string, optionRef: string, subOptionRef?: string) {
  const p = progressOf(ch, path)
  if (!p) return
  if (!optionRef) delete p.choicesByStepId[stepId]
  else p.choicesByStepId[stepId] = subOptionRef ? { optionRef, subOptionRef } : { optionRef }
}
