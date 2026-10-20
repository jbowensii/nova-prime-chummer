// Brand scan: finds the old app names ("Chummer Anarchy ...", "Chummer SR6", chummer-anarchy2) in current source and docs.
// The app is "Nova Prime Chummer"; "Anarchy" is a GAME name and stays (so "Nova Prime Chummer Anarchy 2.0" = app + game is fine).
// A hit is either a KEPT id (stored data or other tools depend on it; each rule says why) or VISIBLE (must be 0).
// Usage: node tools/brand-scan.mjs [--kept]   (exit 1 when any visible hit remains; --kept lists the kept hits)
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(import.meta.url), '..', '..')
const ROOTS = ['src', 'server', 'index.html', 'public', 'README.md', 'docs', 'e2e', 'tests', 'importer', 'unraid']
// ponytail: history is not rewritten: reviews, dated plans/specs and public/data (data packs, schemas) are skipped
const SKIP = ['public/data', 'docs/reviews', 'docs/superpowers', 'node_modules', 'importer/.venv']
const TEXT = /\.(mjs|js|ts|tsx|css|html|md|xml|json|py|txt|xsd|yml|yaml)$/i

// the token around each old name: "chummer-anarchy2-export", "urn:chummer-anarchy2:data:1", "Chummer Anarchy" ...
const OLD = /[\w:./@-]*(?:(?<!Nova Prime )Chummer[ -]Anarchy|chummer-anarchy2|Chummer SR6)[\w:./-]*/gi
const KEPT = [
  [/^urn:chummer-anarchy2/i, 'XML namespace / schema id: saved characters, data files and schemas carry it'],
  [/chummer-anarchy2-export/i, 'export file-format id: the Foundry importer checks it'],
  [/chummer-anarchy2-importer/i, 'Foundry module id: installed worlds depend on it'],
  [/chummer-anarchy2-foundry|jbowensii\/chummer-anarchy2/i, 'GitHub repo name of the separate Foundry module'],
  [/chummer-anarchy2/i, 'old Docker image / container / appdata name, named only in the rename migration steps'],
]
const files = []
const walk = p => {
  const rel = relative(root, p).split(sep).join('/')
  if (SKIP.some(s => rel === s || rel.startsWith(s + '/'))) return
  if (statSync(p).isDirectory()) return readdirSync(p).forEach(n => walk(join(p, n)))
  if (TEXT.test(p)) files.push([rel, p])
}
for (const r of ROOTS)
  try {
    walk(join(root, r))
  } catch {
    /* a root that is absent */
  }

let visible = 0
const kept = new Map()
for (const [rel, p] of files) {
  readFileSync(p, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      for (const m of line.matchAll(OLD)) {
        const rule = KEPT.find(([re]) => re.test(m[0]))
        if (rule) kept.set(rule[1], (kept.get(rule[1]) ?? 0) + 1)
        else {
          visible++
          console.log(`VISIBLE ${rel}:${i + 1}: ${line.trim().slice(0, 160)}`)
        }
      }
    })
}
if (process.argv.includes('--kept')) for (const [why, n] of kept) console.log(`kept x${n}: ${why}`)
console.log(`old app names visible: ${visible}`)
process.exitCode = visible ? 1 : 0
