// The Anarchy catalog loader's less-travelled paths (src/engine/load.ts): texts for every kind of entry, the edits layer's
// refusals, an unknown kind, orphaned prices, house rules citing unlisted sources, compendium clashes, and the fetching
// loader with files missing. Invented files.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import { buildCatalog, collectFiles, loadCatalog } from '../../src/engine/load'
import { compendiumXml } from '../../src/engine'
import type { Compendium } from '../../src/model/types'
import { catFiles, MINI } from '../helpers'

const NS = 'xmlns:ca2="urn:chummer-anarchy2:data:1"'
const data = (kind: string, body: string) => `<ca2:data ${NS} kind="${kind}" version="1">${body}</ca2:data>`
const overlay = (file: string, xml: string) => ({ file, xml, overlay: true })
const build = (...extra: ReturnType<typeof overlay>[]) => buildCatalog([...catFiles, ...extra])

afterEach(() => vi.unstubAllGlobals())

test('private texts fill the description of an amp, a rule, a lifestyle or an item by id; unknown ids change nothing', () => {
  const life = [...build().lifestyles.keys()][0], rule = [...build().rules.keys()][0]
  const c = build(overlay('custom/t.xml', data('texts', `<text of="amps" id="test.keen-eye">Amp words.</text><text of="rules" id="${rule}">Rule words.</text>`
    + `<text of="lifestyles" id="${life}">Life words.</text><text of="gear" id="test.nano-tape">Item words.</text><text of="amps" id="gone">x</text>`
    + `<text of="rules" id="gone">x</text><text of="lifestyles" id="gone">x</text><text of="gear" id="gone">x</text>`)))
  expect(c.errors).toEqual([])
  expect(c.amps.get('test.keen-eye')!.narrative).toBe('Amp words.')
  expect(c.rules.get(rule)!.text).toBe('Rule words.')
  expect(c.lifestyles.get(life)!.text).toBe('Life words.')
  expect(c.items.get('test.nano-tape')!.text).toBe('Item words.')
})

test('the edits layer: an edit to an amp keeps the book’s version aside, a keep of the old description, and a refusal for anything else', () => {
  const book = build().items.get('test.nano-tape')!
  const edit = `<item id="test.nano-tape" kind="gear" source="TEST" page="9" cost="x"><name>Nano Tape Mk2</name><text></text></item>`
  const c = build(overlay('custom/edits/edits.xml', data('edits', edit)))
  expect(c.items.get('test.nano-tape')).toMatchObject({ name: 'Nano Tape Mk2', edited: true, text: book.text })
  expect(c.original.items.get('test.nano-tape')?.name).toBe('Nano Tape')
  const bad = build(overlay('custom/edits/edits.xml', data('edits', '<vehicle id="v" source="TEST" page="1"><name>V</name></vehicle>')))
  expect(bad.errors).toEqual([{ file: 'custom/edits/edits.xml', message: 'bad entry: <vehicle> can\'t be edited' }])
  const rule = [...build().rules.values()][0]
  const ruleEdit = build(overlay('custom/edits/edits.xml', data('edits', `<rule id="${rule.id}" sheet="${rule.sheet}" section="s" source="${rule.source}" page="1"><title>New title</title><text>New text</text></rule>`)))
  expect(ruleEdit.rules.get(rule.id)).toMatchObject({ title: 'New title', edited: true })
  expect(ruleEdit.original.rules.get(rule.id)?.title).toBe(rule.title)
  const twice = build(overlay('custom/edits/edits.xml', data('edits', edit + edit.replace('Mk2', 'Mk3'))))
  expect(twice.items.get('test.nano-tape')!.name).toBe('Nano Tape Mk3')
  expect(twice.original.items.get('test.nano-tape')?.name).toBe('Nano Tape')
})

test('an edit keeps the book’s formulas and issues, except for the field it sets otherwise', () => {
  const book = data('gear', `<item id="odd.thing" kind="gear" source="TEST" page="9" dv="4P"><name>Odd Thing</name><formula field="dv">B * 3</formula><formula field="avail">R + 1</formula>`
    + `<issue field="avail" code="missing" page="9">no avail printed</issue><issue field="dv" code="unreadable">dv unreadable</issue><text/></item>`)
  const same = `<item id="odd.thing" kind="gear" source="TEST" page="9" dv="4P"><name>Odd Thing</name><text/></item>`
  const kept = build(overlay('custom/imported/test/odd.xml', book), overlay('custom/edits/edits.xml', data('edits', same)))
  expect(kept.items.get('odd.thing')!.formulas).toEqual([{ field: 'dv', expr: 'B * 3' }, { field: 'avail', expr: 'R + 1' }])
  const changed = build(overlay('custom/imported/test/odd.xml', book), overlay('custom/edits/edits.xml', data('edits', same.replace('dv="4P"', 'dv="9P"'))))
  const e = changed.items.get('odd.thing')!
  expect(e.formulas).toEqual([{ field: 'avail', expr: 'R + 1' }])
  expect(e.issues?.map(i => i.field)).toEqual(['avail'])
  // an edit that sets every field with an issue clears them: only the dv one here, the avail issue stays
  expect(changed.items.get('odd.thing')!.issues).toHaveLength(1)
})

