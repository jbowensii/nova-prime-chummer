// The SR6 catalog loader (src/sr6/engine/load.ts) on the made-up fixture (tests/fixtures/sr6/custom) and the shipped
// public/data/sr6/sources.xml, read from disk.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { compendiumXml, type SourceFile } from '../../src/engine'
import { xmlToSr6 } from '../../src/sr6/engine/charxml'
import { sr6CompendiumXml } from '../../src/sr6/engine/compendium'
import { sr6Data } from '../../src/sr6/engine/data'
import { buildSr6Catalog, collectSr6Files, plainTexts, sr6EntryXml } from '../../src/sr6/engine/load'
import { entryKey } from '../../src/sr6/engine/names'
import { SR6_KINDS, type Sr6Entry, type Sr6Kind } from '../../src/sr6/model/types'
import type { Sr6Compendium } from '../../src/sr6/model/character'

const get = async (path: string) => {
  const file = path.startsWith('data/') ? join('public', path) : path.startsWith('custom/sr6/') ? join('tests/fixtures/sr6/custom', path.slice(11)) : null
  try {
    return file ? readFileSync(file, 'utf8') : null
  } catch {
    return null
  }
}
const load = async () => buildSr6Catalog((await collectSr6Files(get)).files)
const NS = 'xmlns:sr6="urn:chummer-sr6:data:1"'

test('the files load in order: shipped and imported sources, the index’s files, texts, then the edits layer', async () => {
  const { files, missing } = await collectSr6Files(get)
  const names = files.map(f => f.file)
  expect(missing).toEqual([])
  expect(names.slice(0, 3)).toEqual(['data/sr6/sources.xml', 'custom/sr6/imported/sources.xml', 'custom/sr6/imported/crb/priorities.xml'])
  expect(names.slice(-3)).toEqual(['custom/sr6/texts/crb.xml', 'custom/sr6/edits/edits.xml', 'custom/sr6/edits/texts.xml'])
  expect(names).toHaveLength(2 + Object.keys(SR6_KINDS).length + 3)
})

test('every kind has its entries; attributes, parts, name and page are read', async () => {
  const c = await load()
  expect(c.errors).toEqual([])
  for (const kind of Object.keys(SR6_KINDS) as Sr6Kind[]) expect(c.entries[kind].size, kind).toBeGreaterThan(0)
  const fuzz = c.entries.critters.get('crb.fuzzbeast')!
  expect(fuzz).toMatchObject({ kind: 'critters', name: 'Fuzzbeast', source: 'CRB', page: 221, text: 'A made-up beast, mostly fuzz.' })
  expect(fuzz.attrs).toMatchObject({ category: 'critter', bod: '4', init: '7 + 1D6' })
  expect(fuzz.attrs.id).toBeUndefined()
  expect(fuzz.parts.map(p => p.tag)).toEqual(['skills', 'powers', 'weaknesses', 'attacks'])
  expect(
    c.entries.priorities
      .get('crb.priority-a')!
      .parts.filter(p => p.tag === 'metatype')
      .map(p => p.attrs),
  ).toEqual([
    { name: 'Glimmerkin', points: '13' },
    { name: 'Stonefolk', points: '11' },
  ])
  expect(c.files.find(f => f.file.endsWith('crb/weapons.xml'))).toEqual({ file: 'custom/sr6/imported/crb/weapons.xml', kind: 'weapons', entries: 2 })
})

test('life modules load with their stage, grants, requirement and mixed choices as parts', async () => {
  const c = await load()
  const mods = [...c.entries.lifemodules.values()]
  expect(mods.filter(m => m.attrs.stage === 'opening')).toHaveLength(2)
  expect(mods.filter(m => m.attrs.stage === 'adult')).toHaveLength(9)
  expect(mods.filter(m => m.attrs.requires === 'awakened')).toHaveLength(1)
  const mixed = mods.find(m => m.parts.some(p => p.tag === 'choice'))!
  expect(mixed.parts).toEqual([{ tag: 'choice', attrs: { kind: 'mixed', points: '1', options: 'edg skill:crb.hexing nuyen:3000' }, text: '' }])
})

test('the CRB source is the shipped one (with its publication date) plus the imported file and checksum', async () => {
  const s = (await load()).sources.get('CRB')
  expect(s).toEqual({
    id: 'CRB',
    name: 'Shadowrun, Sixth World Core Rulebook',
    publisher: 'Catalyst Game Labs',
    canon: true,
    published: '2019-08',
    cat: 'CAT28000',
    texts: 'texts/crb.xml',
    file: 'test-sr6-core.pdf',
    sha256: '5'.repeat(64),
    imported: '2026-10-02',
    origin: 'imported',
  })
})

