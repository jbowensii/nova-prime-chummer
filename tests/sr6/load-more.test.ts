// The SR6 catalog loader's less-travelled paths (src/sr6/engine/load.ts): texts the DOM reads, sample fixes, source merging,
// formula issues, an entry with no id, and the fetching loader. Made-up files throughout.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import { buildSr6Catalog, collectSr6Files, loadSr6Catalog, resolveEntry } from '../../src/sr6/engine/load'

const NS = 'xmlns:sr6="urn:chummer-sr6:data:1"'
const F = (file: string, xml: string, overlay = true) => ({ file, xml, overlay })
const GEAR = `<sr6:data ${NS} kind="gear" version="1"><gear id="crb.g" source="CRB" page="1" category="c"><name>G</name><text>old</text></gear></sr6:data>`

afterEach(() => vi.unstubAllGlobals())

test('a texts file the plain reader refuses (here a carriage return in a text) is read with the DOM: it fills the text, unknown ids and kinds are skipped', () => {
  const texts = `<sr6:data ${NS} kind="texts" version="1"><text of="gear" id="crb.g">New &amp; better\r\n</text><text of="gear" id="crb.none">lost</text><text of="nope" id="x">lost</text></sr6:data>`
  const c = buildSr6Catalog([F('a.xml', GEAR), F('texts.xml', texts)])
  expect(c.errors).toEqual([])
  expect(c.entries.gear.get('crb.g')!.text.trim()).toBe('New & better')
  expect(c.files.at(-1)).toMatchObject({ file: 'texts.xml', kind: 'texts', entries: 3 })
})

test('a plain texts file for entries that are not there changes nothing', () => {
  const texts = `<sr6:data ${NS} kind="texts" version="1"><text of="gear" id="crb.none">lost</text><text of="nope" id="x">lost</text></sr6:data>`
  const c = buildSr6Catalog([F('a.xml', GEAR), F('texts.xml', texts)])
  expect(c.entries.gear.get('crb.g')!.text).toBe('old')
  expect(c.files.at(-1)).toMatchObject({ kind: 'texts', entries: 2 })
})

test('sample fixes in the edits layer are kept by id with their corrections, and are no catalog entry', () => {
  const edits =
    `<sr6:data ${NS} kind="edits" version="1"><samplefix id="ex.runner" source="CRB" page="9" by="eve"><name>Ex Runner</name><text>Fixed.</text>` +
    `<correct item="Glow Eyes" from="2" to="3" note="misprint"/><correct item="Zap Gun" field="rating" from="1" to="2"/></samplefix></sr6:data>`
  const c = buildSr6Catalog([F('edits.xml', edits)])
  expect(c.errors).toEqual([])
  expect(c.sampleFixes?.get('ex.runner')).toEqual({
    id: 'ex.runner',
    source: 'CRB',
    page: 9,
    by: 'eve',
    name: 'Ex Runner',
    text: 'Fixed.',
    corrects: [
      { item: 'Glow Eyes', field: 'rating', from: '2', to: '3', note: 'misprint' },
      { item: 'Zap Gun', field: 'rating', from: '1', to: '2' },
    ],
  })
  const bare = buildSr6Catalog([F('edits.xml', `<sr6:data ${NS} kind="edits" version="1"><samplefix/></sr6:data>`)])
  expect(bare.sampleFixes?.get('')).toEqual({ id: '', source: '', page: 0, by: undefined, name: '', text: '', corrects: [] })
})

test('an entry without an id is an error of its file and the file’s other entries do not load', () => {
  const c = buildSr6Catalog([F('a.xml', `<sr6:data ${NS} kind="gear" version="1"><gear source="CRB" page="1" category="c"><name>G</name></gear></sr6:data>`)])
  expect(c.errors).toEqual([{ file: 'a.xml', message: 'a <gear> has no id' }])
  expect(c.entries.gear.size).toBe(0)
})

test('sources merge by id: an imported book keeps the shipped description and adds its file; a later source fills what it names', () => {
  const src = (attrs: string) => `<sr6:data ${NS} kind="sources" version="1"><source id="CRB" ${attrs}><name>Core</name></source></sr6:data>`
  const merged = buildSr6Catalog([
    F('data/sr6/sources.xml', src('publisher="Pub" canon="true" published="2019"'), false),
    F('custom/sr6/imported/sources.xml', src('publisher="Other" file="crb.pdf" sha256="abc" imported="2026-10-01" texts="sr6/texts/crb.xml"')),
  ])
  expect(merged.sources.get('CRB')).toMatchObject({
    publisher: 'Pub',
    canon: true,
    published: '2019',
    file: 'crb.pdf',
    sha256: 'abc',
    imported: '2026-10-01',
    texts: 'sr6/texts/crb.xml',
    origin: 'imported',
  })
  // two imported files for one source: the later wins where it says something, the earlier stays where it is silent
  const later = buildSr6Catalog([
    F('custom/sr6/imported/a.xml', src('publisher="First" published="2020"')),
    F('custom/sr6/imported/b.xml', src('publisher="Second"')),
  ])
  expect(later.sources.get('CRB')).toMatchObject({ publisher: 'Second', published: '2020', origin: 'imported' })
  // a source with no attributes reads as empty
  const bare = buildSr6Catalog([F('x.xml', `<sr6:data ${NS} kind="sources" version="1"><source/></sr6:data>`)])
  expect(bare.sources.get('')).toMatchObject({ id: '', name: '', publisher: '', canon: false })
})

