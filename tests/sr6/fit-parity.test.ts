// The importer prices a book's sample runners to fit their priorities (importer/sr6/fit.py, archetypes.py); the app prices
// the runner it writes (budgets.ts). Invented runners (importer/tests/sr6_parity.py: rated items, a formula price, a
// grade, a unit price, a troll's size pricing, karma turned into nuyen, In Debt, a mystic adept's spells) built by the real
// importer must cost the same here: nuyen spent and left, Karma left, no power points past those bought. Skipped when no
// Python with the importer's requirements is found.
import { spawnSync } from 'node:child_process'
import { describe, expect, test } from 'vitest'
import { xmlToSr6 } from '../../src/sr6/engine/charxml'
import { applyDeps, LEVELS, levelRules, RULE_DEPS, runnerRules, SETS, type CreationValue } from '../../src/sr6/engine/creation'
import { karmaBudget, nuyenBudget } from '../../src/sr6/engine/budgets'
import { powerPoints } from '../../src/sr6/engine/magic'
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
    resolved: Record<string, CreationValue>
  }[]
  deps: { requires: Record<string, string[]>; levelKeys: string[]; levels: unknown; sets: unknown }
}
const value = (v: string): CreationValue => (v === 'true' ? true : v === 'false' ? false : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v)

describe.skipIf(!python)('the importer prices a sample runner as the app does', () => {
  const [cmd, ...pre] = python ?? ['']
  const run = python ? spawnSync(cmd, [...pre, '-m', 'importer.tests.sr6_parity'], { encoding: 'utf8', maxBuffer: 1 << 26 }) : null
  const out: Out =
    run?.status === 0 ? JSON.parse(run.stdout) : { patch: ['', ''], files: [], runners: [], deps: { requires: {}, levelKeys: [], levels: [], sets: [] } }

  test('the generator runs', () => expect(run?.status, run?.stderr).toBe(0))
  // fit.resolve applies the settings as runnerRules does (applyDeps, levelRules): the same tables
  test("fit.py's nested rules, levels of play and house-rule numbers are creation.ts's", () => {
    const requires = Object.fromEntries(Object.entries(RULE_DEPS).flatMap(([k, d]) => (d.requires ? [[k, d.requires]] : [])))
    expect(out.deps.requires).toEqual(requires)
    const conflicts = Object.fromEntries(Object.entries(RULE_DEPS).flatMap(([k, d]) => (d.conflicts ? [[k, d.conflicts]] : [])))
    expect(Object.fromEntries(out.deps.levelKeys.map((k, i) => [k, out.deps.levelKeys.slice(i + 1)]).filter(([, c]) => c.length))).toEqual(conflicts)
    expect(out.deps.levels).toEqual(LEVELS)
    expect(out.deps.sets).toEqual(SETS)
  })
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
      // the importer fitted with the settings as the app applies them
      expect(r.resolved).toEqual(Object.fromEntries([...levelRules(applyDeps(table))].map(([k, s]) => [k, s.value])))
      const cr = runnerRules(table, ch.rules) // (as the app reads a runner's rules: its own over the table's)
      const p = makeProvider(b.method, data, cr)
      expect(p.lettersValid(b.priorities)).toBe(true) // (the letters a level of play allows)
      const nuyen = nuyenBudget(b, data, cr, p),
        karma = karmaBudget(b, data, cr, p)
      expect({ nuyen: nuyen.spent, nuyenLeft: nuyen.left, karmaLeft: karma.left, karmaToNuyen: b.karmaToNuyen }).toEqual({
        nuyen: r.py!.nuyen,
        nuyenLeft: r.py!.nuyenLeft,
        karmaLeft: r.py!.karmaLeft,
        karmaToNuyen: r.py!.karmaToNuyen,
      })
      expect(powerPoints(b, data, cr, p).left).toBeGreaterThanOrEqual(0) // (a mystic adept's powers: the points it bought)
    })
})
