// Imported books: custom/imported/ loads between the base data and house rules, ids are scoped by
// source, sources merge across the three sources files, and same-named entries are all kept.
import { existsSync, readFileSync } from 'node:fs'
import { describe, test, expect } from 'vitest'
import { blankCharacter } from '../../src/engine/file'
import { dupeGroups, dupeLabel } from '../../src/engine/dupes'
import { buildCatalog, loadCatalog, type SourceFile } from '../../src/engine/load'
import { rescope } from '../../src/engine/rescope'
import type { AmpEntry, CareerEvent, ItemEntry } from '../../src/model/types'
import { base, cat, catFiles } from '../helpers'

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
  test('three of a kind: the lone canon one gets the badge, the two non-canon ones their books', () => {
    expect(dupeGroups(cat).get('gear|nano tape')).toHaveLength(3)
    expect(dupeLabel(cat, 'testc.nano-tape')).toEqual({ kind: 'badge' })
    expect(dupeLabel(cat, 'test.nano-tape')).toEqual({ kind: 'book', text: 'TEST', title: 'Test Book One' })
    expect(dupeLabel(cat, 'test2.nano-tape')).toEqual({ kind: 'book', text: 'TEST2', title: 'Test Book Two' })
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
    expect(c.errors).toEqual([{ file: 'custom/house.xml', message: 'source "HOUSE" isn’t listed in any sources file; treated as not canon' }])
    const listed = buildCatalog([...base, sources('custom/sources.xml', '<source id="HOUSE" publisher="Me" canon="false"><name>House</name></source>'), ov])
    expect(listed.errors).toEqual([])
  })
})

describe('skill additions', () => {
  const skills = (file: string, body: string): SourceFile =>
    ({ file, xml: `<ca2:data ${NS} kind="skills" version="1">${body}</ca2:data>`, overlay: true })
  const cc = (specs: string) => `<skill id="close-combat" attr="agi" source="X" page="1"><name>Mine</name>${specs}</skill>`
  const spec = (id: string) => `<spec id="close-combat.${id}" attr="agi">${id}</spec>`

  test('an imported book’s specs are added to the shipped skill, which keeps everything else', () => {
    const s = cat.skills.get('close-combat')!
    expect(s).toMatchObject({ name: 'Close Combat', source: 'CRB' })
    expect(s.specs.map(x => x.id)).toEqual(expect.arrayContaining(['close-combat.blades', 'close-combat.made-up-style']))
    expect(s.specs.find(x => x.id === 'close-combat.made-up-style')).toMatchObject({ source: 'TEST', page: 4 })
  })
  test('a spec two books add is listed once', () => {
    const c = buildCatalog([...catFiles, skills('custom/imported/test2/skills.xml', cc(spec('made-up-style') + spec('blades')))])
    expect(c.skills.get('close-combat')!.specs.filter(x => ['close-combat.made-up-style', 'close-combat.blades'].includes(x.id))).toHaveLength(2)
  })
  test('a house-rule skill still replaces the shipped one', () => {
    const c = buildCatalog([...catFiles, skills('custom/house.xml', cc(spec('whips')))])
    expect(c.skills.get('close-combat')).toMatchObject({ name: 'Mine', specs: [{ id: 'close-combat.whips' }] })
  })
})

/** fetch served from public/ (data/) and the fixture (custom/), with `extra` overrides; `offline` throws. */
function stubFetch(extra: Record<string, string>, offline?: string) {
  const fetched: string[] = []
  const real = globalThis.fetch
  globalThis.fetch = (async (url: string) => {
    const path = String(url).replace(/^\.\//, '')
    fetched.push(path)
    if (path === offline) throw new TypeError('offline')
    const disk = path.startsWith('data/') ? `public/${path}` : `tests/fixtures/mini/${path}`
    const body = extra[path] ?? (existsSync(disk) ? readFileSync(disk, 'utf8') : null)
    return { ok: body != null, text: async () => body ?? '' }
  }) as typeof fetch
  return { fetched, restore: () => { globalThis.fetch = real } }
}

test('loadCatalog fetches data, sources, imported files, texts, edits, then house rules, in that order', async () => {
  const extra: Record<string, string> = {
    'custom/sources.xml': `<ca2:data ${NS} kind="sources" version="1"><source id="HOUSE" publisher="Me" canon="false" texts="texts/house.xml"><name>House</name></source></ca2:data>`,
    'custom/texts/house.xml': `<ca2:data ${NS} kind="texts" version="1"><text of="amps" id="test.rush">Fast.</text></ca2:data>`,
    'custom/index.xml': '<overlays><file href="house.xml"/></overlays>',
    'custom/house.xml': `<ca2:data ${NS} kind="amps" version="1"><remove id="test2.keen-eye"/></ca2:data>`,
  }
  const { fetched, restore } = stubFetch(extra)
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
    expect(at('custom/texts/house.xml')).toBeGreaterThan(at('custom/imported/testc/items.xml'))
    expect(at('custom/house.xml')).toBeGreaterThan(at('custom/texts/house.xml'))
    expect(c.files.map(f => f.file).slice(-6)).toEqual(['custom/imported/testc/skills.xml', 'custom/texts/house.xml',
      'custom/edits/sources.xml', 'custom/edits/edits.xml', 'custom/edits/texts.xml', 'custom/house.xml'])
  } finally { restore() }
})

