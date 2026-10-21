// The src import graph, shared by the import tests: every .ts/.tsx under src, and what each imports or re-exports (relative imports of asset files too).
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import ts from 'typescript'

export const SRC = resolve(__dirname, '../../../src')
export const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap(d =>
    d.isDirectory() ? files(join(dir, d.name)) : /\.tsx?$/.test(d.name) && !d.name.endsWith('.d.ts') ? [join(dir, d.name)] : [],
  )
// A relative import resolves to a .ts/.tsx module, else to the file itself when it exists (css, json, svg, ...): assets
// are in the graph too, so the boundary test sees a stylesheet one game takes from the other.
const target = (from: string, spec: string) => {
  if (!spec.startsWith('.')) return undefined
  const base = resolve(dirname(from), spec.replace(/[?#].*$/, ''))
  const isFile = (p: string) => existsSync(p) && statSync(p).isFile()
  return ['', '.ts', '.tsx', '/index.ts', '/index.tsx'].map(x => base + x).find(p => /\.tsx?$/.test(p) && isFile(p)) ?? (isFile(base) ? base : undefined)
}

export function imports(file: string): string[] {
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
