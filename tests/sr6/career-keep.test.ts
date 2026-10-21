// CAREER_KEEP (src/sr6/engine/rules.ts) names validateSr6 codes by string: renaming a code there fails this, not silently
// drops the violation from a finalized runner's Review.
// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { CAREER_KEEP } from '../../src/sr6/engine/rules'

const DIR = 'src/sr6/engine'
const src = readdirSync(DIR)
  .filter(f => f.endsWith('.ts'))
  .map(f => readFileSync(join(DIR, f), 'utf8'))
  .join('\n')
  .replace(/export const CAREER_KEEP = new Set\(\[[^\]]*\]\)/, '')

test('every code career keeps is still emitted by the engine', () => {
  const gone = [...CAREER_KEEP].filter(code => !new RegExp(`(code: |= )'${code.replace('.', '\\.')}'`).test(src))
  expect(gone).toEqual([])
})
