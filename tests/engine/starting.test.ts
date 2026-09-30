// 0.5.3: free starting gear on every runner, the real SIN box, the native language, the order and hidden rows of the
// knowledge lists. Invented values only.
import { expect, test } from 'vitest'
import { appendEvent, balance, currentBuild, finalize, makeKnowledge } from '../../src/engine/career'
import { characterToXml, xmlToCharacter } from '../../src/engine/charxml'
import { derive, knowledgeList } from '../../src/engine/derive'
import { blankCharacter, ensureStartingGear, handAddedSinner, hasRealSin, isSinner, parseCharacterFile, serialize, setRealSin } from '../../src/engine/file'
import { buildCatalog } from '../../src/engine/load'
import { price, priceBuild } from '../../src/engine/price'
import { validate } from '../../src/engine/validate'
import type { Character } from '../../src/model/types'
import { cat, catFiles } from '../helpers'

const starting = (ch: Character) => ch.build.items.filter(i => i.starting).map(i => i.starting).sort()
const K = cat.pricing.knowledge

test('a new runner carries a free commlink and fake SIN; adding again adds nothing', () => {
  const ch = blankCharacter()
  expect(starting(ch)).toEqual(['commlink', 'fake-sin'])
  expect(ch.build.items.find(i => i.starting === 'commlink')!.name).toBe('Commlink (with trodes)')
  expect(priceBuild(cat, ch.build, 'human').gear).toBe(0)
  ensureStartingGear(ch.build)
  ensureStartingGear(ch.build)
  expect(ch.build.items).toHaveLength(2)
})

test('an older file gets them on load without changing its price; saving and loading again adds none', () => {
  const ch = blankCharacter()
  ch.build.items = [{ uid: 'it-1', kind: 'gear', name: 'Rope' }, { uid: 'it-2', kind: 'weapon', name: 'Stick' }]
  ch.build.attributes.str = 3
  const before = price(cat, ch).total
  const json = parseCharacterFile(serialize(ch))
  if (!json.ok) throw new Error(json.reason)
  expect(starting(json.character)).toEqual(['commlink', 'fake-sin'])
  expect(price(cat, json.character).total).toBe(before)
  const xml = xmlToCharacter(characterToXml(json.character))
  if (!xml.ok) throw new Error(xml.reason)
  expect(xml.character.build.items).toEqual(json.character.build.items)
})

test('a pregen that lists "Fake SIN, Commlink" as gear ends with exactly one of each, free', () => {
  const ch = blankCharacter()
  ch.build.items = [{ uid: 'it-4', kind: 'gear', name: 'Fake SIN' }, { uid: 'it-5', kind: 'gear', name: 'Commlink' },
    { uid: 'it-6', kind: 'gear', name: 'Commlink', price: 9000 }] // a GM-priced one is a purchase, not the free one
  ensureStartingGear(ch.build)
  expect(ch.build.items.map(i => [i.uid, i.starting])).toEqual([['it-4', 'fake-sin'], ['it-5', 'commlink'], ['it-6', undefined]])
  expect(priceBuild(cat, ch.build, 'human').gear).toBe(9000)
})

test('only exact names become the free entry: "Commlink (Hermes Ikon)" and "Fake SIN (R4 corp)" stay paid', () => {
  const ch = blankCharacter()
  ch.build.items = [{ uid: 'a', kind: 'gear', name: 'Commlink (Hermes Ikon)' }, { uid: 'b', kind: 'gear', name: 'Fake SIN (R4 corp)' },
    { uid: 'c', kind: 'gear', name: '  COMMLINK   with trodes ' }, { uid: 'd', kind: 'gear', name: 'fake  sin' }]
  ensureStartingGear(ch.build)
  expect(ch.build.items.map(i => [i.uid, i.starting])).toEqual([['a', undefined], ['b', undefined], ['c', 'commlink'], ['d', 'fake-sin']])
  const other = blankCharacter()
  other.build.items = [{ uid: 'a', kind: 'gear', name: 'Commlink (Hermes Ikon)' }, { uid: 'b', kind: 'gear', name: 'Commlink (with trodes)' }]
  ensureStartingGear(other.build)
  expect(other.build.items.map(i => [i.uid, i.starting])).toEqual([['start-fake-sin', 'fake-sin'], ['a', undefined], ['b', 'commlink']])
  expect(priceBuild(cat, other.build, 'human').gear).toBe(cat.pricing.equipment)
})

