// Every module folder (src/{core,features,ca2,sr6}/<module>) has a CLAUDE.md, and the public names it lists still exist as
// exports in that module (docs/architecture/README.md, step 5). Cheap regex check: a name counts if some file in the module
// declares it with `export <kind> name` or lists it in an `export { ... }`.
// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { SRC, files } from './src-graph'

const modules = ['core', 'features', 'ca2', 'sr6'].flatMap(area =>
  readdirSync(join(SRC, area), { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => `${area}/${d.name}`),
)

test('every tests/ or e2e/ path a CLAUDE.md "Test:" bullet names exists', () => {
  const root = join(SRC, '..')
  const docs = [...modules.map(m => join(SRC, m)), ...['importer', 'importer/sr6', 'tools/cl6check'].map(d => join(root, d))].map(d => join(d, 'CLAUDE.md'))
  const missing: string[] = []
  for (const doc of docs.filter(existsSync)) {
    // the bullet runs to the next bullet or blank line
    const bullet = /^- \*\*Test[^\n]*(?:\n(?!- |\n)[^\n]*)*/m.exec(readFileSync(doc, 'utf8'))?.[0] ?? ''
    for (const [, p] of bullet.matchAll(/(?<=[\s`])((?:tests|e2e)\/[\w./-]*[\w-])\/?(?=[\s`;,)]|$)/g))
      if (!existsSync(join(root, p))) missing.push(`${doc.slice(root.length + 1).replaceAll('\\', '/')}: ${p}`)
  }
  expect(missing).toEqual([])
})

test('every module folder has a CLAUDE.md', () => {
  expect(modules.filter(m => !existsSync(join(SRC, m, 'CLAUDE.md')))).toEqual([])
})

test("every public name a module's CLAUDE.md lists is still exported", () => {
  const missing: string[] = []
  for (const m of modules) {
    const doc = join(SRC, m, 'CLAUDE.md')
    if (!existsSync(doc)) continue
    const line =
      readFileSync(doc, 'utf8')
        .split('\n')
        .find(l => l.startsWith('- **Public interface**')) ?? ''
    // identifiers only: module names (a/b) and file names (a.tsx) in the same line do not match
    const names = [...line.matchAll(/`([A-Za-z_$][\w$]*)`/g)].map(x => x[1])
    const text = files(join(SRC, m))
      .map(f => readFileSync(f, 'utf8'))
      .join('\n')
    for (const n of names) {
      const declared = new RegExp(
        `export\\s+(?:declare\\s+)?(?:default\\s+)?(?:async\\s+)?(?:function\\*?|const|let|class|type|interface|enum)\\s+${n.replace(/\$/g, '\\$')}\\b`,
      )
      const listed = new RegExp(`export\\s+(?:type\\s+)?\\{[^}]*\\b${n.replace(/\$/g, '\\$')}\\b[^}]*\\}`)
      if (!declared.test(text) && !listed.test(text)) missing.push(`${m}: ${n}`)
    }
  }
  expect(missing).toEqual([])
})