test('texts fill descriptions; the edited weapon has its new cost, the edit’s text, and the book’s version in original', async () => {
  const c = await load()
  expect(c.entries.qualities.get('crb.lucky-streak.1')!.text).toBe('Invented luck, a little at a time.')
  const gun = c.entries.weapons.get('crb.zap-gun')!
  expect(gun).toMatchObject({ edited: true, by: 'eve', text: 'A made-up gun that zaps, now cheaper.' })
  expect(gun.attrs.cost).toBe('290')
  expect(gun.attrs.by).toBeUndefined()
  const book = c.original.get(entryKey('weapons', 'crb.zap-gun'))!
  expect([book.attrs.cost, book.text, book.edited]).toEqual(['320', 'A made-up gun that zaps.', undefined])
  expect(c.entries.weapons.get('crb.fizz-rifle-70')!.edited).toBeUndefined()
})

test('an edit with an empty description keeps the book’s text; one for a missing entry is still applied, with no original', () => {
  const c = buildSr6Catalog([
    {
      file: 'a.xml',
      overlay: true,
      xml: `<sr6:data ${NS} kind="weapons" version="1"><weapon id="crb.x" source="CRB" page="1" category="c" cost="1"><name>X</name><text/></weapon></sr6:data>`,
    },
    { file: 't.xml', overlay: true, xml: `<sr6:data ${NS} kind="texts" version="1"><text of="weapons" id="crb.x">Book text.</text></sr6:data>` },
    {
      file: 'e.xml',
      overlay: true,
      xml:
        `<sr6:data ${NS} kind="edits" version="1"><weapon id="crb.x" source="CRB" page="1" category="c" cost="2"><name>X</name><text/></weapon>` +
        `<spell id="crb.gone" source="CRB" page="2" category="combat"><name>Gone</name><text/></spell></sr6:data>`,
    },
  ])
  expect(c.errors).toEqual([])
  expect(c.entries.weapons.get('crb.x')).toMatchObject({ text: 'Book text.', edited: true, attrs: { category: 'c', cost: '2' } })
  expect(c.entries.spells.get('crb.gone')!.edited).toBe(true)
  expect(c.original.has(entryKey('spells', 'crb.gone'))).toBe(false)
})

test('an Anarchy file, an unknown tag or kind and broken XML are errors, and their entries don’t load', () => {
  const c = buildSr6Catalog([
    {
      file: 'ca2.xml',
      overlay: true,
      xml: '<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="weapons" version="1"><weapon id="crb.y" source="CRB" page="1" category="c"><name>Y</name></weapon></ca2:data>',
    },
    {
      file: 'tag.xml',
      overlay: true,
      xml: `<sr6:data ${NS} kind="weapons" version="1"><weapon id="crb.z" source="CRB" page="1" category="c"><name>Z</name></weapon><spell id="crb.s" source="CRB" page="1" category="combat"><name>S</name></spell></sr6:data>`,
    },
    { file: 'kind.xml', overlay: true, xml: `<sr6:data ${NS} kind="nope" version="1"/>` },
    { file: 'edit.xml', overlay: true, xml: `<sr6:data ${NS} kind="edits" version="1"><amp id="crb.a" source="CRB" page="1"><name>A</name></amp></sr6:data>` },
    { file: 'bad.xml', overlay: true, xml: `<sr6:data ${NS} kind="weapons"` },
  ])
  expect(c.errors.map(e => e.file)).toEqual(['ca2.xml', 'tag.xml', 'kind.xml', 'edit.xml', 'bad.xml'])
  expect(c.errors[0].message).toBe('not an SR6 data file')
  expect(c.errors[1].message).toContain('<spell>')
  expect(c.entries.weapons.size + c.entries.spells.size).toBe(0)
})

test('<remove id> deletes an entry loaded before', () => {
  const c = buildSr6Catalog([
    {
      file: 'a.xml',
      overlay: true,
      xml: `<sr6:data ${NS} kind="gear" version="1"><gear id="crb.g" source="CRB" page="1" category="c"><name>G</name></gear></sr6:data>`,
    },
    { file: 'b.xml', overlay: true, xml: `<sr6:data ${NS} kind="gear" version="1"><remove id="crb.g"/></sr6:data>` },
  ])
  expect(c.entries.gear.size).toBe(0)
})

