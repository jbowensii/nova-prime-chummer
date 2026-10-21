import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { buildCatalog, collectFiles, CORE_FILES, type SourceFile } from '../src/ca2/catalog/domain/load'
import { migrate } from '../src/ca2/formats/domain/file'
import type { Catalog, Character } from '../src/ca2/formats/domain/types'

const dir = (d: string, overlay: boolean): SourceFile[] =>
  readdirSync(d)
    .filter(f => f.endsWith('.xml'))
    .map(f => ({ file: overlay ? `custom/${f}` : f, xml: readFileSync(join(d, f), 'utf8'), overlay }))

/** The book catalogs the app no longer ships (imports bring them), as the private oracle lays them out. */
export const BOOK_CATALOG_FILES = ['amps.xml', 'spells.xml', 'complexforms.xml', 'gear.xml', 'rules.xml']

/** The made-up test catalog (tests/fixtures/mini/custom): made-up core files (imported/core/) and imported books with
 * scoped ids. */
export const MINI = 'tests/fixtures/mini/custom'

/** The owner's local copies of the core files (public/data, gitignored): the answer key, present only on their machine. */
export const LOCAL_CORE = CORE_FILES.every(n => existsSync(`public/data/${n}.xml`))

/** The shipped sources.xml and the made-up core files, loaded as the app loads the base data. Never real book data. */
export const base: SourceFile[] = [
  { file: 'sources.xml', xml: readFileSync('public/data/sources.xml', 'utf8'), overlay: false },
  ...CORE_FILES.map(n => ({ file: `custom/imported/core/${n}.xml`, xml: readFileSync(join(MINI, 'imported', 'core', `${n}.xml`), 'utf8'), overlay: false })),
]

/** Every file loadCatalog would load from public/data/sources.xml and a custom root laid out as the app's custom/ folder
 * (imported/core/, imported/index.xml, imported/sources.xml, sources.xml, texts/, index.xml), in the same order. The
 * owner's local core copies in public/data are read only with `localCore` (tests guarded by LOCAL_CORE). A missing
 * core, data or listed file is an error. */
export async function loadDir(customRoot: string, localCore = false): Promise<SourceFile[]> {
  const read = (p: string) => (existsSync(p) ? readFileSync(p, 'utf8') : null)
  const { files, missing, coreMissing } = await collectFiles(async path =>
    path.startsWith('data/')
      ? localCore || path === 'data/sources.xml'
        ? read(join('public', path))
        : null
      : read(join(customRoot, path.replace(/^custom\//, ''))),
  )
  if (missing.length || coreMissing.length) throw new Error(`${customRoot}: missing: ${[...missing, ...coreMissing].join(', ')}`)
  return files
}

/** The engine catalog: the made-up core files (levels, skills, pricing, amp types/effects, weapons, armor, lifestyles…),
 * the shipped sources and the made-up imported books. Never real book data. */
export const catFiles: SourceFile[] = await loadDir(MINI)
export const cat: Catalog = buildCatalog(catFiles)

/** Where the owner's private book catalogs live: BOOKS_DIR, else the oracle captured in task 1 from the catalogs
 * the app used to ship (.extract/private/oracle, never committed). Flat layout (amps.xml, spells.xml…) plus a
 * samples/ dir, pregens-printed.json and book-discrepancies.md. */
export const BOOKS_DIR = process.env.BOOKS_DIR ?? '.extract/private/oracle'

/** The owner's local core copies (public/data): the real mechanics the book catalogs are checked against. */
const localCore = (): SourceFile[] => dir('public/data', false)

const loadBooks = (): Catalog | null => {
  if (!LOCAL_CORE || !BOOK_CATALOG_FILES.every(f => existsSync(join(BOOKS_DIR, f)))) return null
  const bookFiles = BOOK_CATALOG_FILES.map(f => ({ file: f, xml: readFileSync(join(BOOKS_DIR, f), 'utf8'), overlay: false }))
  // the books' spec additions (DHSA's), appended to the shipped skills as an import is
  const skills = join(BOOKS_DIR, 'skills.xml')
  if (existsSync(skills)) bookFiles.push({ file: 'custom/imported/books/skills.xml', xml: readFileSync(skills, 'utf8'), overlay: true })
  const textsDir = 'public/custom/texts'
  const texts = existsSync(textsDir) ? dir(textsDir, true) : []
  return buildCatalog([...localCore(), ...bookFiles, ...texts])
}

/** Full catalog (the owner's local core copies + real book content) from the owner's private imports; null in CI
 * and for anyone without their own books and core copies. See tests/ca2/catalog/_gate.ts. */
export const books: Catalog | null = loadBooks()

export const sample = (name: string): Character => migrate(JSON.parse(readFileSync(join(BOOKS_DIR, 'samples', `${name}.ca2.json`), 'utf8')))

/** Path under the oracle root for any other private book file a books-only test needs
 * (e.g. pregens-printed.json, book-discrepancies.md) — never the committed copy. */
export const bookFile = (name: string): string => join(BOOKS_DIR, name)

/** A runner finalized the way releases before 0.5.5 did: no `carry`, no "Creation finished" entry; its ledger events
 *  apply on top of the build (engine/career.ts settle converts it). */
export const legacy = (ch: Character): Character => {
  const { carry: _, ...rest } = ch
  return { ...rest, career: ch.career.filter(e => e.type !== 'finalize') }
}
