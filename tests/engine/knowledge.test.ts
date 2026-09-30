import { expect, test } from 'vitest'
import { appendEvent, balance, currentBuild, finalize, makeKnowledge } from '../../src/engine/career'
import { characterToXml, xmlToCharacter } from '../../src/engine/charxml'
import { derive } from '../../src/engine/derive'
import { blankCharacter, parseCharacterFile } from '../../src/engine/file'
import { priceBuild } from '../../src/engine/price'
import { validate } from '../../src/engine/validate'
import type { Character } from '../../src/model/types'
import { cat, legacy } from '../helpers'

const K = cat.pricing.knowledge

/** Made-up runner: two keywords, Electronics 5, Athletics 2, one paid knowledge skill and one language. */
function runner(): Character {
  const ch = blankCharacter()
  ch.narrative.keywords = ['Tinkerer', '', 'Night owl', '', '']
  ch.build.skills = [{ id: 'electronics', rating: 5, specs: [] }, { id: 'athletics', rating: 2, specs: [] }]
  ch.build.knowledge = [{ id: 'k0', name: 'Toy trains', kind: 'knowledge' }, { id: 'k1', name: 'Made-up tongue', kind: 'language' }]
  return ch
}
const skillsCost = (ch: Character) => priceBuild(cat, ch.build, 'human', ch.narrative.keywords).skills

test('keywords and skills at 4+ are free entries; only the others cost', () => {
  const ch = runner()
  const rows = derive(cat, ch).knowledge
  expect(rows.map(r => [r.name, r.kind, r.source, r.paid])).toEqual([
    ['Tinkerer', 'knowledge', 'Free: keyword', false],
    ['Night owl', 'knowledge', 'Free: keyword', false],
    ['Electronics', 'knowledge', 'Free: Electronics 4+', false],
    ['Toy trains', 'knowledge', 'Paid', true],
    ['Made-up tongue', 'language', 'Paid', true],
  ])
  const before = skillsCost(ch)
  ch.build.knowledge.push({ name: 'Gadget blogs', kind: 'knowledge', from: 'skill:electronics' })
  expect(skillsCost(ch)).toBe(before) // renaming the free slot costs nothing
  expect(derive(cat, ch).knowledge.find(r => r.from === 'skill:electronics')).toMatchObject({ name: 'Gadget blogs', paid: false, at: 2 })
  ch.build.knowledge.push({ name: 'Tinkerer', kind: 'language', from: 'keyword:Tinkerer' })
  expect(derive(cat, ch).knowledge[0]).toMatchObject({ name: 'Tinkerer', kind: 'language', paid: false })
  expect(skillsCost(ch)).toBe(before)
})

test('a skill reaching 4 adds a free entry; dropping below 4 makes its renamed entry paid and flagged', () => {
  const ch = runner()
  ch.build.skills[1].rating = 4
  expect(derive(cat, ch).knowledge.map(r => r.name)).toContain('Athletics')
  ch.build.knowledge.push({ name: 'Parkour routes', kind: 'knowledge', from: 'skill:athletics' })
  expect(validate(cat, ch).some(v => v.code === 'knowledge.lapsed')).toBe(false)
  ch.build.skills[1].rating = 3
  const row = derive(cat, ch).knowledge.find(r => r.from === 'skill:athletics')!
  expect(row).toMatchObject({ name: 'Parkour routes', paid: true, source: 'Paid (Athletics below 4)' })
  expect(priceBuild(cat, { ...ch.build, knowledge: ch.build.knowledge.slice(0, 2) }, 'human', ch.narrative.keywords).skills + K).toBe(skillsCost(ch))
  expect(validate(cat, ch).find(v => v.code === 'knowledge.lapsed')).toMatchObject({ severity: 'warning', path: 'knowledge.2' })
})

test('old files: plain strings load as paid knowledge, "Language: X" as a language (JSON and XML)', () => {
  const ch = runner() as unknown as { build: { knowledge: unknown[] } } & Character
  ch.build.knowledge = ['Toy trains', 'Language: Made-up tongue', 'language:Other tongue']
  const json = parseCharacterFile(JSON.stringify(ch))
  // each gets an id of its own on load (its key for order and hiding)
  const want = [{ id: 'k0', name: 'Toy trains', kind: 'knowledge' }, { id: 'k1', name: 'Made-up tongue', kind: 'language' }, { id: 'k2', name: 'Other tongue', kind: 'language' }]
  expect(json.ok && json.character.build.knowledge).toEqual(want)
  const oldXml = characterToXml(runner()).replace(/<knowledge[^>]*>([^<]*)<\/knowledge>/g, '')
    .replace('<attributes', '<knowledge>Toy trains</knowledge><knowledge>Language: Made-up tongue</knowledge><attributes')
  // knowledge follows skills in the schema, but the reader doesn't mind the order
  const xml = xmlToCharacter(oldXml)
  expect(xml.ok && xml.character.build.knowledge).toEqual(want.slice(0, 2))
})

