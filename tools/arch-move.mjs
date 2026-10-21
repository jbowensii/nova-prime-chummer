// Moves src files into the module folders of docs/architecture/README.md ("Target layout"), one batch of modules at a
// time, with `git mv` (history follows). Re-runnable: a file already at its target is left alone.
// Usage: node tools/arch-move.mjs --only core/ [--except sr6/runner-builder] [--dry-run]
// It moves each src file docs/architecture/module-map.tsv gives a module under the prefix, and that module's tests
// (tests/<folder>/*.ts, not tests/server or tests/fixtures) to tests/<module>/; then it rewrites every relative
// import/export/import() specifier that points at a moved file (or from one), and every exact repo path of a moved file
// in tracked text (comments, docs, CLAUDE files, the module map itself). CHANGELOG.md and docs/reviews/ are records of
// their day and keep the old paths; public/ is served data.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, writeFileSync } from 'node:fs'
import { dirname, posix, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Files that stay where they are whatever their module: the Vite entry (index.html loads /src/main.tsx). */
const STAY = new Set(['src/main.tsx'])

/** Where a file of `mod` belongs. `sub` is the map's optional 4th column (e.g. sr6/runner-builder's creation, review, career, assets). */
export function target(path, mod, sub = '', clash = false) {
  if (STAY.has(path) || /^core\/(platform|archive)$/.test(mod) || !/^(core|features|ca2|sr6)\//.test(mod)) return path
  const name = posix.basename(path)
  if (path.startsWith('src/')) {
    if (!/^(ca2|sr6)\//.test(mod)) return `src/${mod}/${name}`
    const layer = /\.(tsx|css)$/.test(path) || /\/ui\//.test(path) ? 'ui' : 'domain'
    return posix.join('src', mod, layer, sub || (/\/tabs\//.test(path) ? 'tabs' : ''), name)
  }
  if (path.startsWith(`tests/${mod}/`) || !/^tests\/(?!server\/|fixtures\/)[^/]+\/.*\.tsx?$/.test(path)) return path
  // two tests of one module with the same file name (tests/old/price.test.ts, tests/older/price.test.ts) keep their old folder name
  return clash ? `tests/${mod}/${path.split('/')[1]}/${name}` : `tests/${mod}/${name}`
}

/** Paths (tests only) whose file name another test of the same module shares. */
export function clashes(rows) {
  const seen = new Map()
  for (const [path, mod] of rows)
    if (/^tests\/(?!server\/|fixtures\/)[^/]+\/.*\.tsx?$/.test(path))
      seen.set(`${mod}/${posix.basename(path)}`, (seen.get(`${mod}/${posix.basename(path)}`) ?? 0) + 1)
  return new Set(rows.filter(([path, mod]) => seen.get(`${mod}/${posix.basename(path)}`) > 1).map(([path]) => path))
}

/** Is a file of module `mod` in this batch: under the `only` prefix, and not under the `except` prefix (if given). */
export const selected = (mod, only, except = '') => mod.startsWith(only) && !(except && mod.startsWith(except))

const SUFFIXES = ['', '.ts', '.tsx', '.d.ts', '/index.ts', '/index.tsx', '.mjs', '.js']

/** The specifier `file` should use for `spec` once `moves` (old -> new repo path) are done, or undefined if unchanged. */
export function respec(file, spec, moves, tracked) {
  const [bare, query = ''] = spec.split(/(?=\?)/)
  const base = posix.join(posix.dirname(file), bare)
  const suffix = SUFFIXES.find(s => tracked.has(base + s))
  if (suffix === undefined) return undefined
  const to = base + suffix
  if (!moves.has(file) && !moves.has(to)) return undefined
  const newTo = moves.get(to) ?? to
  let rel = posix.relative(posix.dirname(moves.get(file) ?? file), newTo.slice(0, newTo.length - suffix.length))
  if (!rel.startsWith('.')) rel = './' + rel
  return rel + query === spec ? undefined : rel + query
}

const SPEC = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.\.?\/[^'"\n]*)\2/g
const CODE = /\.(ts|tsx|mjs|js)$/
const KEEP_OLD = /^(CHANGELOG\.md|docs\/reviews\/|public\/)/
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function main() {
  const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const args = process.argv.slice(2)
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : ''
  const except = args.includes('--except') ? args[args.indexOf('--except') + 1] : ''
  const dry = args.includes('--dry-run')
  if (!only) throw new Error('usage: node tools/arch-move.mjs --only <module prefix, e.g. core/> [--except <prefix>] [--dry-run]')
  const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 })
  const tracked = new Set(git('ls-files', '-z').split('\0').filter(Boolean))
  const at = p => resolve(ROOT, p)

  const rows = readFileSync(at('docs/architecture/module-map.tsv'), 'utf8')
    .split(/\r?\n/)
    .slice(1)
    .filter(Boolean)
    .map(l => l.split('\t'))
  const moves = new Map()
  const clash = clashes(rows)
  for (const [path, mod, , sub] of rows) {
    if (!selected(mod, only, except) || !tracked.has(path)) continue
    const to = target(path, mod, sub, clash.has(path))
    if (to === path) continue
    if (tracked.has(to) || [...moves.values()].includes(to)) throw new Error(`${path} -> ${to}: the target is taken`)
    moves.set(path, to)
  }
  for (const [from, to] of moves) console.log(`${dry ? 'would move' : 'move'} ${from} -> ${to}`)
  if (!moves.size) return console.log(`nothing to move for ${only}: already in place`)

  const mention = new RegExp(
    `(?<![\\w./-])(${[...moves.keys()]
      .sort((a, b) => b.length - a.length)
      .map(esc)
      .join('|')})(?![\\w/-]|\\.\\w)`,
    'g',
  )
  let specs = 0,
    mentions = 0,
    touched = 0
  for (const file of tracked) {
    if (/^public\//.test(file) || !existsSync(at(file))) continue
    const text = readFileSync(at(file), 'utf8')
    if (text.includes('\0')) continue
    let out = CODE.test(file)
      ? text.replace(SPEC, (m, lead, q, spec) => {
          const s = respec(file, spec, moves, tracked)
          return s === undefined ? m : (specs++, lead + q + s + q)
        })
      : text
    if (!KEEP_OLD.test(file)) out = out.replace(mention, p => (mentions++, moves.get(p)))
    if (out !== text) {
      touched++
      if (!dry) writeFileSync(at(file), out)
    }
  }
  console.log(
    `${moves.size} files to move; ${specs} import specifiers and ${mentions} path mentions in ${touched} files rewritten${dry ? ' (dry run: nothing written)' : ''}`,
  )
  if (dry) return
  for (const [from, to] of moves) {
    mkdirSync(dirname(at(to)), { recursive: true })
    git('mv', from, to)
  }
  // the folders the moves emptied (rmdirSync refuses a folder that still holds anything)
  for (const d of new Set([...moves.keys()].map(p => posix.dirname(p)))) if (existsSync(at(d)) && !readdirSync(at(d)).length) rmdirSync(at(d))
  if (!rows.some(([p, m, , s]) => p.startsWith('src/') && !moves.has(p) && target(p, m, s, clash.has(p)) !== p))
    console.log('every src file is in its module folder: moduleOf in tests/core/shared/module-boundaries.test.ts may now read the folder')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