test('an unknown kind, a broken file and a bad entry are reported by file and the rest still loads', () => {
  const c = build(overlay('custom/a.xml', data('mystery', '<x id="1"/>')), overlay('custom/b.xml', '<ca2:data'), overlay('custom/c.xml', '<root/>'))
  expect(c.errors.map(e => e.file)).toEqual(['custom/a.xml', 'custom/b.xml', 'custom/c.xml'])
  expect(c.errors[0].message).toBe('unknown kind "mystery"')
  expect(c.errors[1].message).toMatch(/^XML parse error: /)
  expect(c.errors[2].message).toBe('root must be <ca2:data kind="...">')
  expect(c.items.size).toBeGreaterThan(0)
  const bad = build(overlay('custom/d.xml', data('ampeffects', '<effect id="x" category="body" rating="1" source="CRB" page="1"><name>No types</name></effect>')))
  expect(bad.errors[0]).toMatchObject({ file: 'custom/d.xml' })
  expect(bad.errors[0].message).toMatch(/^bad entry: /)
})

test('prices: a book’s partial prices need a pricing before them; a house source it cites must be listed', () => {
  const only = buildCatalog([overlay('custom/p.xml', data('pricing', '<prices spell="4"/>'))])
  expect(only.errors.map(e => e.message)).toEqual(expect.arrayContaining(['<prices> changes nothing without a <pricing> loaded first', 'no <pricing> entry; prices will be wrong']))
  const cited = build(overlay('custom/house.xml', data('gear', '<item id="house.thing" kind="gear" source="NOWHERE" page="1"><name>Thing</name><text/></item>')),
    overlay('custom/house2.xml', data('gear', '<item id="house.thing2" kind="gear" source="NOWHERE" page="1"><name>Thing 2</name><text/></item>')))
  expect(cited.errors.map(e => e.message)).toEqual(['source "NOWHERE" isn’t listed in any sources file; treated as not canon', 'source "NOWHERE" isn’t listed in any sources file; treated as not canon'])
  expect(cited.errors.map(e => e.file)).toEqual(['custom/house.xml', 'custom/house2.xml'])
})

test('an imported book’s skill adds specs to the base skill instead of replacing it; a house skill replaces it', () => {
  const skills = build().skills.get('close-combat')!
  const book = data('skills', `<skill id="close-combat" attr="agi" source="BOOK" page="1"><name>Close Combat</name><spec id="close-combat.new-style" attr="agi">New style</spec></skill>`)
  const imported = build(overlay('custom/imported/book/skills.xml', book))
  expect(imported.skills.get('close-combat')!.specs.map(s => s.id)).toEqual([...skills.specs.map(s => s.id), 'close-combat.new-style'])
  const house = build(overlay('custom/skills.xml', book))
  expect(house.skills.get('close-combat')!.specs.map(s => s.id)).toEqual(['close-combat.new-style'])
})

const comp = (source: string): Compendium => ({ id: `id-${source}`, name: source, source, sharing: 'private', updatedAt: '2026-10-02T00:00:00.000Z',
  amps: [], items: [{ id: `${source}.item`, kind: 'gear', name: 'I', text: '', source, page: 1 }], vehicles: [], npcs: [] })

test('a compendium whose source id a book holds does not load; a broken one is reported', () => {
  const c = build(overlay('custom/comp.xml', compendiumXml(comp('TEST'))), overlay('custom/broken.xml', data('compendium', '<x/>')))
  expect(c.errors.map(e => e.file)).toEqual(['custom/comp.xml', 'custom/broken.xml'])
  expect(c.errors[0].message).toContain('its source id TEST is already a book’s or a house source’s')
  expect(c.items.has('TEST.item')).toBe(false)
})

const disk = (path: string) => {
  const file = path.startsWith('data/') ? join('public', path) : path.startsWith('custom/') ? join(MINI, path.slice(7)) : null
  try { return file ? readFileSync(file, 'utf8') : null } catch { return null }
}

test('collectFiles: a missing sources file, the core files found nowhere and the files an index names that are not there', async () => {
  const none = await collectFiles(async () => null)
  expect(none.missing).toEqual(['sources'])
  expect(none.coreMissing.length).toBeGreaterThan(0)
  const files = await collectFiles(async p => (p === 'custom/index.xml' ? '<index><file href="a.xml"/><file href="gone.xml"/></index>' : p === 'custom/a.xml' ? data('gear', '') : null))
  expect(files.missing).toEqual(['sources', 'custom/gone.xml'])
  expect(files.files.map(f => f.file)).toEqual(['custom/a.xml'])
})

test('loadCatalog fetches under its base; the files the server lacks are listed as errors, and a network failure on the data fails the load', async () => {
  vi.stubGlobal('fetch', async (url: string) => {
    const text = disk(url.replace(/^\/app\//, ''))
    return text === null ? { ok: false, text: async () => '' } : { ok: true, text: async () => text }
  })
  const c = await loadCatalog('/app/')
  expect(c.coreMissing).toEqual([])
  expect(c.items.size).toBeGreaterThan(0)
  vi.stubGlobal('fetch', async (url: string) => {
    if (url.includes('index.xml') && url.includes('imported')) return { ok: true, text: async () => '<index><file href="gone.xml"/></index>' }
    const text = disk(url)
    return text === null ? { ok: false, text: async () => '' } : { ok: true, text: async () => text }
  })
  const partial = await loadCatalog('')
  expect(partial.errors).toContainEqual({ file: 'custom/imported/gone.xml', message: 'could not be fetched' })
  vi.stubGlobal('fetch', async () => { throw new Error('offline') })
  await expect(loadCatalog()).rejects.toThrow('offline')
  vi.stubGlobal('fetch', async (url: string) => { if (url.startsWith('data/')) return { ok: false, text: async () => '' }; throw new Error('offline') })
  const lenient = await loadCatalog('')
  expect(lenient.coreMissing.length).toBeGreaterThan(0)
})
