// Anarchy runner files (src/engine/charxml.ts): the reader's refusals, its defaults for a sparse file, every kind of ledger
// event through the file, and what repair drops. Invented runners.
import { expect, test } from 'vitest'
import { badCharAt, characterToXml, each, need, readDoc, xmlToCharacter } from '../../src/engine/charxml'
import { blankCharacter } from '../../src/engine/file'
import type { CareerEvent, Character } from '../../src/model/types'
import { cat } from '../helpers'

const NS = 'xmlns:ca2="urn:chummer-anarchy2:character:1"'
const doc = (root: string, body = '<build><attributes str="2" agi="2" wil="2" log="2" cha="2"/></build>') =>
  `<ca2:character ${NS} formatVersion="1" ${root}>${body}</ca2:character>`

test('refusals say what is wrong: no version, no id, no build, a Shadowrun 6 file, another namespace', () => {
  expect(xmlToCharacter(`<ca2:character ${NS} id="a"><build/></ca2:character>`)).toEqual({ ok: false, reason: 'The <character> element has no formatVersion.' })
  expect(xmlToCharacter(doc('metatype="elf"'))).toEqual({ ok: false, reason: 'The <character> element has no id.' })
  expect(xmlToCharacter(doc('id="a"', ''))).toEqual({ ok: false, reason: 'The file has no <build> element.' })
  expect(xmlToCharacter('<sr6:character xmlns:sr6="urn:chummer-sr6:character:1"/>')).toMatchObject({
    ok: false,
    reason: expect.stringContaining('Shadowrun 6'),
  })
  expect(xmlToCharacter('<character/>')).toEqual({ ok: false, reason: 'Not a Nova Prime Chummer Anarchy 2.0 character file.' })
})

test('a sparse file reads with defaults: attributes at 1, level runner, package free, no ledger', () => {
  const r = xmlToCharacter(doc('id="a"', '<build/>'))
  if (!r.ok) throw new Error(r.reason)
  expect(r.character).toMatchObject({ id: 'a', level: 'runner', package: 'free', career: [], overrides: [] })
  expect(r.character.build.attributes).toEqual({ str: 1, agi: 1, wil: 1, log: 1, cha: 1 })
  expect(r.character.identity).toMatchObject({ name: '', streetName: '', metatype: '' })
  expect(r.character.updatedAt).toMatch(/^\d{4}-/)
  expect(r.character.build.skills).toEqual([])
})

test('a skill with no id or rating reads as an empty skill; amps and items with no name read as unnamed', () => {
  const r = xmlToCharacter(doc('id="a"', '<build><skill/><amp uid="a1" type="equipment"/><item uid="i1" kind="gear"/></build>'))
  if (!r.ok) throw new Error(r.reason)
  expect(r.character.build.skills).toEqual([{ id: '', rating: 0, specs: [] }])
  expect(r.character.build.amps[0]).toMatchObject({ uid: 'a1', name: '', effects: [] })
  expect(r.character.build.items.find(i => i.uid === 'i1')).toMatchObject({ uid: 'i1', name: '' })
})

test('the knowledge order and hidden keys, optional rules, overrides and an amp’s effect flags survive the file', () => {
  const ch = blankCharacter()
  ch.build.knowledgeOrder = ['k:1', 'k:2']
  ch.build.knowledgeHidden = ['k:3']
  ch.optionalRules = { 'test.optional-long-haggles': true, other: false }
  ch.overrides = [{ code: 'x.y', path: 'p', note: 'GM ok' }]
  ch.build.amps = [
    { uid: 'a', type: 'equipment', name: 'Odd', narrative: '', effects: [{ ref: 'rr-spec', param: 'p', value: 2, note: 'n', unpriced: true }], realSin: true },
  ]
  const back = xmlToCharacter(characterToXml(ch))
  if (!back.ok) throw new Error(back.reason)
  expect(back.character.build.knowledgeOrder).toEqual(['k:1', 'k:2'])
  expect(back.character.build.knowledgeHidden).toEqual(['k:3'])
  expect(back.character.optionalRules).toEqual({ 'test.optional-long-haggles': true, other: false })
  expect(back.character.overrides).toEqual(ch.overrides)
  expect(back.character.build.amps[0]).toMatchObject({ realSin: true, effects: [{ ref: 'rr-spec', param: 'p', value: 2, note: 'n', unpriced: true }] })
})

const amp = (uid: string) => ({ uid, type: 'equipment', name: uid, narrative: '', effects: [] })
const EVENTS: CareerEvent[] = [
  { id: 'e1', at: 't', type: 'earn', amount: 12, run: 'A run', date: '2026-10-01' },
  { id: 'e2', at: 't', type: 'finalize', remaining: 40, prices: { 'skill:stealth': 8 } },
  {
    id: 'e3',
    at: 't',
    type: 'change',
    cost: 4,
    prices: { 'attr:agi': 12 },
    changes: [
      { key: 'attr:agi', label: 'Finesse', from: '2', to: '3' },
      { key: 'item:x', label: 'Knife', to: '' },
      { key: 'item:y', label: 'Rope', from: '' },
    ],
  },
  { id: 'e4', at: 't', type: 'advance', path: 'skills.stealth', from: 2, to: 3, cost: 5 },
  { id: 'e5', at: 't', type: 'buy', cost: 7, item: { uid: 'i1', kind: 'gear', name: 'Rope' } },
  { id: 'e6', at: 't', type: 'sell', itemUid: 'i1' },
  { id: 'e7', at: 't', type: 'amp-add', cost: 6, amp: amp('a1') },
  { id: 'e8', at: 't', type: 'amp-modify', ampUid: 'a1', cost: 2, before: amp('a1'), after: { ...amp('a1'), name: 'Changed' } },
  { id: 'e9', at: 't', type: 'spec-add', skill: 'stealth', spec: 'custom:Sneaking', cost: 3 },
  { id: 'e10', at: 't', type: 'knowledge-add', name: 'Maps', kind: 'knowledge', from: 'slot:1', cost: 0 },
  { id: 'e11', at: 't', type: 'note', text: 'A <note> & more' },
  { id: 'e12', at: 't', type: 'void', eventId: 'e4', reason: 'oops' },
]

