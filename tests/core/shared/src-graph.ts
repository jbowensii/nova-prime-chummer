// The src import graph, shared by the import tests: every .ts/.tsx under src, and what each imports or re-exports.
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import ts from 'typescript'

export const SRC = resolve(__dirname, '../../../src')
export const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap(d =>
    d.isDirectory() ? files(join(dir, d.name)) : /\.tsx?$/.test(d.name) && !d.name.endsWith('.d.ts') ? [join(dir, d.name)] : [],
  )
const target = (from: string, spec: string) =>
  spec.startsWith('.')
    ? ['', '.ts', '.tsx', '/index.ts', '/index.tsx'].map(x => resolve(dirname(from), spec) + x).find(p => /\.tsx?$/.test(p) && existsSync(p))
    : undefined

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
