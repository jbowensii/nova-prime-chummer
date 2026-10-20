// The module boundaries of docs/architecture/README.md, checked on today's file layout: each src file belongs to the module
// docs/architecture/module-map.tsv gives it. Rules: (1) the games (ca2, sr6) never import each other; (2) core and features
// may import only a game's `formats` module (core/app also its `shell`); (3) a module imports only modules ranked strictly below it (or itself).
// Today's violations are listed in module-boundaries.allow.json ("from > to", src-relative). The list may only shrink: a new
// violation fails, and so does an entry that no longer violates. Refactors delete entries; `UPDATE_ALLOW=1 npx vitest run
// tests/ui/module-boundaries.test.ts` rewrites the file after a refactor (review the diff: it must only lose lines).
// @vitest-environment node
import { readFileSync, writeFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { expect, test } from 'vitest'
import { SRC, files, imports } from './src-graph'

const ROOT = resolve(SRC, '..')
const ALLOW = resolve(__dirname, 'module-boundaries.allow.json')

const RANK: Record<string, number> = {
  'core/shared': 0,
  'ca2/formats': 1,
  'sr6/formats': 1,
  'ca2/catalog': 2,
  'sr6/catalog': 2,
  'core/ui-kit': 3,
  'core/chrome': 5,
  ...Object.fromEntries(['accounts', 'runner-store', 'backup', 'catalog-edits', 'book-library'].map(m => [`features/${m}`, 6])),
  'features/ai-assist': 7,
  'features/appearance': 7,
  'features/campaigns': 8,
  'features/catalog-browser': 8,
  'features/compendiums': 9,
  'features/foundry-kit': 9,
  'sr6/table-setup': 9,
  'ca2/table-rules': 9,
  'sr6/runner-builder': 10,
  'ca2/runner-builder': 10,
  ...Object.fromEntries(['foundry', 'print', 'designer'].flatMap(m => [`ca2/${m}`, `sr6/${m}`]).map(m => [m, 11])),
  'ca2/game-data': 12,
  'sr6/game-data': 12,
  ...Object.fromEntries(['compendiums', 'runner-library', 'book-import'].flatMap(m => [`ca2/${m}`, `sr6/${m}`]).map(m => [m, 13])),
  'ca2/npcs': 14,
  'sr6/npcs': 14,
  'ca2/shell': 15,
  'sr6/shell': 15,
  'core/app': 20,
}

const at = (f: string) => relative(ROOT, f).replaceAll('\\', '/')
const MODULE = new Map(
  readFileSync(resolve(ROOT, 'docs/architecture/module-map.tsv'), 'utf8')
    .split(/\r?\n/)
    .slice(1)
    .filter(Boolean)
    .map(l => l.split('\t') as [string, string]),
)
const game = (m: string) => (/^(ca2|sr6)\//.test(m) ? m.slice(0, 3) : '')

/** Why `from` module may not import `to` module, or '' if it may. */
function why(from: string, to: string): string {
  if (from === to) return ''
  if (game(from) && game(to) && game(from) !== game(to)) return 'games never import each other'
  if (!game(from) && game(to) && !to.endsWith('/formats') && !(from === 'core/app' && to.endsWith('/shell')))
    return 'core and features may import only a game’s formats'
  return RANK[from] > RANK[to] ? '' : `${from} (${RANK[from]}) may not import ${to} (${RANK[to]}): imports go down the ranks`
}

const srcFiles = files(SRC)
const violations = srcFiles
  .flatMap(f => imports(f).map(t => [f, t] as const))
  .filter(([f, t]) => why(MODULE.get(at(f))!, MODULE.get(at(t))!))
  .map(([f, t]) => `${at(f).slice(4)} > ${at(t).slice(4)}`)
  .sort()

test('every src file is in the module map, and every module has a rank', () => {
  expect(srcFiles.map(at).filter(f => !MODULE.has(f))).toEqual([])
  expect([...new Set(srcFiles.map(f => MODULE.get(at(f))!))].filter(m => RANK[m] === undefined)).toEqual([])
})

test('module boundary violations only shrink (module-boundaries.allow.json)', () => {
  if (process.env.UPDATE_ALLOW) writeFileSync(ALLOW, JSON.stringify(violations, null, 2) + '\n')
  const allowed: string[] = JSON.parse(readFileSync(ALLOW, 'utf8'))
  expect({ newViolations: violations.filter(v => !allowed.includes(v)) }).toEqual({ newViolations: [] })
  expect({ fixedButStillListed: allowed.filter(a => !violations.includes(a)) }).toEqual({ fixedButStillListed: [] })
})