test('every kind of ledger event survives the file exactly', () => {
  const ch: Character = { ...blankCharacter(), career: EVENTS }
  const back = xmlToCharacter(characterToXml(ch))
  if (!back.ok) throw new Error(back.reason)
  expect(back.character.career).toEqual(EVENTS)
})

test('a ledger event the reader does not know is an error naming it; repair drops it and says so', () => {
  const body = '<build/><career><event id="e1" at="t" type="mystery"/><event id="e2" at="t" type="note"><text>kept</text></event><event/></career>'
  const strict = xmlToCharacter(doc('id="a"', body))
  expect(strict).toEqual({ ok: false, reason: 'Couldn’t read career event 1 (mystery): unknown type "mystery".' })
  const fix: string[] = []
  const r = xmlToCharacter(doc('id="a"', body), { repair: fix })
  if (!r.ok) throw new Error(r.reason)
  expect(r.character.career).toEqual([{ id: 'e2', at: 't', type: 'note', text: 'kept' }])
  expect(fix).toEqual(['Dropped career event 1 (mystery): unknown type "mystery".', 'Dropped career event 3 (no type): unknown type "null".'])
})

test('a buy without its item is an error naming where; repair drops the event; an amp-modify needs both sides', () => {
  expect(xmlToCharacter(doc('id="a"', '<build/><career><event id="e" at="t" type="buy" cost="1"/></career>'))).toEqual({
    ok: false,
    reason: 'Couldn’t read career event 1 (buy): no <item> inside <event>.',
  })
  expect(xmlToCharacter(doc('id="a"', '<build/><career><event id="e" at="t" type="amp-modify" ampUid="a" cost="1"><before/></event></career>'))).toEqual({
    ok: false,
    reason: 'Couldn’t read career event 1 (amp-modify): no <amp> inside <before>.',
  })
  expect(() => need(undefined, 'x', 'y')).toThrow('no <x> inside <y>')
})

test('each: a failure names the element (name, id, uid or position); with a list to fix it is dropped instead', () => {
  const dom = new DOMParser().parseFromString('<r><e name="A"/><e id="B"/><e uid="C"/><e/></r>', 'text/xml')
  const els = [...dom.documentElement.children]
  const label = (e: Element, i: number) => `<${e.localName}> ${e.getAttribute('name') || e.getAttribute('id') || e.getAttribute('uid') || i + 1}`
  const boom = () => {
    throw new Error('bad')
  }
  expect(() => each(els, boom, label)).toThrow('<e> A: bad')
  const fix: string[] = []
  expect(each(els, boom, label, fix)).toEqual([])
  expect(fix).toEqual(['Dropped <e> A: bad.', 'Dropped <e> B: bad.', 'Dropped <e> C: bad.', 'Dropped <e> 4: bad.'])
  expect(each(els, e => e.localName, label)).toEqual(['e', 'e', 'e', 'e'])
})

test('a character XML can’t hold is refused saying where; repair removes it and escapes a stray ampersand', () => {
  const xml = `<?xml version="1.0"?>\n<root>\n  <a>\n    <b>ok\u0001</b>\n  </a>\n</root>`
  expect(badCharAt(xml)).toBe('Line 4, column 10, in <b>: character U+0001 isn’t allowed in XML.')
  expect(badCharAt('<r>fine</r>')).toBeNull()
  expect(badCharAt('\u0002<r/>')).toBe('Line 1, column 1: character U+0002 isn’t allowed in XML.')
  expect(badCharAt('<r><s/><t>\u0003</t></r>')).toContain('in <t>')
  expect(readDoc(xml)).toEqual({ ok: false, reason: `Not valid XML. ${badCharAt(xml)}` })
  const fix: string[] = []
  const repaired = readDoc('<r>a & b \u0001\u0001</r>', fix)
  expect(repaired.ok && repaired.root.textContent).toBe('a & b ')
  expect(fix).toEqual(['Removed 2 characters XML can’t hold (U+0001).', 'Escaped 1 stray “&”.'])
  const one: string[] = []
  readDoc('<r>\u0001</r>', one)
  expect(one).toEqual(['Removed 1 character XML can’t hold (U+0001).'])
  expect(readDoc('<r>').ok).toBe(false)
  expect(readDoc('<r><x></r>')).toMatchObject({ ok: false, reason: expect.stringMatching(/^Not valid XML/) })
})

test('the catalog’s made-up amps round trip as snapshots with their chassis', () => {
  const ch = blankCharacter()
  const t = cat.amps.get('test.sky-runner')!
  ch.build.amps = [{ uid: 'v', catalogId: t.id, type: t.type, name: t.name, narrative: '', effects: t.effects, snapshot: t, vehicle: 'veh' }]
  const back = xmlToCharacter(characterToXml(ch))
  expect(back.ok && back.character.build.amps[0].snapshot?.id).toBe('test.sky-runner')
  expect(back.ok && back.character.build.amps[0].vehicle).toBe('veh')
})
