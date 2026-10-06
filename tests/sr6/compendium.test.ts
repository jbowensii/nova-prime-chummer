// The SR6 compendium file (src/sr6/engine/compendium.ts, public/data/sr6/schema/compendium.xsd): made-up entries and the
// S3 grunt round-trip and validate; the other game's files and runners, creation-structure kinds and foreign entries are
// refused; COMP_KINDS stays equal to common.xsd; copies keep stats and drop the description. No book data.
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { validateXML } from 'xmllint-wasm'
import { compendiumXml } from '../../src/engine'
import { blankSr6Entry, COMP_KINDS, copySr6Entry, entryProblem, fieldRule, newEntryId, readSr6Compendium, sr6CompendiumSource, sr6CompendiumXml } from '../../src/sr6/engine/compendium'
import { sr6ToXml, xmlToSr6 } from '../../src/sr6/engine/charxml'
import { sr6EntryXml } from '../../src/sr6/engine/load'
import { DISPLAY_KINDS, SR6_KINDS, type Sr6Compendium, type Sr6Entry, type Sr6Kind } from '../../src/sr6/model/types'
import type { Sr6Character } from '../../src/sr6/model/character'
import { fixtureCatalog } from './fixture'

const SCHEMA = 'public/data/sr6/schema/'
const schema = (f: string) => ({ fileName: f, contents: readFileSync(SCHEMA + f, 'utf8') })
const valid = async (xml: string) => (await validateXML({ xml: { fileName: 'c.xml', contents: xml }, schema: schema('compendium.xsd'),
  preload: [schema('common.xsd'), schema('character.xsd')] })).errors.map(e => e.message)

const grunt = (() => { const r = xmlToSr6(readFileSync('tests/fixtures/sr6/npc-grunt.xml', 'utf8')); if (!r.ok) throw new Error(r.reason); return r.character })()
const at = { source: 'STREET', page: 3 }
const entry = (kind: Sr6Kind, id: string, name: string, attrs: Record<string, string>, parts: Sr6Entry['parts'] = [], text = ''): Sr6Entry =>
  ({ id, kind, name, ...at, attrs, parts, text })
const kit: Sr6Compendium = {
  id: '0123456789ab', name: 'Street Kit', source: 'STREET', sharing: 'campaign', campaign: 'abcdef012345', rev: 2, updatedAt: '2026-10-04T00:00:00.000Z',
  entries: [
    entry('weapons', 'street.zap-stick', 'Zap Stick', { category: 'Clubs', dv: '3S', modes: 'SS', cost: '120' }, [], 'Our own words & <tags>.'),
    entry('spells', 'street.glimmer', 'Glimmer', { category: 'illusion', range: 'LOS', type: 'M', duration: 'S', dv: '2' }, [], 'Shiny.'),
    entry('spirits', 'street.gutter-spirit', 'Gutter Spirit', { category: 'Alley', bod: 'F+1', agi: 'F', init: 'F×2 + 2D6' },
      [{ tag: 'skills', attrs: {}, text: 'Astral 4, Fumbling 2' }, { tag: 'powers', attrs: {}, text: 'Glow, Hum' }]),
    entry('qualities', 'street.lucky-socks', 'Lucky Socks', { kind: 'positive', karma: '7' }),
  ],
  npcs: [grunt],
}
const read = (xml: string) => { const r = readSr6Compendium(xml); if (!r.ok) throw new Error(r.error); return r.compendium }

test('a compendium round-trips and validates against compendium.xsd', async () => {
  const xml = sr6CompendiumXml(kit)
  expect(read(xml)).toEqual(kit)
  expect(xml).toContain('<text>Our own words &amp; &lt;tags&gt;.</text>') // its own text is written
  expect(xml).not.toMatch(/owner/)
  expect(await valid(xml)).toEqual([])
  const priv = { ...kit, sharing: 'private' as const, campaign: undefined, rev: undefined, npcs: [] }
  expect(read(sr6CompendiumXml(priv))).toEqual(priv)
  expect(sr6CompendiumXml(priv)).not.toContain('campaign=')
  expect(await valid(sr6CompendiumXml(priv))).toEqual([])
  expect(await valid(xml.replace('sharing="campaign"', 'sharing="world"'))).not.toEqual([])
  expect(await valid(xml.replace('<weapon ', '<skill attr="agi" untrained="true" ').replace('</weapon>', '</skill>'))).not.toEqual([])
})