test('an unreadable formula is an issue of its entry; an alias to a kind the catalog does not have is ignored', () => {
  const xml =
    `<sr6:data ${NS} kind="gear" version="1"><gear id="crb.g" source="CRB" page="1" category="c" cost="x"><name>G</name><alias id="crb.old" kind="nope"/>` +
    `<formula field="cost">ref(gear:crb.missing, cost, R)</formula></gear></sr6:data>`
  const c = buildSr6Catalog([F('a.xml', xml)])
  expect(c.entries.gear.get('crb.g')!.issues).toMatchObject([{ field: 'cost', code: 'unreadable' }])
  expect(c.entries.gear.get('crb.g')!.issues![0].note).toMatch(/^its formula: /)
  expect(c.moved.size).toBe(0)
  expect(resolveEntry(c, 'gear', 'crb.old')).toBeUndefined()
})

test('collectSr6Files reports what an index or the shipped sources name that could not be got', async () => {
  const idx = `<index><file href="crb/gear.xml"/><file href="crb/gone.xml"/></index>`
  const have: Record<string, string> = {
    'data/sr6/sources.xml': `<sr6:data ${NS} kind="sources" version="1"/>`,
    'custom/sr6/imported/index.xml': idx,
    'custom/sr6/imported/crb/gear.xml': GEAR,
  }
  const { files, missing } = await collectSr6Files(async p => have[p] ?? null, [F('extra.xml', GEAR)])
  expect(missing).toEqual(['custom/sr6/imported/crb/gone.xml'])
  expect(files.map(f => f.file)).toEqual(['data/sr6/sources.xml', 'custom/sr6/imported/crb/gear.xml', 'extra.xml'])
  const none = await collectSr6Files(async () => null)
  expect(none.missing).toEqual(['data/sr6/sources.xml'])
})

const disk = (path: string) => {
  const file = path.startsWith('data/') ? join('public', path) : path.startsWith('custom/sr6/') ? join('tests/fixtures/sr6/custom', path.slice(11)) : null
  try {
    return file ? readFileSync(file, 'utf8') : null
  } catch {
    return null
  }
}

test('loadSr6Catalog fetches the files under its base, with the files the server lacks listed as errors', async () => {
  const asked: string[] = []
  vi.stubGlobal('fetch', async (url: string) => {
    asked.push(url)
    const text = disk(url.replace(/^\/app\//, ''))
    return text === null || url.endsWith('crb/weapons.xml') ? { ok: false, text: async () => '' } : { ok: true, text: async () => text }
  })
  const c = await loadSr6Catalog('/app/')
  expect(asked[0]).toBe('/app/data/sr6/sources.xml')
  expect(c.errors).toEqual([{ file: 'custom/sr6/imported/crb/weapons.xml', message: 'could not be fetched' }])
  expect(c.entries.weapons.size).toBe(1) // the edits layer's zap gun only
  expect(c.entries.spells.size).toBeGreaterThan(0)
})

test('loadSr6Catalog: a shipped file that cannot be reached fails the load; a custom one is only missing', async () => {
  vi.stubGlobal('fetch', async () => {
    throw new Error('offline')
  })
  await expect(loadSr6Catalog()).rejects.toThrow('offline')
  vi.stubGlobal('fetch', async (url: string) => {
    if (url.startsWith('./data/')) return { ok: true, text: async () => `<sr6:data ${NS} kind="sources" version="1"/>` }
    throw new Error('offline')
  })
  const c = await loadSr6Catalog('./', [F('extra.xml', GEAR)])
  expect(c.errors).toEqual([])
  expect(c.entries.gear.has('crb.g')).toBe(true)
})

test('an unreadable formula on a field that already has an issue adds no second one', () => {
  const xml =
    `<sr6:data ${NS} kind="gear" version="1"><gear id="crb.g" source="CRB" page="1" category="c" cost="x"><name>G</name>` +
    `<issue field="cost" code="unreadable" page="1">printed oddly</issue><formula field="cost">ref(gear:crb.missing, cost, R)</formula></gear></sr6:data>`
  const c = buildSr6Catalog([F('a.xml', xml)])
  expect(c.entries.gear.get('crb.g')!.issues).toEqual([{ field: 'cost', code: 'unreadable', page: 1, note: 'printed oddly' }])
})

test('an edit keeps the book’s formulas and issues except for a field it sets otherwise; its own formulas win', () => {
  const book =
    `<sr6:data ${NS} kind="gear" version="1"><gear id="crb.g" source="CRB" page="1" category="c" cost="40" avail="2"><name>G</name>` +
    `<formula field="cost">R * 100</formula><formula field="avail">R + 1</formula>` +
    `<issue field="cost" code="missing" page="1">no cost printed</issue><issue field="avail" code="ambiguous" page="1">two avails</issue></gear></sr6:data>`
  const edit = (attrs: string, extra = '') =>
    `<sr6:data ${NS} kind="edits" version="1"><gear id="crb.g" source="CRB" page="1" category="c" ${attrs} by="eve"><name>G</name>${extra}</gear></sr6:data>`
  const run = (xml: string) => buildSr6Catalog([F('crb/gear.xml', book), F('edits.xml', xml)]).entries.gear.get('crb.g')!
  const same = run(edit('cost="40" avail="2"'))
  expect(same.formulas).toEqual([
    { field: 'cost', expr: 'R * 100' },
    { field: 'avail', expr: 'R + 1' },
  ])
  expect(same.issues?.map(i => i.field)).toEqual(['cost', 'avail'])
  expect(same).toMatchObject({ edited: true, by: 'eve' })
  const cost = run(edit('cost="55" avail="2"'))
  expect(cost.formulas).toEqual([{ field: 'avail', expr: 'R + 1' }])
  expect(cost.issues?.map(i => i.field)).toEqual(['avail'])
  const own = run(edit('cost="55" avail="9"', '<formula field="cost">R * 3</formula>'))
  expect(own.formulas).toEqual([{ field: 'cost', expr: 'R * 3' }])
  expect(own.issues).toBeUndefined()
})
