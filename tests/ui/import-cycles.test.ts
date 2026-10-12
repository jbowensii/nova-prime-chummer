// No import cycle in src, type imports included (as `npx madge --circular --extensions ts,tsx src` reports them): every
// import or re-export of a src module counts, `import type` and `export type` too. Shared types live in leaf modules
// (src/model/types.ts, src/sr6/model/*, src/sr6/engine/types.ts, src/ui/types.ts) so the modules using them don't loop.
// @vitest-environment node
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import ts from 'typescript'
import { expect, test } from 'vitest'

const SRC = resolve(__dirname, '../../src')
const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap(d =>
    d.isDirectory() ? files(join(dir, d.name)) : /\.tsx?$/.test(d.name) && !d.name.endsWith('.d.ts') ? [join(dir, d.name)] : [],
  )
const target = (from: string, spec: string) =>
  spec.startsWith('.')
    ? ['', '.ts', '.tsx', '/index.ts', '/index.tsx'].map(x => resolve(dirname(from), spec) + x).find(p => /\.tsx?$/.test(p) && existsSync(p))
    : undefined

function imports(file: string): string[] {
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, false)
  return sf.statements.flatMap(s => {
    const spec =
      (ts.isImportDeclaration(s) || ts.isExportDeclaration(s)) && s.moduleSpecifier && ts.isStringLiteral(s.moduleSpecifier)
        ? s.moduleSpecifier.text
        : undefined
    const to = spec ? target(file, spec) : undefined
    return to ? [to] : []
  })
}

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