test('the catalog source a compendium cites: a house source of its owner, marked as the compendium', () => {
  expect(sr6CompendiumSource({ ...kit, owner: 'gil', ownerName: 'Gil' })).toEqual({ id: 'STREET', name: 'Street Kit', publisher: 'Gil',
    canon: false, origin: 'user', compendium: { id: kit.id, owner: 'gil', campaign: 'abcdef012345' } })
  // the campaign only while it is shared with one
  expect(sr6CompendiumSource({ ...kit, sharing: 'table', owner: 'gil' }).compendium).toEqual({ id: kit.id, owner: 'gil' })
})

test('refused: wrong root, kind or namespace; the other game’s file or runner; another source; creation kinds; foreign or unknown parts', () => {
  const xml = sr6CompendiumXml(kit)
  const noNpc: Sr6Character = { ...grunt, npc: undefined }
  const ca2Npc = '<ca2:character xmlns:ca2="urn:chummer-anarchy2:character:1" formatVersion="1" id="n2" streetName="Goon" updatedAt="x"><npc kind="grunt"/><build/></ca2:character>'
  const bad: [string, string | RegExp][] = [
    ['not xml', 'Not valid XML.'],
    ['<nope/>', /Not an SR6 compendium/],
    [xml.replace('kind="compendium"', 'kind="weapons"'), /Not an SR6 compendium/],
    [xml.replace('urn:chummer-sr6:data:1', 'urn:chummer-sr6:character:1'), /Not an SR6 compendium/],
    [compendiumXml({ id: kit.id, name: 'Anarchy kit', source: 'STREET', sharing: 'private', updatedAt: 'x', amps: [], items: [], vehicles: [], npcs: [] }), /Shadowrun Anarchy compendium/],
    [xml.replace('id="0123456789ab"', 'id="../x"'), /no id or name/],
    [xml.replace('source="STREET" sharing', 'source="street" sharing'), /isn’t a valid source id/],
    [xml.replace('sharing="campaign"', 'sharing="world"'), /Unknown sharing/],
    [xml.replace(/(id="street\.zap-stick" )source="STREET"/, '$1source="CRB"'), /cites "CRB"/],
    [xml.replace('<weapon id="street.zap-stick" source="STREET" page="3"', '<weapon id="street.zap-stick" source="STREET" page="0"'), /page/],
    [xml.replace('</sr6:data>', '<skill id="street.x" source="STREET" page="1" attr="agi" untrained="true"><name>X</name></skill></sr6:data>'), /<skill> can’t be in a compendium/],
    [xml.replace('</sr6:data>', '<priority id="street.p" source="STREET" page="1" letter="A"><name>P</name></priority></sr6:data>'), /<priority> can’t be in a compendium/],
    [xml.replace('</sr6:data>', '<rule id="street.r" source="STREET" page="1" chapter="1" level="1"><name>R</name></rule></sr6:data>'), /<rule> can’t be in a compendium/],
    [sr6CompendiumXml({ ...kit, npcs: [noNpc] }), /has no <npc> block/],
    [xml.replace('</sr6:data>', `${ca2Npc}</sr6:data>`), /Shadowrun Anarchy/],
    [xml.replace('</sr6:data>', '<x:weapon xmlns:x="urn:chummer-anarchy2:data:1" id="street.y" source="STREET" page="1" category="C"><name>Y</name></x:weapon></sr6:data>'), /can’t be in a compendium/],
    [xml.replace('<name>Zap Stick</name>', '<name>Zap Stick</name><skills>Sneaky 3</skills>'), /<skills> isn’t a part of/],
    [xml.replace('<name>Lucky Socks</name>', `<name>Lucky Socks</name>${ca2Npc}`), /isn’t a part of/],
    [xml.replace('category="Clubs"', 'category="Clubs" sharp="yes"'), /sharp/],
  ]
  for (const [b, why] of bad) {
    const r = readSr6Compendium(b)
    expect(r.ok, b.slice(0, 300)).toBe(false)
    if (!r.ok) expect(r.error).toMatch(why)
  }
})

