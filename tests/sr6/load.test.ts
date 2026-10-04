// The SR6 catalog loader (src/sr6/engine/load.ts) on the made-up fixture (tests/fixtures/sr6/custom) and the shipped
// public/data/sr6/sources.xml, read from disk.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { buildSr6Catalog, collectSr6Files, entryKey, sr6EntryXml } from '../../src/sr6/engine/load'
import { SR6_KINDS, type Sr6Kind } from '../../src/sr6/model/types'

const get = async (path: string) => {
  const file = path.startsWith('data/') ? join('public', path) : path.startsWith('custom/sr6/') ? join('tests/fixtures/sr6/custom', path.slice(11)) : null
  try { return file ? readFileSync(file, 'utf8') : null } catch { return null }
}
const load = async () => buildSr6Catalog((await collectSr6Files(get)).files)
const NS = 'xmlns:sr6="urn:chummer-sr6:data:1"'

test('the files load in order: shipped and imported sources, the index’s files, texts, then the edits layer', async () => {
  const { files, missing } = await collectSr6Files(get)
  const names = files.map(f => f.file)
  expect(missing).toEqual([])
  expect(names.slice(0, 3)).toEqual(['data/sr6/sources.xml', 'custom/sr6/imported/sources.xml', 'custom/sr6/imported/crb/priorities.xml'])
  expect(names.slice(-3)).toEqual(['custom/sr6/texts/crb.xml', 'custom/sr6/edits/edits.xml', 'custom/sr6/edits/texts.xml'])
  expect(names).toHaveLength(2 + 26 + 3)
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
  expect(c.entries.priorities.get('crb.priority-a')!.parts.filter(p => p.tag === 'metatype').map(p => p.attrs)).toEqual(
    [{ name: 'Glimmerkin', points: '13' }, { name: 'Stonefolk', points: '11' }])
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

test('the CRB source is the shipped one plus the imported file and checksum', async () => {
  const s = (await load()).sources.get('CRB')
  expect(s).toEqual({ id: 'CRB', name: 'Shadowrun, Sixth World Core Rulebook', publisher: 'Catalyst Game Labs', canon: true, texts: 'texts/crb.xml',
    file: 'test-sr6-core.pdf', sha256: '5'.repeat(64), imported: '2026-10-02', origin: 'imported' })
})

test('texts fill descriptions; the edited weapon has its new cost, the edit’s text, and the book’s version in original', async () => {
  const c = await load()
  expect(c.entries.qualities.get('crb.lucky-streak')!.text).toBe('Invented luck, a little at a time.')
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
    { file: 'a.xml', overlay: true, xml: `<sr6:data ${NS} kind="weapons" version="1"><weapon id="crb.x" source="CRB" page="1" category="c" cost="1"><name>X</name><text/></weapon></sr6:data>` },
    { file: 't.xml', overlay: true, xml: `<sr6:data ${NS} kind="texts" version="1"><text of="weapons" id="crb.x">Book text.</text></sr6:data>` },
    { file: 'e.xml', overlay: true, xml: `<sr6:data ${NS} kind="edits" version="1"><weapon id="crb.x" source="CRB" page="1" category="c" cost="2"><name>X</name><text/></weapon>` +
      `<spell id="crb.gone" source="CRB" page="2" category="combat"><name>Gone</name><text/></spell></sr6:data>` },
  ])
  expect(c.errors).toEqual([])
  expect(c.entries.weapons.get('crb.x')).toMatchObject({ text: 'Book text.', edited: true, attrs: { category: 'c', cost: '2' } })
  expect(c.entries.spells.get('crb.gone')!.edited).toBe(true)
  expect(c.original.has(entryKey('spells', 'crb.gone'))).toBe(false)
})

test('an Anarchy file, an unknown tag or kind and broken XML are errors, and their entries don’t load', () => {
  const c = buildSr6Catalog([
    { file: 'ca2.xml', overlay: true, xml: '<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="weapons" version="1"><weapon id="crb.y" source="CRB" page="1" category="c"><name>Y</name></weapon></ca2:data>' },
    { file: 'tag.xml', overlay: true, xml: `<sr6:data ${NS} kind="weapons" version="1"><weapon id="crb.z" source="CRB" page="1" category="c"><name>Z</name></weapon><spell id="crb.s" source="CRB" page="1" category="combat"><name>S</name></spell></sr6:data>` },
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
    { file: 'a.xml', overlay: true, xml: `<sr6:data ${NS} kind="gear" version="1"><gear id="crb.g" source="CRB" page="1" category="c"><name>G</name></gear></sr6:data>` },
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
