// Graph quality paths (the books' Quality Paths, catalog/domain/data.ts QualityPath) on a runner: start a path, step to one
// of the current step's nextSteps (a loop revisits a step, so visitedStepIds repeats), pick a choice, rewind or drop it.
// A step's `add`/`remove` mods grant and revoke quality rows through the engine's own `quality` op; valmod and choice
// mods are display-only (applied at the table). A mod that can't be applied (no such catalog quality, or the engine
// refuses) is logged and skipped, and its sentence is returned so the card can show it.
import type { CreationRules } from '../../table-setup/domain/creation'
import type { PathModification, PathStep, QualityPath, Sr6Data } from '../../catalog/domain/data'
import type { Sr6Character } from '../../formats/domain/character'
import { apply } from './creation/actions'
import { deriveSr6 } from './creation/derive'

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** A path ref `quality:<id>` as a catalog quality id (`<book>.<name>`): the id's name part matches ignoring case and
 *  punctuation, the path's own book first. With the path: else a quality named as the ref, `<path>: <step>` (how the
 *  importer files a step) or the step's name alone, a parenthetical aside (`Phobia (Object)`) ignored.
 *  null: not a quality ref, or not in the catalog. tools/cl6check/paths.py reads the same rule. */
export function qualityIdOf(data: Pick<Sr6Data, 'qualities'>, ref: string, bookKey = '', path?: QualityPath): string | null {
  const m = /^quality:(.+)$/.exec(ref)
  if (!m) return null
  const ids = Object.keys(data.qualities).filter(id => norm(id.slice(id.indexOf('.') + 1)) === norm(m[1]))
  const hit = ids.find(id => id.startsWith(`${bookKey}.`)) ?? ids[0]
  if (hit || !path) return hit ?? null
  const step = path.steps.find(x => x.id === m[1])
  const want = [m[1], ...(step ? [`${path.name}${step.name}`, step.name] : [])].map(norm)
  const names = Object.entries(data.qualities).map(([id, q]) => [id, norm(q.name), norm(q.name.replace(/\s*\(.*$/, ''))] as const)
  for (const w of want) {
    const found = names.find(n => n[1] === w || n[2] === w)
    if (found) return found[0]
  }
  return null
}

const MAGIC: Record<string, string> = { magician: 'full', adept: 'adept', mysticadept: 'mystic-adept', aspectedmagician: 'aspected' }
const warned = new Set<string>()
const attr = (tag: string, k: string) => new RegExp(`\\b${k}="([^"]*)"`).exec(tag)?.[1]

/** Whether the runner meets a step's requirements: QUALITY (`negate` too), MAGIC_RESO (any one named kind, or a held
 *  quality of that name: Minor Awakened) and ATTRIBUTE ESSENCE (`max`, in thousandths). GEAR and METAECHO have no answer in
 *  the runner model: they let the path through (one console.warn per type). */
export function meets(ch: Sr6Character, data: Sr6Data, cr: CreationRules, step: PathStep, bookKey = ''): boolean {
  const held = (id: string) => ch.build.qualities.some(q => q.id === id)
  let magic: boolean | undefined
  for (const x of step.requires)
    for (const m of x.matchAll(/<(?:data|value)req\s[^>]*>/g)) {
      const tag = m[0],
        type = attr(tag, 'type') ?? '',
        ref = attr(tag, 'ref') ?? '',
        id = qualityIdOf(data, `quality:${ref}`, bookKey)
      if (type === 'QUALITY') {
        if (id && held(id) === /negate="true"/.test(tag)) return false
      } else if (type === 'MAGIC_RESO') magic = (magic ?? false) || ch.build.magic === MAGIC[ref] || (!MAGIC[ref] && !!id && held(id))
      else if (type === 'ATTRIBUTE' && ref === 'ESSENCE') {
        if (deriveSr6(data, cr, ch).essence * 1000 > Number(attr(tag, 'max') ?? Infinity)) return false
      } else if (!warned.has(type)) {
        warned.add(type)
        console.warn(`[quality path] requirement type ${type} is not checked`)
      }
    }
  return magic !== false
}

export const stepOf = (path: QualityPath, id: string) => path.steps.find(s => s.id === id)
export const progressOf = (ch: Sr6Character, path: QualityPath) => ch.pathProgress?.find(p => p.pathId === path.id)

/** The source id (catalog sources, importer recipes) of each Commlink6 book that has paths. */
export const PATH_SOURCE: Record<string, string> = {
  companion: 'SWC',
  dealers_of_death: 'DOD',
  deus_ex_arcana: 'DEA',
  firing_squad: 'FS',
  hack_slash: 'HS',
  shadow_cast: 'SHC',
}

/** The paths the runner may add (its book is imported and it meets the first step's requirements) or is already on. */
export const pathsFor = (ch: Sr6Character, data: Sr6Data, cr: CreationRules, paths: QualityPath[]) =>
  paths.filter(
    p =>
      progressOf(ch, p) ||
      ((!PATH_SOURCE[p.bookKey] || (data.hasSource?.(PATH_SOURCE[p.bookKey]) ?? true)) && p.steps[0] && meets(ch, data, cr, p.steps[0], p.bookKey)),
  )

/** One mod of a step, applied (or, `undo`, reversed) on the runner's build: an add/remove of a quality, or a choice of
 *  type QUALITY (the picked quality is added; the step's `quality:CHOICE` placeholder is that one). The sentence when
 *  it was skipped. */
function applyMod(ch: Sr6Character, path: QualityPath, step: PathStep, m: PathModification, data: Sr6Data, cr: CreationRules, undo: boolean): string | null {
  let op: 'add' | 'remove', ref: string
  if (m.op === 'add' || m.op === 'remove') [op, ref] = [m.op, m.ref]
  else if (m.op === 'choice' && m.type === 'QUALITY') {
    const pick = progressOf(ch, path)?.choicesByStepId[step.id]?.optionRef
    if (!pick) return null
    ;[op, ref] = ['add', `quality:${pick}`]
  } else return null
  if (ref === 'quality:CHOICE') return null
  const grant = (op === 'add') !== undo
  const id = qualityIdOf(data, ref, path.bookKey, path)
  const skip = (why: string) => {
    const s = `${grant ? 'Add' : 'Remove'} ${ref} (${step.name}): ${why}`
    console.warn(`[quality path ${path.id}] ${s}`)
    return s
  }
  if (!id) return skip('not in the catalog')
  const row = ch.build.qualities.find(q => q.id === id && !q.free)
  if (grant ? row : !row) return null // already so
  const r = apply(ch.build, grant ? { op: 'quality', id } : { op: 'quality', remove: row!.uid }, data, cr)
  return r.ok ? null : skip(`refused (${String(r.reason)})`)
}

/** Apply (or, `undo`, reverse) a step's mods on the runner's build; the sentences of those skipped. */
const applyMods = (ch: Sr6Character, path: QualityPath, step: PathStep, data: Sr6Data, cr: CreationRules, undo: boolean) =>
  step.modifications.flatMap(m => applyMod(ch, path, step, m, data, cr, undo) ?? [])

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

/** Record the pick for a step's choice ('' as the option clears it). A QUALITY choice takes the quality it names off
 *  (the old pick) and adds the new one; the sentences of what was skipped. */
export function chooseAt(
  ch: Sr6Character,
  path: QualityPath,
  stepId: string,
  optionRef: string,
  subOptionRef: string | undefined,
  data: Sr6Data,
  cr: CreationRules,
): string[] {
  const p = progressOf(ch, path),
    step = stepOf(path, stepId)
  if (!p || !step) return []
  const picks = step.modifications.filter(m => m.op === 'choice' && m.type === 'QUALITY')
  const each = (undo: boolean) => picks.flatMap(m => applyMod(ch, path, step, m, data, cr, undo) ?? [])
  each(true)
  if (!optionRef) delete p.choicesByStepId[stepId]
  else p.choicesByStepId[stepId] = subOptionRef ? { optionRef, subOptionRef } : { optionRef }
  return each(false)
}