test('COMP_KINDS: every kind but the creation-structure ones, each with common.xsd’s attribute names and string children', () => {
  const XS = 'http://www.w3.org/2001/XMLSchema'
  // (and the kinds only listed as printed: DISPLAY_KINDS)
  const left = ['priorities', 'metatypes', 'attributes', 'skills', 'grades', 'lifemodules', 'rules', ...DISPLAY_KINDS]
  expect(Object.keys(COMP_KINDS)).toEqual(Object.keys(SR6_KINDS).filter(k => !left.includes(k)))
  const common = new DOMParser().parseFromString(readFileSync(SCHEMA + 'common.xsd', 'utf8'), 'text/xml')
  const types = new Map([...common.documentElement.children].filter(t => t.localName === 'complexType').map(t => [t.getAttribute('name'), t]))
  /** Descendants of `t` named `name`, not inside a nested element definition. */
  const own = (t: Element, name: string) => [...t.getElementsByTagNameNS(XS, name)].filter(d => {
    for (let p = d.parentElement; p && p !== t; p = p.parentElement) if (p.localName === 'element') return false
    return true
  })
  for (const [kind, want] of Object.entries(COMP_KINDS)) {
    const tag = SR6_KINDS[kind as Sr6Kind].tag
    const file = new DOMParser().parseFromString(readFileSync(`${SCHEMA}${kind}.xsd`, 'utf8'), 'text/xml')
    const type = [...file.getElementsByTagNameNS(XS, 'element')].find(e => e.getAttribute('name') === tag)!.getAttribute('type')!.replace('sr6:', '')
    const t = types.get(type)!
    expect([kind, want.fields]).toEqual([kind, own(t, 'attribute').map(a => a.getAttribute('name'))])
    const lines = own(t, 'element').filter(e => e.getAttribute('type') === 'xs:string' && e.getAttribute('name') !== 'name').map(e => e.getAttribute('name'))
    expect([kind, want.lines ?? []]).toEqual([kind, lines])
  }
})

test('fieldRule: the required attributes, fixed choices and whole numbers common.xsd sets for each compendium kind', () => {
  const XS = 'http://www.w3.org/2001/XMLSchema'
  const common = new DOMParser().parseFromString(readFileSync(SCHEMA + 'common.xsd', 'utf8'), 'text/xml')
  const types = new Map([...common.documentElement.children].filter(t => t.localName === 'complexType').map(t => [t.getAttribute('name'), t]))
  const WHOLE: Record<string, string> = { 'xs:integer': 'any', 'xs:positiveInteger': 'positive', 'xs:nonNegativeInteger': 'nonNegative' }
  for (const kind of Object.keys(COMP_KINDS) as Sr6Kind[]) {
    const tag = SR6_KINDS[kind].tag
    const file = new DOMParser().parseFromString(readFileSync(`${SCHEMA}${kind}.xsd`, 'utf8'), 'text/xml')
    const t = types.get([...file.getElementsByTagNameNS(XS, 'element')].find(e => e.getAttribute('name') === tag)!.getAttribute('type')!.replace('sr6:', ''))!
    for (const a of [...t.getElementsByTagNameNS(XS, 'attribute')]) {
      const name = a.getAttribute('name')!, type = a.getAttribute('type') ?? ''
      const choices = type === 'sr6:True' ? ['true'] : [...a.getElementsByTagNameNS(XS, 'enumeration')].map(x => x.getAttribute('value')!)
      const want = { ...a.getAttribute('use') === 'required' ? { required: true } : {}, ...choices.length ? { choices } : {}, ...WHOLE[type] ? { whole: WHOLE[type] } : {} }
      expect([kind, name, fieldRule(kind, name)]).toEqual([kind, name, want])
    }
  }
})

test('entryProblem: what keeps a form entry from validating; with the required values set, every kind’s blank entry validates', async () => {
  const c = fixtureCatalog(), to = { ...kit, entries: [], npcs: [] }
  const gun = blankSr6Entry(c, 'weapons', to, 'Pop Gun')
  expect(entryProblem(gun)).toBe('Fill in category.')
  expect(entryProblem({ ...gun, name: ' ' })).toBe('Enter a name.')
  expect(entryProblem({ ...gun, attrs: { ...gun.attrs, category: 'Poppers' } })).toBe('')
  const charm = blankSr6Entry(c, 'qualities', to, 'Charm')
  expect(entryProblem({ ...charm, attrs: { kind: 'lucky' } })).toBe('kind is one of: positive, negative.')
  expect(entryProblem({ ...charm, attrs: { kind: 'positive', karma: 'lots' } })).toBe('karma is a whole number.')
  expect(entryProblem({ ...charm, attrs: { kind: 'negative', karma: '-3', maxLevel: '0' } })).toBe('maxLevel is a whole number, 1 or more.')
  expect(entryProblem({ ...blankSr6Entry(c, 'npcs', to, 'Goon'), attrs: { rating: 'two' } })).toBe('rating is a whole number, 0 or more.')
  const all = (Object.keys(COMP_KINDS) as Sr6Kind[]).map(kind => {
    const e = blankSr6Entry(c, kind, to, `Made-up ${kind}`)
    for (const f of Object.keys(e.attrs)) { const r = fieldRule(kind, f); if (r.required) e.attrs[f] = r.choices?.[0] ?? 'Made-up' }
    e.parts = e.parts.map((p, i) => i % 2 ? p : { ...p, text: 'Made-up line' })
    expect([kind, entryProblem(e)]).toEqual([kind, ''])
    return e
  })
  expect(await valid(sr6CompendiumXml({ ...to, entries: all }))).toEqual([])
})

