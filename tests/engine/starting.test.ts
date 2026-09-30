// 0.5.3: free starting gear on every runner, the real SIN box, the native language, the order and hidden rows of the
// knowledge lists. Invented values only.
import { expect, test } from 'vitest'
import { appendEvent, currentBuild, finalize, makeKnowledge } from '../../src/engine/career'
import { characterToXml, xmlToCharacter } from '../../src/engine/charxml'
import { derive, knowledgeList } from '../../src/engine/derive'
import { blankCharacter, ensureStartingGear, hasRealSin, parseCharacterFile, serialize, setRealSin } from '../../src/engine/file'
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

test('real SIN: a SINner the player added themselves stays when the box goes off; without the book, only the entry', () => {
  const ch = blankCharacter()
  ch.build.amps = [{ uid: 'mine', catalogId: 'test2.sinner', type: 'quality', name: 'SINner', narrative: '', effects: [] }]
  setRealSin(cat, ch.build, true)
  expect(ch.build.amps.map(a => a.uid)).toEqual(['mine'])
  setRealSin(cat, ch.build, false)
  expect(ch.build.amps.map(a => a.uid)).toEqual(['mine'])
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
  expect(old.ok && old.character.build.knowledge).toEqual([{ name: 'X', kind: 'language' }])
})

test('two lists, A–Z by default; the player’s order and hidden rows persist and never change the price', () => {
  const ch = blankCharacter()
  ch.narrative.keywords = ['Zebra lore', '', '', '', '']
  ch.build.skills = [{ id: 'electronics', rating: 4, specs: [] }]
  ch.build.knowledge = [{ name: 'Toy trains', kind: 'knowledge' }, { name: 'B tongue', kind: 'language' }, { name: 'a tongue', kind: 'language' }]
  const names = (c: Character, kind: 'knowledge' | 'language') => knowledgeList(derive(cat, c).knowledge, kind, c.build.knowledgeOrder).map(r => r.name)
  expect(names(ch, 'knowledge')).toEqual(['Electronics', 'Toy trains', 'Zebra lore'])
  expect(names(ch, 'language')).toEqual(['a tongue', 'B tongue'])
  const cost = price(cat, ch).total
  ch.build.knowledgeOrder = ['keyword:Zebra lore', 'knowledge:Toy trains']
  ch.build.knowledgeHidden = ['skill:electronics']
  expect(names(ch, 'knowledge')).toEqual(['Zebra lore', 'Toy trains', 'Electronics']) // unordered rows follow
  expect(derive(cat, ch).knowledge.filter(r => r.hidden).map(r => r.name)).toEqual(['Electronics'])
  expect(price(cat, ch).total).toBe(cost)
  const back = xmlToCharacter(characterToXml(ch))
  if (!back.ok) throw new Error(back.reason)
  expect([back.character.build.knowledgeOrder, back.character.build.knowledgeHidden]).toEqual([ch.build.knowledgeOrder, ch.build.knowledgeHidden])
})