test('XML round trip keeps kind and from', () => {
  const ch = runner()
  ch.build.knowledge.push({ name: 'Gadget blogs', kind: 'language', from: 'skill:electronics' })
  const back = xmlToCharacter(characterToXml(ch))
  expect(back.ok && back.character.build.knowledge).toEqual(ch.build.knowledge)
  expect(characterToXml(ch)).toContain('<knowledge kind="language" from="skill:electronics">Gadget blogs</knowledge>')
})

test('pre-0.5.5 career: a new entry costs the knowledge price, renaming a free slot is free, paying for a lapsed one costs', () => {
  let ch = legacy(finalize(cat, runner()))
  const start = balance(cat, ch)
  ch = appendEvent(ch, makeKnowledge(cat, { name: 'Street food', kind: 'knowledge' }))
  expect(balance(cat, ch)).toBe(start - K)
  ch = appendEvent(ch, makeKnowledge(cat, { name: 'Gadget blogs', kind: 'knowledge', from: 'skill:electronics' }, false))
  ch = appendEvent(ch, makeKnowledge(cat, { name: 'Other name', kind: 'language', from: 'skill:electronics' }, false))
  expect(balance(cat, ch)).toBe(start - K)
  expect(currentBuild(ch).knowledge.filter(k => k.from === 'skill:electronics')).toEqual([{ name: 'Other name', kind: 'language', from: 'skill:electronics' }])
  const round = xmlToCharacter(characterToXml(ch))
  expect(round.ok && currentBuild(round.character).knowledge).toEqual(currentBuild(ch).knowledge)
  // a lapsed entry (say the advance was voided) paid for: it stops being tied to the skill
  ch.build.knowledge.push({ name: 'Lapsed lore', kind: 'knowledge', from: 'skill:athletics' })
  expect(validate(cat, ch).some(v => v.code === 'knowledge.lapsed')).toBe(true)
  ch = appendEvent(ch, makeKnowledge(cat, { name: 'Lapsed lore', kind: 'knowledge', from: 'skill:athletics' }, true))
  expect(balance(cat, ch)).toBe(start - 2 * K)
  expect(currentBuild(ch).knowledge.find(k => k.name === 'Lapsed lore')).toEqual({ name: 'Lapsed lore', kind: 'knowledge', id: ch.career.at(-1)!.id })
  expect(validate(cat, ch).some(v => v.code === 'knowledge.lapsed')).toBe(false)
})

test('an old career event "Language: X" applies as a language', () => {
  const ch = legacy(finalize(cat, runner()))
  ch.career.push({ id: 'e1', at: '2026-01-01T00:00:00Z', type: 'knowledge-add', name: 'Language: Made-up tongue', cost: K })
  const back = xmlToCharacter(characterToXml(ch))
  expect(back.ok && currentBuild(back.character).knowledge.at(-1)).toEqual({ name: 'Made-up tongue', kind: 'language', id: 'e1' })
})

test('a keyword entry follows the keyword’s text; removing the keyword makes a stored entry paid and flagged', () => {
  const ch = runner()
  ch.build.knowledge.push({ name: 'Night owl', kind: 'language', from: 'keyword:Night owl' })
  ch.narrative.keywords = ['Night owl', 'Tinkerer', '', '', ''] // reordered: still the same free entry
  expect(derive(cat, ch).knowledge[0]).toMatchObject({ name: 'Night owl', kind: 'language', paid: false, at: 2 })
  const free = skillsCost(ch)
  expect(validate(cat, ch).some(v => v.code === 'knowledge.lapsed')).toBe(false)
  ch.narrative.keywords = ['', 'Tinkerer', '', '', '']
  expect(derive(cat, ch).knowledge.find(r => r.at === 2)).toMatchObject({ name: 'Night owl', paid: true, source: 'Paid (keyword “Night owl” removed)' })
  expect(skillsCost(ch) - free).toBe(K)
  expect(validate(cat, ch).find(v => v.code === 'knowledge.lapsed')?.message).toBe('“Night owl” was free; with keyword “Night owl” removed it’s a paid knowledge skill.')
})
