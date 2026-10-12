// The importer prices a book's sample runners to fit their priorities (importer/sr6/fit.py, archetypes.py); the app prices
// the runner it writes (budgets.ts). Invented runners (importer/tests/sr6_parity.py: rated items, a formula price, a
// grade, a unit price, a troll's size pricing, karma turned into nuyen, In Debt) built by the real importer must cost the
// same here: nuyen spent and left, Karma left. Skipped when no Python with the importer's requirements is found.
import { spawnSync } from 'node:child_process'
import { describe, expect, test } from 'vitest'
import { xmlToSr6 } from '../../src/sr6/engine/charxml'
import { runnerRules, type CreationValue } from '../../src/sr6/engine/creation'
import { karmaBudget, nuyenBudget } from '../../src/sr6/engine/budgets'
import { sr6Data } from '../../src/sr6/engine/data'
import { makeProvider } from '../../src/sr6/engine/providers'
import { fixtureCatalog, fixtureCreation } from './fixture'
// @ts-expect-error plain JS module
import { findPython } from '../../tools/python.mjs'

const python: string[] | null = findPython()
type Out = {
  patch: [string, string]
  files: { file: string; xml: string }[]
  runners: {
    name: string
    settings: Record<string, string>
    xml: string
    unmatched: string[]
    py: { nuyen: number; karmaLeft: number; nuyenLeft: number; karmaToNuyen: number } | null
  }[]
}
const value = (v: string): CreationValue => (v === 'true' ? true : v === 'false' ? false : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v)

describe.skipIf(!python)('the importer prices a sample runner as the app does', () => {
  const [cmd, ...pre] = python ?? ['']
  const run = python ? spawnSync(cmd, [...pre, '-m', 'importer.tests.sr6_parity'], { encoding: 'utf8', maxBuffer: 1 << 26 }) : null
  const out: Out = run?.status === 0 ? JSON.parse(run.stdout) : { patch: ['', ''], files: [], runners: [] }

  test('the generator runs', () => expect(run?.status, run?.stderr).toBe(0))
  const data = sr6Data(fixtureCatalog((_, x) => x.replaceAll(...out.patch), out.files))

  for (const r of out.runners)
    test(r.name, () => {
      expect(r.unmatched).toEqual([]) // (every printed thing found: a missing one would price nothing on both sides)
      expect(r.py).not.toBeNull()
      const parsed = xmlToSr6(r.xml)
      if (!parsed.ok) throw new Error(parsed.reason)
      const ch = parsed.character,
        b = ch.build,
        table = fixtureCreation()
      for (const [key, v] of Object.entries(r.settings)) table.set(key, { key, value: value(v) })
      const cr = runnerRules(table, ch.rules) // (as the app reads a runner's rules: its own over the table's)
      const p = makeProvider(b.method, data, cr)
      const nuyen = nuyenBudget(b, data, cr, p),
        karma = karmaBudget(b, data, cr, p)
      expect({ nuyen: nuyen.spent, nuyenLeft: nuyen.left, karmaLeft: karma.left, karmaToNuyen: b.karmaToNuyen }).toEqual({
        nuyen: r.py!.nuyen,
        nuyenLeft: r.py!.nuyenLeft,
        karmaLeft: r.py!.karmaLeft,
        karmaToNuyen: r.py!.karmaToNuyen,
      })
    })
})
