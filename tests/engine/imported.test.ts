// Imported books: custom/imported/ loads between the base data and house rules, ids are scoped by
// source, sources merge across the three sources files, and same-named entries are all kept.
import { existsSync, readFileSync } from 'node:fs'
import { describe, test, expect } from 'vitest'
import { dupeGroups, dupeLabel } from '../../src/engine/dupes'
import { buildCatalog, loadCatalog, type SourceFile } from '../../src/engine/load'
import { base, cat } from '../helpers'

const NS = 'xmlns:ca2="urn:chummer-anarchy2:data:1"'
const sources = (file: string, body: string): SourceFile =>
  ({ file, xml: `<ca2:data ${NS} kind="sources" version="1">${body}</ca2:data>`, overlay: true })

describe('duplicates', () => {
  test('both books’ Rush are kept', () => {
    expect([...cat.amps.keys()]).toEqual(expect.arrayContaining(['test.rush', 'testc.rush']))
  })
  test('one canon, one not: the badge tells them apart', () => {
    expect(dupeLabel(cat, 'test.rush')).toEqual({ kind: 'badge' })
  })
  test('same status: labeled with the book', () => {
    // fixture TEST2 (non-canon) also has "Keen Eye"
    expect(dupeLabel(cat, 'test.keen-eye')).toEqual({ kind: 'book', text: 'TEST', title: 'Test Book One' })
    expect(dupeLabel(cat, 'test2.keen-eye')).toEqual({ kind: 'book', text: 'TEST2', title: 'Test Book Two' })
  })
  test('an entry without a duplicate gets no label', () => expect(dupeLabel(cat, 'test.ghost-deck')).toBeNull())
  test('normalization ignores case, punctuation and "(Type)" suffixes', () => {
    expect([...dupeGroups(cat).values()].some(g => g.includes('test.rush') && g.includes('testc.rush'))).toBe(true)
  })
})

describe('sources', () => {
  test('an imported source carries its file and checksum', () => {
    expect(cat.sources.get('TEST')).toMatchObject({ file: 'test-book.pdf', origin: 'imported' })
    expect(cat.sources.get('TESTC')!.sha256!.split(' ')).toHaveLength(2)
    expect(cat.sources.get('CRB')!.origin).toBe('shipped')
  })
  test('a shipped book that is imported stays one source: shipped description, imported file', () => {
    const c = buildCatalog([...base, sources('custom/imported/sources.xml',
      '<source id="QREF" publisher="x" canon="true" file="q.pdf" sha256="ab" imported="2026-09-27"><name>Other</name></source>')])
    expect(c.sources.get('QREF')).toMatchObject({ name: 'Quick reference sheets: Base, Magic, Matrix, Vehicles', canon: false,
      texts: 'texts/qref.xml', file: 'q.pdf', sha256: 'ab', imported: '2026-09-27', origin: 'imported' })
  })
  test('the user’s sources file wins for name and canon', () => {
    const c = buildCatalog([...base, sources('custom/imported/sources.xml',
      '<source id="QREF" publisher="x" canon="false" file="q.pdf"><name>Other</name></source>'),
      sources('custom/sources.xml', '<source id="QREF" publisher="Me" canon="true"><name>My refs</name></source>')])
    expect(c.sources.get('QREF')).toMatchObject({ name: 'My refs', canon: true, file: 'q.pdf', origin: 'user' })
  })
  test('a house-rule entry citing an unlisted source is reported, once per file', () => {
    const ov: SourceFile = { file: 'custom/house.xml', overlay: true, xml: `<ca2:data ${NS} kind="gear" version="1">
      <item id="a" kind="gear" source="HOUSE" page="1"><name>A</name></item>
      <item id="b" kind="gear" source="HOUSE" page="1"><name>B</name></item></ca2:data>` }
    const c = buildCatalog([...base, ov])
    expect(c.errors).toEqual([{ file: 'custom/house.xml', message: 'source "HOUSE" isn\'t listed in any sources file; treated as not canon' }])
    const listed = buildCatalog([...base, sources('custom/sources.xml', '<source id="HOUSE" publisher="Me" canon="false"><name>House</name></source>'), ov])
    expect(listed.errors).toEqual([])
  })
})

test('loadCatalog fetches data, sources, imported files, texts, then house rules, in that order', async () => {
  const fixture = 'tests/fixtures/mini/'
  const extra: Record<string, string> = {
    'custom/sources.xml': `<ca2:data ${NS} kind="sources" version="1"><source id="HOUSE" publisher="Me" canon="false" texts="texts/house.xml"><name>House</name></source></ca2:data>`,
    'custom/texts/house.xml': `<ca2:data ${NS} kind="texts" version="1"><text of="amps" id="test.rush">Fast.</text></ca2:data>`,
    'custom/index.xml': '<overlays><file href="house.xml"/></overlays>',
    'custom/house.xml': `<ca2:data ${NS} kind="amps" version="1"><remove id="test2.keen-eye"/></ca2:data>`,
  }
  const fetched: string[] = []
  const real = globalThis.fetch
  globalThis.fetch = (async (url: string) => {
    const path = String(url).replace(/^\.\//, '')
    fetched.push(path)
    const disk = path.startsWith('data/') ? `public/${path}` : fixture + path
    const body = extra[path] ?? (existsSync(disk) ? readFileSync(disk, 'utf8') : null)
    return { ok: body != null, text: async () => body ?? '' }
  }) as typeof fetch
  try {
    const c = await loadCatalog('./')
    expect(c.amps.get('test.rush')!.narrative).toBe('Fast.')
    expect(c.amps.has('test2.keen-eye')).toBe(false) // house rules load last
    expect(c.sources.get('HOUSE')!.origin).toBe('user')
    const at = (p: string) => fetched.indexOf(p)
    expect(at('custom/imported/sources.xml')).toBeGreaterThan(at('data/sources.xml'))
    expect(at('custom/sources.xml')).toBeGreaterThan(at('custom/imported/sources.xml'))
    expect(at('custom/imported/index.xml')).toBeGreaterThan(at('custom/sources.xml'))
    expect(at('custom/imported/testc/amps.xml')).toBeGreaterThan(at('custom/imported/index.xml'))
    expect(at('custom/texts/house.xml')).toBeGreaterThan(at('custom/imported/testc/amps.xml'))
    expect(at('custom/house.xml')).toBeGreaterThan(at('custom/texts/house.xml'))
    expect(c.files.map(f => f.file).slice(-3)).toEqual(['custom/imported/testc/amps.xml', 'custom/texts/house.xml', 'custom/house.xml'])
  } finally { globalThis.fetch = real }
})