test('a finalized runner’s paid items stay paid; it only gains the free entries, and its receipt and balance hold', () => {
  const draft = blankCharacter()
  draft.build.items = [{ uid: 'it-4', kind: 'gear', name: 'Fake SIN' }, { uid: 'it-5', kind: 'gear', name: 'Commlink' }] // 0.5.2: paid
  draft.build.attributes.str = 3
  const f = finalize(cat, draft)
  const before = { p: price(cat, f), bal: balance(cat, f) }
  const r = xmlToCharacter(characterToXml(f))
  if (!r.ok) throw new Error(r.reason)
  const b = r.character.build
  expect(b.items.map(i => [i.uid, i.starting])).toEqual([['start-fake-sin', 'fake-sin'], ['start-commlink', 'commlink'], ['it-4', undefined], ['it-5', undefined]])
  const p = price(cat, r.character)
  expect(p).toEqual(before.p) // same breakdown, same total: "Left at creation" matches the recorded baseline
  expect(p.attributes + p.skills + p.amps + p.gear + p.spells).toBe(p.total)
  expect(r.character.finalRemaining).toBe(p.remaining)
  expect(balance(cat, r.character)).toBe(before.bal)
})

test('finalized runners keep theirs; starting gear is never flagged as GM-priced', () => {
  const ch = finalize(cat, blankCharacter())
  const r = xmlToCharacter(characterToXml(ch))
  if (!r.ok) throw new Error(r.reason)
  expect(starting({ ...r.character, build: currentBuild(r.character) })).toEqual(['commlink', 'fake-sin'])
  expect(validate(cat, r.character).filter(v => v.path.startsWith('items.'))).toEqual([])
})

test('real SIN: on adds the free Real SIN and the book’s SINner (free, non-canon); off removes both', () => {
  const ch = blankCharacter()
  ch.build.amps = [{ uid: 'q1', type: 'quality', name: 'Lucky', narrative: '', effects: [] }]
  const before = price(cat, ch).total
  setRealSin(cat, ch.build, true)
  setRealSin(cat, ch.build, true)
  expect(hasRealSin(ch.build)).toBe(true)
  expect(ch.build.items.filter(i => i.starting === 'real-sin')).toHaveLength(1)
  const amp = ch.build.amps.filter(a => a.realSin)
  expect(amp.map(a => [a.name, a.catalogId, a.type])).toEqual([['SINner', 'test2.sinner', 'quality']])
  expect(price(cat, ch).total).toBe(before) // free, and Lucky stays the first Quality
  expect(validate(cat, { ...ch, allowNonCanon: false }).some(v => v.code === 'content.nonCanon' && v.message.startsWith('SINner'))).toBe(true)
  const back = xmlToCharacter(characterToXml(ch))
  expect(back.ok && hasRealSin(back.character.build) && back.character.build.amps.some(a => a.realSin)).toBe(true)
  setRealSin(cat, ch.build, false)
  expect(hasRealSin(ch.build)).toBe(false)
  expect(ch.build.amps.map(a => a.uid)).toEqual(['q1'])
})

test('real SIN: a SINner added by hand ticks the box, gets its Real SIN entry on load, no second copy; off removes it', () => {
  const ch = blankCharacter()
  const mine = { uid: 'mine', catalogId: 'test2.sinner', type: 'quality', name: 'SINner', narrative: '', effects: [] }
  ch.build.amps = [mine]
  expect(hasRealSin(ch.build, cat)).toBe(true)
  expect(handAddedSinner(ch.build, cat).map(a => a.uid)).toEqual(['mine'])
  const loaded = xmlToCharacter(characterToXml(ch)) // the free entry comes on load
  if (!loaded.ok) throw new Error(loaded.reason)
  expect(loaded.character.build.items.filter(i => i.starting === 'real-sin')).toHaveLength(1)
  setRealSin(cat, ch.build, true)
  expect(ch.build.amps.map(a => a.uid)).toEqual(['mine'])
  expect(ch.build.items.filter(i => i.starting === 'real-sin')).toHaveLength(1)
  setRealSin(cat, ch.build, false) // the UI asks first: handAddedSinner
  expect([ch.build.amps.length, hasRealSin(ch.build, cat)]).toEqual([0, false])
  // found by catalog entry even when renamed and without a snapshot
  ch.build.amps = [{ ...mine, name: 'Paper citizen' }]
  expect([hasRealSin(ch.build), hasRealSin(ch.build, cat)]).toEqual([false, true])
})

test('real SIN: only a quality named exactly "SINner" (any case) counts', () => {
  const amp = (name: string) => ({ uid: name, type: 'quality', name, narrative: '', effects: [] })
  expect(['SINner', 'sinner', ' SINNER '].map(n => isSinner(amp(n)))).toEqual([true, true, true])
  expect(['SINner (national)', 'Not a SINner', 'SIN'].map(n => isSinner(amp(n)))).toEqual([false, false, false])
})

