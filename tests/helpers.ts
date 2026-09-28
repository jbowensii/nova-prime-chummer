import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { buildCatalog, collectFiles, type SourceFile } from '../src/engine/load'
import type { Catalog, Character } from '../src/model/types'

const dir = (d: string, overlay: boolean): SourceFile[] => readdirSync(d).filter(f => f.endsWith('.xml'))
  .map(f => ({ file: overlay ? `custom/${f}` : f, xml: readFileSync(join(d, f), 'utf8'), overlay }))

/** The catalogs that will be removed once real book imports exist (task 12): not part of `cat`. */
export const BOOK_CATALOG_FILES = ['amps.xml', 'spells.xml', 'complexforms.xml', 'gear.xml', 'rules.xml']

/** Every shipped data file, unfiltered (used to exercise buildCatalog itself, and by tests that
 * still want the real book catalogs while they exist in public/data). */
export const base: SourceFile[] = dir('public/data', false)

/** Every file loadCatalog would load from public/data (book catalogs left out) and a custom root laid out
 * as the app's custom/ folder (imported/index.xml, imported/sources.xml, sources.xml, texts/, index.xml),
 * in the same order. Missing data files are the removed book catalogs; a listed file missing is an error. */
export async function loadDir(customRoot: string): Promise<SourceFile[]> {
  const read = (p: string) => existsSync(p) ? readFileSync(p, 'utf8') : null
  const { files, missing } = await collectFiles(async path => path.startsWith('data/')
    ? (BOOK_CATALOG_FILES.includes(path.slice(5)) ? null : read(join('public', path)))
    : read(join(customRoot, path.replace(/^custom\//, ''))))
  const bad = missing.filter(m => m.startsWith('custom/'))
  if (bad.length) throw new Error(`${customRoot}: listed but missing: ${bad.join(', ')}`)
  return files
}

/** The made-up test catalog (tests/fixtures/mini/custom), laid out as imported books with scoped ids. */
export const MINI = 'tests/fixtures/mini/custom'

/** The engine catalog: shipped mechanics (levels, skills, pricing, amp types/effects, weapons,
 * armor, lifestyles, sources...) plus the made-up imported books. Never the book catalogs, so
 * engine tests keep working after they're removed. */
export const catFiles: SourceFile[] = await loadDir(MINI)
export const cat: Catalog = buildCatalog(catFiles)

/** Where the owner's private book imports live: BOOKS_DIR, else the oracle captured by /task-1
 * before public/data's book catalogs are touched. Same flat layout as public/data + a samples/ dir. */
export const BOOKS_DIR = process.env.BOOKS_DIR ?? '.extract/private/oracle'

const loadBooks = (): Catalog | null => {
  if (!BOOK_CATALOG_FILES.every(f => existsSync(join(BOOKS_DIR, f)))) return null
  const bookFiles = BOOK_CATALOG_FILES.map(f => ({ file: f, xml: readFileSync(join(BOOKS_DIR, f), 'utf8'), overlay: false }))
  // the books' spec additions (DHSA's), appended to the shipped skills as an import is
  const skills = join(BOOKS_DIR, 'skills.xml')
  if (existsSync(skills)) bookFiles.push({ file: 'custom/imported/books/skills.xml', xml: readFileSync(skills, 'utf8'), overlay: true })
  const textsDir = 'public/custom/texts'
  const texts = existsSync(textsDir) ? dir(textsDir, true) : []
  return buildCatalog([...base.filter(f => !BOOK_CATALOG_FILES.includes(f.file)), ...bookFiles, ...texts])
}

/** Full catalog (shipped mechanics + real book content) from the owner's private imports; null in CI
 * and for anyone without their own books. See tests/books/_gate.ts. */
export const books: Catalog | null = loadBooks()

export const sample = (name: string): Character => JSON.parse(readFileSync(join(BOOKS_DIR, 'samples', `${name}.ca2.json`), 'utf8'))

/** Path under the oracle root for any other private book file a books-only test needs
 * (e.g. pregens-printed.json, book-discrepancies.md) — never the committed copy. */
export const bookFile = (name: string): string => join(BOOKS_DIR, name)