test('sr6EntryXml round-trips through buildSr6Catalog (attributes escaped, parts kept, empty <text/>)', async () => {
  const c = await load()
  const odd = { ...c.entries.critters.get('crb.fuzzbeast')!, name: 'Fuzz & <Co> "Beast"' }
  odd.attrs = { ...odd.attrs, move: '10/15/+1 & "more"' }
  for (const e of [odd, c.entries.priorities.get('crb.priority-a')!, c.entries.skills.get('crb.tinkering')!, c.entries.weapons.get('crb.zap-gun')!]) {
    const xml = sr6EntryXml(e)
    expect(xml).toMatch(/<text\/><\/\w+>$/)
    const back = buildSr6Catalog([{ file: 'x.xml', overlay: true, xml: `<sr6:data ${NS} kind="${e.kind}" version="1">${xml}</sr6:data>` }])
    expect(back.errors).toEqual([])
    expect(back.entries[e.kind].get(e.id)).toEqual({ ...e, text: '', edited: undefined, by: undefined })
  }
})

// S4: a GM's compendiums join as `extra` overlay files after the edits layer (made-up entries, source STREET)
const kit = (over: Partial<Sr6Compendium> = {}, entries?: Sr6Entry[]): SourceFile => {
  const comp: Sr6Compendium = {
    id: '0123456789ab',
    name: 'Street Kit',
    source: 'STREET',
    sharing: 'table',
    updatedAt: 'x',
    npcs: [grunt],
    ...over,
    entries: entries ?? [
      {
        id: 'street.zap-stick',
        kind: 'weapons',
        name: 'Zap Stick',
        source: over.source ?? 'STREET',
        page: 2,
        attrs: { category: 'Clubs', dv: '3S' },
        parts: [],
        text: 'Ours.',
      },
      {
        id: 'street.gutter-spirit',
        kind: 'spirits',
        name: 'Gutter Spirit',
        source: over.source ?? 'STREET',
        page: 3,
        attrs: { category: 'Alley', bod: 'F' },
        parts: [{ tag: 'skills', attrs: {}, text: 'Astral 4' }],
        text: '',
      },
      {
        id: 'street.lucky-socks',
        kind: 'qualities',
        name: 'Lucky Socks',
        source: over.source ?? 'STREET',
        page: 4,
        attrs: { kind: 'positive', karma: '7' },
        parts: [],
        text: '',
      },
    ],
  }
  return { file: 'compendiums/gil/0123456789ab.xml', xml: sr6CompendiumXml(comp), overlay: true, publisher: 'Gil', owner: 'gil' }
}
const grunt = (() => {
  const r = xmlToSr6(readFileSync('tests/fixtures/sr6/npc-grunt.xml', 'utf8'))
  if (!r.ok) throw new Error(r.reason)
  return r.character
})()
const withExtra = async (extra: SourceFile[]) => buildSr6Catalog((await collectSr6Files(get, extra)).files)

test('a compendium passed as extra loads last, its entries under its own house source; its NPCs are in no map', async () => {
  const { files } = await collectSr6Files(get, [kit()])
  expect(files.at(-1)!.file).toBe('compendiums/gil/0123456789ab.xml')
  const c = await withExtra([kit()])
  expect(c.errors).toEqual([])
  expect(c.sources.get('STREET')).toEqual({
    id: 'STREET',
    name: 'Street Kit',
    publisher: 'Gil',
    canon: false,
    origin: 'user',
    compendium: { id: '0123456789ab', owner: 'gil' },
  })
  expect(c.entries.weapons.get('street.zap-stick')).toMatchObject({ source: 'STREET', page: 2, text: 'Ours.', attrs: { category: 'Clubs', dv: '3S' } })
  expect(c.entries.spirits.get('street.gutter-spirit')!.parts).toEqual([{ tag: 'skills', attrs: {}, text: 'Astral 4' }])
  expect(sr6Data(c).qualities['street.lucky-socks']).toMatchObject({ name: 'Lucky Socks' })
  const size = (x: typeof c) => Object.values(x.entries).reduce((n, m) => n + m.size, 0)
  expect(size(c)).toBe(size(await load()) + 3) // the NPC isn't an entry
  expect(c.files.at(-1)).toEqual({ file: 'compendiums/gil/0123456789ab.xml', kind: 'compendium', entries: 3 })
})

test('a compendium whose source id is a book’s is reported and skipped; the book keeps its source and entries', async () => {
  const before = await load()
  const c = await withExtra([
    kit({ source: 'CRB' }, [{ id: 'crb.zap-gun', kind: 'weapons', name: 'Mine', source: 'CRB', page: 1, attrs: {}, parts: [], text: '' }]),
  ])
  expect(c.errors).toEqual([{ file: 'compendiums/gil/0123456789ab.xml', message: 'its source id CRB is already a book’s; its entries didn’t load' }])
  expect(c.sources.get('CRB')).toEqual(before.sources.get('CRB'))
  expect(c.entries.weapons.get('crb.zap-gun')).toEqual(before.entries.weapons.get('crb.zap-gun'))
})

