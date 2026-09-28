import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { buildCatalog, type SourceFile } from '../src/engine/load'
import type { Catalog, Character } from '../src/model/types'

const dir = (d: string, overlay: boolean): SourceFile[] => readdirSync(d).filter(f => f.endsWith('.xml'))
  .map(f => ({ file: overlay ? `custom/${f}` : f, xml: readFileSync(join(d, f), 'utf8'), overlay }))

/** The catalogs that will be removed once real book imports exist (task 12): not part of `cat`. */
export const BOOK_CATALOG_FILES = ['amps.xml', 'spells.xml', 'complexforms.xml', 'gear.xml', 'rules.xml']

/** Every shipped data file, unfiltered (used to exercise buildCatalog itself, and by tests that
 * still want the real book catalogs while they exist in public/data). */
export const base: SourceFile[] = dir('public/data', false)

/** The made-up test catalog (tests/fixtures/mini), as an overlay for buildCatalog. */
export const mini: SourceFile[] = dir('tests/fixtures/mini', true)

/** The engine catalog: shipped mechanics (levels, skills, pricing, amp types/effects, weapons,
 * armor, lifestyles, sources...) plus the made-up test catalog. Never the book catalogs, so
 * engine tests keep working after they're removed. */
export const cat: Catalog = buildCatalog([...base.filter(f => !BOOK_CATALOG_FILES.includes(f.file)), ...mini])

/** Where the owner's private book imports live: BOOKS_DIR, else the oracle captured by /task-1
 * before public/data's book catalogs are touched. Same flat layout as public/data + a samples/ dir. */
export const BOOKS_DIR = process.env.BOOKS_DIR ?? '.extract/private/oracle'

const loadBooks = (): Catalog | null => {
  if (!BOOK_CATALOG_FILES.every(f => existsSync(join(BOOKS_DIR, f)))) return null
  const bookFiles = BOOK_CATALOG_FILES.map(f => ({ file: f, xml: readFileSync(join(BOOKS_DIR, f), 'utf8'), overlay: false }))
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
