// Shared SR6 engine test data, all made up: the fixture catalog (tests/fixtures/sr6/custom) read from disk, its creation
// rules, and made(): an Sr6Data + CreationRules pair the engine tests change per case (the stand-in for SR6 Forge's
// chargen-data.json and creation-rules.json).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseCreation, type CreationRules, type CreationValue } from '../../src/sr6/engine/creation'
import { sr6Data, type Sr6Data } from '../../src/sr6/engine/data'
import { buildSr6Catalog, collectSr6Files } from '../../src/sr6/engine/load'
import type { Sr6Catalog } from '../../src/sr6/model/types'
import { blankBuild, PRIORITY_COLUMNS, type Letter, type MagicKind, type Sr6Build, type Sr6Method } from '../../src/sr6/model/character'

export const FIXTURE = 'tests/fixtures/sr6/custom'
const get = async (path: string) => {
  const file = path.startsWith('data/') ? join('public', path) : path.startsWith('custom/sr6/') ? join(FIXTURE, path.slice(11)) : null
  try { return file ? readFileSync(file, 'utf8') : null } catch { return null }
}
const FILES = (await collectSr6Files(get)).files
const CREATION = readFileSync(join(FIXTURE, 'creation.xml'), 'utf8')

/** A fresh catalog built from the fixture files. `patch` rewrites a file's text first (file path → new text). */
export function fixtureCatalog(patch: (file: string, xml: string) => string = (_, x) => x): Sr6Catalog {
  return buildSr6Catalog(FILES.map(f => ({ ...f, xml: patch(f.file, f.xml) })))
}
export const fixtureCreation = (): CreationRules => parseCreation(CREATION).rules

/** The fixture's Sr6Data and creation rules, fresh each call. rules: settings to set (or replace); unset: keys to drop;
 *  data: a change to the catalog view. */
export function made(over: { rules?: Record<string, CreationValue>; unset?: string[]; data?: (d: Sr6Data) => void } = {}): { data: Sr6Data; cr: CreationRules } {
  const data = sr6Data(fixtureCatalog()), cr = fixtureCreation()
  for (const [key, value] of Object.entries(over.rules ?? {})) cr.set(key, { key, value })
  for (const key of over.unset ?? []) cr.delete(key)
  over.data?.(data)
  return { data, cr }
}

export const GLIM = 'crb.glimmerkin', STONE = 'crb.stonefolk'
/** A blank build of `method`; letters: the five priority letters in PRIORITY_COLUMNS order (metatype, attributes, magic,
 *  skills, resources), e.g. 'CABDE'. */
export function buildOf(method: Sr6Method, o: { letters?: string; metatype?: string; magic?: MagicKind } = {}): Sr6Build {
  const b = blankBuild(method)
  if (o.letters) PRIORITY_COLUMNS.forEach((col, i) => { b.priorities[col] = o.letters![i] as Letter })
  b.metatype = o.metatype ?? ''
  b.magic = o.magic ?? 'mundane'
  return b
}