describe('rescope', () => {
  const ampWith = (patch: Partial<AmpEntry>): AmpEntry =>
    ({ uid: 'u1', catalogId: 'rush', type: 'equipment', name: 'Rush', narrative: '', effects: [], ...patch })

  test('an old unscoped id is mapped to the scoped entry matching its snapshot source', () => {
    const ch = blankCharacter()
    ch.build.amps = [ampWith({ snapshot: { ...cat.amps.get('testc.rush')!, id: 'rush' } })]
    const out = rescope(cat, ch)
    expect(out.build.amps[0].catalogId).toBe('testc.rush')
    expect(out).not.toBe(ch)
  })

  test('an unknown id with no matching source or name keeps its id and snapshot untouched', () => {
    const ch = blankCharacter()
    const amp = ampWith({ catalogId: 'nope', name: 'Nope', snapshot: { ...cat.amps.get('testc.rush')!, id: 'nope', name: 'Nope', source: 'GHOST' } })
    ch.build.amps = [amp]
    const out = rescope(cat, ch)
    expect(out.build.amps[0]).toBe(amp)
    expect(out).toBe(ch)
  })

  test('a shipped, unscoped catalogId already in the catalog is left alone', () => {
    const ch = blankCharacter()
    const item: ItemEntry = { uid: 'u2', catalogId: 'light-armor', kind: 'armor', name: 'Light armor' }
    ch.build.items = [item]
    const out = rescope(cat, ch)
    expect(out).toBe(ch)
  })

  test('no source match: falls back to the scoped entry with the same normalized name and type', () => {
    const ch = blankCharacter()
    ch.build.amps = [ampWith({ catalogId: 'ghost-deck', type: 'cyberdeck', name: 'Ghost Deck',
      snapshot: { ...cat.amps.get('test.ghost-deck')!, id: 'ghost-deck', source: 'GONE' } })]
    const out = rescope(cat, ch)
    expect(out.build.amps[0].catalogId).toBe('test.ghost-deck')
  })

  test('several books match by name: the canon one wins (fixture’s Nano Tape group)', () => {
    const ch = blankCharacter()
    const item: ItemEntry = { uid: 'u3', catalogId: 'nano-tape', kind: 'gear', name: 'Nano Tape',
      snapshot: { ...cat.items.get('test.nano-tape')!, id: 'nano-tape', source: 'GONE' } }
    ch.build.items = [item]
    const out = rescope(cat, ch)
    expect(out.build.items[0].catalogId).toBe('testc.nano-tape')
  })

  test('career events: amp-add and amp-modify get rescoped, an unchanged career keeps identity', () => {
    const ch = blankCharacter()
    const stale = ampWith({ snapshot: { ...cat.amps.get('testc.rush')!, id: 'rush' } })
    const fixed = ampWith({ uid: 'u2', catalogId: 'testc.rush', snapshot: cat.amps.get('testc.rush')! })
    ch.career = [
      { id: 'e1', at: 't', type: 'amp-add', amp: stale, cost: 1 },
      { id: 'e2', at: 't', type: 'amp-modify', ampUid: 'u1', before: stale, after: stale, cost: 1 },
      { id: 'e3', at: 't', type: 'note', text: 'hi' },
    ] satisfies CareerEvent[]
    const out = rescope(cat, ch)
    expect(out.career[0]).toMatchObject({ type: 'amp-add', amp: { catalogId: 'testc.rush' } })
    expect(out.career[1]).toMatchObject({ type: 'amp-modify', before: { catalogId: 'testc.rush' }, after: { catalogId: 'testc.rush' } })
    expect(out.career[2]).toBe(ch.career[2])

    const ch2 = blankCharacter()
    ch2.career = [{ id: 'e1', at: 't', type: 'amp-add', amp: fixed, cost: 1 }] satisfies CareerEvent[]
    expect(rescope(cat, ch2)).toBe(ch2)
  })
})

test('an unreachable server fails the load; an unreachable imports index just means no imports', async () => {
  const down = stubFetch({}, 'data/levels.xml')
  try { await expect(loadCatalog('./')).rejects.toThrow('offline') } finally { down.restore() }
  const noIndex = stubFetch({}, 'custom/imported/index.xml')
  try {
    const c = await loadCatalog('./')
    expect(c.levels.size).toBeGreaterThan(0)
    expect(c.amps.has('test.rush')).toBe(false)
    expect(c.sources.get('TEST')!.origin).toBe('imported')
  } finally { noIndex.restore() }
})