test('an entry whose id another source’s entry holds is reported and skipped; the book’s stays, the rest load', async () => {
  const before = await load()
  const mine = (id: string, kind: Sr6Kind = 'weapons'): Sr6Entry => ({ id, kind, name: 'Mine', source: 'STREET', page: 1, attrs: {}, parts: [], text: '' })
  const c = await withExtra([kit({}, [mine('crb.zap-gun'), mine('street.ok'), mine('crb.zap-gun', 'gear')])])
  expect(c.errors).toEqual([{ file: 'compendiums/gil/0123456789ab.xml', message: '<weapon> crb.zap-gun: CRB already has that id; it didn’t load' }])
  expect(c.entries.weapons.get('crb.zap-gun')).toEqual(before.entries.weapons.get('crb.zap-gun'))
  expect(c.entries.weapons.get('street.ok')!.source).toBe('STREET')
  expect(c.entries.gear.get('crb.zap-gun')!.source).toBe('STREET') // ids are per kind
  expect(c.files.at(-1)!.entries).toBe(2)
})

test('an Anarchy compendium or an unreadable one as extra is an error; without extra the catalog is unchanged', async () => {
  const ca2 = compendiumXml({
    id: '0123456789ab',
    name: 'Anarchy kit',
    source: 'STREET',
    sharing: 'private',
    updatedAt: 'x',
    amps: [],
    items: [],
    vehicles: [],
    npcs: [],
  })
  const c = await withExtra([
    { file: 'compendiums/gil/a.xml', xml: ca2, overlay: true },
    { ...kit(), file: 'compendiums/gil/b.xml', xml: kit().xml.replace('page="2"', 'page="0"') },
  ])
  expect(c.errors.map(e => e.file)).toEqual(['compendiums/gil/a.xml', 'compendiums/gil/b.xml'])
  expect(c.errors[0].message).toBe('not an SR6 data file')
  expect(c.sources.has('STREET')).toBe(false)
  expect(await withExtra([])).toEqual(await load())
})

test('a plain texts file is read without the DOM, exactly as the DOM reads it; anything else goes to the DOM', () => {
  const file = (body: string, root = `<sr6:data ${NS} kind="texts" version="1">`) =>
    `<?xml version="1.0" encoding="UTF-8"?>\n<!-- PRIVATE -->\n${root}\n${body}</sr6:data>\n`
  const dom = (xml: string) =>
    [...new DOMParser().parseFromString(xml, 'text/xml').documentElement.children].map(el => ({
      of: el.getAttribute('of') ?? '',
      id: el.getAttribute('id') ?? '',
      text: el.textContent ?? '',
    }))
  const plain = file(
    `  <text of="qualities" id="crb.a">One &amp; two &lt;b&gt; "q" 'a' &quot;&apos; > ok\n\nPara — ü</text>\n  <text id="x.b" of="gear"></text>\n`,
  )
  expect(plainTexts(plain)).toEqual(dom(plain))
  expect(plainTexts(plain)).toHaveLength(2)
  const odd = [
    '<text of="a" id="b"><![CDATA[x]]></text>',
    '<text of="a" id="b">&#65;</text>',
    '<text of="a" id="b">&nbsp;</text>',
    '<text of="a" id="b">a & b</text>',
    '<text of="a" id="b">a\r\nb</text>',
    '<text of="a" id="b"/>',
    '<!-- c --><text of="a" id="b">x</text>',
    '<text of="a" of="b">x</text>',
    '<sr6:text of="a" id="b">x</sr6:text>',
    '<text of="a" id="b">x]]>y</text>',
    `<text of='a' id="b">x</text>`,
  ].map(b => file(b))
  odd.push(
    file('<text of="a" id="b">x</text>', '<sr6:data xmlns:sr6="urn:other" kind="texts">'),
    file('<text of="a" id="b">x</text>', `<sr6:data ${NS} kind="edits">`),
    '<sr6:data kind="texts"><text>x</text>',
  )
  for (const xml of odd) expect(plainTexts(xml), xml).toBeNull()
  // a broken one is still the DOM's parse error
  const c = buildSr6Catalog([{ file: 'custom/sr6/bad.xml', xml: file('<text of="a" id="b">a & b</text>'), overlay: true }])
  expect(c.errors[0].message).toMatch(/XML parse error/)
})
