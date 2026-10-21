// No import cycle in src, type imports included (as `npx madge --circular --extensions ts,tsx src` reports them): every
// import or re-export of a src module counts, `import type` and `export type` too. Shared types live in the model and types modules
// (src/model/types.ts, src/sr6/model/*, src/sr6/engine/types.ts, src/core/ui-kit/types.ts) so the modules using them don't loop.
// @vitest-environment node
import { join, relative } from 'node:path'
import { expect, test } from 'vitest'
import { SRC, files, imports } from './src-graph'

/** Each cycle once, as the modules on it (depth-first: a module back on the current path closes one). */
function cycles(graph: Map<string, string[]>): string[][] {
  const out: string[][] = [],
    done = new Set<string>(),
    path: string[] = []
  const visit = (m: string) => {
    if (path.includes(m)) return void out.push(path.slice(path.indexOf(m)))
    if (done.has(m)) return
    path.push(m)
    for (const n of graph.get(m) ?? []) visit(n)
    path.pop()
    done.add(m)
  }
  for (const m of graph.keys()) visit(m)
  return out
}

test('the cycle finder finds one', () => {
  expect(
    cycles(
      new Map([
        ['a', ['b']],
        ['b', ['c']],
        ['c', ['a']],
        ['d', ['a']],
      ]),
    ),
  ).toEqual([['a', 'b', 'c']])
})

test('src has no import cycle, type imports included', () => {
  const graph = new Map(files(SRC).map(f => [f, imports(f)]))
  expect(cycles(graph).map(c => c.map(f => relative(SRC, f).replaceAll('\\', '/')).join(' > '))).toEqual([])
})

test('the engines and models import nothing from a UI folder', () => {
  const layer = ['engine', 'model', 'sr6/engine', 'sr6/model'].flatMap(d => files(join(SRC, d)))
  const ui = (f: string) => /^(ui|sr6\/ui|core\/(ui-kit|chrome|app))\//.test(relative(SRC, f).replaceAll('\\', '/'))
  expect(
    layer.flatMap(f =>
      imports(f)
        .filter(ui)
        .map(t => `${relative(SRC, f)} > ${relative(SRC, t)}`.replaceAll('\\', '/')),
    ),
  ).toEqual([])
})

test('Shadowrun 6 imports nothing from Anarchy’s engine: what both games use lives in src/core/shared', () => {
  const at = (f: string) => relative(SRC, f).replaceAll('\\', '/')
  expect(
    files(join(SRC, 'sr6')).flatMap(f =>
      imports(f)
        .filter(t => at(t).startsWith('engine/'))
        .map(t => `${at(f)} > ${at(t)}`),
    ),
  ).toEqual([])
})