test('copySr6Entry: a new id under the compendium’s source, page 1, no description, stats kept; a second copy gets -2', () => {
  const c = fixtureCatalog()
  const book = [...c.entries.weapons.values()].find(e => e.source === 'CRB')!
  const withText: Sr6Entry = { ...book, text: 'The book’s words.', edited: true, by: 'ada' }
  const to: Sr6Compendium = { ...kit, entries: [] }
  const one = copySr6Entry(c, withText, to)
  expect(one.id).toMatch(/^street\./)
  expect(one).toEqual({ id: one.id, kind: 'weapons', name: book.name, source: 'STREET', page: 1, attrs: book.attrs, parts: [], text: '' })
  expect('edited' in one || 'by' in one).toBe(false)
  expect(one.attrs).not.toBe(book.attrs) // a copy, not shared
  expect(c.entries.weapons.get(book.id)).toBe(book) // the book's entry is untouched
  const two = copySr6Entry(c, withText, { ...to, entries: [one] })
  expect(two.id).toBe(`${one.id}-2`)
  // an id the catalog already holds in that kind is never reused
  c.entries.weapons.set(`${one.id}-3`, { ...book, id: `${one.id}-3` })
  expect(copySr6Entry(c, withText, { ...to, entries: [one, two] }).id).toBe(`${one.id}-4`)
  // a spirit keeps its stat block and lines, and the copy is a valid compendium entry
  const spirit = { ...[...c.entries.spirits.values()][0], text: 'Book words.' }
  const sp = copySr6Entry(c, spirit, to)
  expect([sp.attrs, sp.parts, sp.text, sp.page]).toEqual([spirit.attrs, spirit.parts, '', 1])
  expect(sp.parts).not.toBe(spirit.parts)
  expect(read(sr6CompendiumXml({ ...to, entries: [one, sp] })).entries).toEqual([one, sp])
  expect(() => copySr6Entry(c, [...c.entries.skills.values()][0], to)).toThrow()
})

test('newEntryId and blankSr6Entry', () => {
  const c = fixtureCatalog()
  expect(newEntryId(c, 'qualities', kit, 'Lucky Socks!')).toBe('street.lucky-socks-2')
  expect(newEntryId(c, 'weapons', kit, 'Lucky Socks')).toBe('street.lucky-socks') // another kind
  expect(newEntryId(c, 'gear', kit, '***')).toBe('street.entry')
  expect(blankSr6Entry(c, 'spirits', kit, 'Dust Devil')).toEqual({ id: 'street.dust-devil', kind: 'spirits', name: 'Dust Devil', source: 'STREET', page: 1,
    attrs: Object.fromEntries(COMP_KINDS.spirits!.fields.map(f => [f, ''])), parts: COMP_KINDS.spirits!.lines!.map(tag => ({ tag, attrs: {}, text: '' })), text: '' })
  expect(blankSr6Entry(c, 'echoes', kit, 'Hum').attrs).toEqual({})
})

test('sr6EntryXml is unchanged for the edits layer (empty <text/>); the compendium writes the text and leaves out what is unset', () => {
  const e = kit.entries[0]
  expect(sr6EntryXml(e)).toBe('<weapon id="street.zap-stick" source="STREET" page="3" category="Clubs" dv="3S" modes="SS" cost="120"><name>Zap Stick</name><text/></weapon>')
  expect(sr6EntryXml(e, true)).toBe('<weapon id="street.zap-stick" source="STREET" page="3" category="Clubs" dv="3S" modes="SS" cost="120"><name>Zap Stick</name><text>Our own words &amp; &lt;tags&gt;.</text></weapon>')
  const blank = blankSr6Entry(fixtureCatalog(), 'spirits', kit, 'Dust Devil')
  const back = read(sr6CompendiumXml({ ...kit, entries: [{ ...blank, attrs: { ...blank.attrs, bod: '2' } }], npcs: [] })).entries[0]
  expect(back).toEqual({ ...blank, attrs: { bod: '2' }, parts: [] })
  // the NPC is written as sr6ToXml writes it, <npc> first
  expect(sr6CompendiumXml(kit)).toContain(sr6ToXml(grunt).replace(/^<\?xml[^>]*\?>\s*/, '').trimEnd())
})