test('order and hidden marks belong to each entry: duplicates stay independent; old name keys move to ids', () => {
  const ch = blankCharacter()
  ch.build.knowledge = [{ id: 'x1', name: 'Twin', kind: 'knowledge' }, { id: 'x2', name: 'Twin', kind: 'knowledge' }]
  ch.build.knowledgeHidden = ['x2']
  expect(derive(cat, ch).knowledge.map(r => [r.key, r.hidden])).toEqual([['x1', false], ['x2', true]])
  // a file saved with the earlier "<kind>:<name>" keys
  const old = { ...blankCharacter(), build: { ...blankCharacter().build,
    knowledge: [{ name: 'Twin', kind: 'knowledge' }, { name: 'Twin', kind: 'knowledge' }, { name: 'Solo', kind: 'language' }],
    knowledgeOrder: ['language:Solo', 'knowledge:Twin', 'skill:x'], knowledgeHidden: ['knowledge:Twin'] } }
  const r = parseCharacterFile(JSON.stringify(old))
  if (!r.ok) throw new Error(r.reason)
  expect(r.character.build.knowledge.map(k => k.id)).toEqual(['k0', 'k1', 'k2'])
  expect([r.character.build.knowledgeOrder, r.character.build.knowledgeHidden]).toEqual([['k2', 'k0', 'skill:x'], ['k0']])
  const back = xmlToCharacter(characterToXml(r.character))
  expect(back.ok && back.character.build).toEqual(r.character.build)
})

test('real SIN: without the book, only the entry', () => {
  const noBook = buildCatalog(catFiles.filter(f => !f.file.includes('test2/amps.xml')))
  const other = blankCharacter()
  setRealSin(noBook, other.build, true)
  expect([hasRealSin(other.build), other.build.amps.length]).toEqual([true, 0])
})

test('native language: one is free; a second native one is paid and noted', () => {
  const ch = blankCharacter()
  ch.build.knowledge = [{ name: 'Made-up tongue', kind: 'language', native: true }, { name: 'Other tongue', kind: 'language' }]
  const cost = () => priceBuild(cat, ch.build, 'human', ch.narrative.keywords).skills
  expect(cost()).toBe(K)
  expect(derive(cat, ch).knowledge.map(r => [r.name, r.paid, r.source])).toEqual([
    ['Made-up tongue', false, 'Free: native language'], ['Other tongue', true, 'Paid']])
  ch.build.knowledge[1].native = true
  expect(cost()).toBe(K)
  expect(derive(cat, ch).knowledge[1].source).toBe('Paid (a second native language)')
  expect(validate(cat, ch).find(v => v.code === 'knowledge.native')?.message).toContain('“Other tongue”')
  ch.build.knowledge[0].kind = 'knowledge' // a native mark counts on a language only
  expect(cost()).toBe(K)
})

test('native survives a career rename of its free slot; old files have none (prices unchanged)', () => {
  const ch = blankCharacter()
  ch.narrative.keywords = ['Tongue', '', '', '', '']
  ch.build.knowledge = [{ name: 'Tongue', kind: 'language', from: 'keyword:Tongue', native: true }]
  const f = finalize(cat, ch)
  const after = appendEvent(f, makeKnowledge(cat, { name: 'Tongue', kind: 'language', from: 'keyword:Tongue' }, false))
  expect(currentBuild(after).knowledge[0].native).toBe(true)
  const old = parseCharacterFile(JSON.stringify({ ...blankCharacter(), build: { ...blankCharacter().build, knowledge: ['Language: X'] } }))
  expect(old.ok && old.character.build.knowledge).toEqual([{ id: 'k0', name: 'X', kind: 'language' }])
})

test('two lists, A–Z by default; the player’s order and hidden rows persist and never change the price', () => {
  const ch = blankCharacter()
  ch.narrative.keywords = ['Zebra lore', '', '', '', '']
  ch.build.skills = [{ id: 'electronics', rating: 4, specs: [] }]
  ch.build.knowledge = [{ id: 't', name: 'Toy trains', kind: 'knowledge' }, { id: 'b', name: 'B tongue', kind: 'language' }, { id: 'a', name: 'a tongue', kind: 'language' }]
  const names = (c: Character, kind: 'knowledge' | 'language') => knowledgeList(derive(cat, c).knowledge, kind, c.build.knowledgeOrder).map(r => r.name)
  expect(names(ch, 'knowledge')).toEqual(['Electronics', 'Toy trains', 'Zebra lore'])
  expect(names(ch, 'language')).toEqual(['a tongue', 'B tongue'])
  const cost = price(cat, ch).total
  ch.build.knowledgeOrder = ['keyword:Zebra lore', 't']
  ch.build.knowledgeHidden = ['skill:electronics']
  expect(names(ch, 'knowledge')).toEqual(['Zebra lore', 'Toy trains', 'Electronics']) // unordered rows follow
  expect(derive(cat, ch).knowledge.filter(r => r.hidden).map(r => r.name)).toEqual(['Electronics'])
  expect(price(cat, ch).total).toBe(cost)
  const back = xmlToCharacter(characterToXml(ch))
  if (!back.ok) throw new Error(back.reason)
  expect([back.character.build.knowledgeOrder, back.character.build.knowledgeHidden]).toEqual([ch.build.knowledgeOrder, ch.build.knowledgeHidden])
})
