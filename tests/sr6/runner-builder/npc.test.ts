// SR6 NPC stat blocks (src/sr6/runner-builder/domain/creation/npc.ts): copied from the made-up fixture's catalog entries and read at a rating.
import { expect, test } from 'vitest'
import { sr6ToXml, xmlToSr6 } from '../../../src/sr6/formats/domain/charxml'
import {
  blankSr6Npc,
  bookNpc,
  bookNpcKey,
  NPC_KINDS,
  npcFromEntry,
  npcHeadline,
  npcKindOf,
  npcParts,
  npcPools,
  npcValues,
  poolText,
} from '../../../src/sr6/runner-builder/domain/creation/npc'
import type { Sr6Character } from '../../../src/sr6/formats/domain/character'
import type { Sr6Kind } from '../../../src/sr6/formats/domain/types'
import { fixtureCatalog, made } from '../catalog/fixture'

const c = fixtureCatalog(),
  { data } = made()
const entry = (kind: Sr6Kind, id: string) => c.entries[kind].get(id)!
const NOW = '2026-10-03T10:00:00.000Z'
const value = (ch: Sr6Character, key: string) => npcValues(ch.npc!).find(v => v.key === key)

test('the four kinds and what their rating is called', () => {
  expect(NPC_KINDS.grunt).toEqual({ label: 'Grunt', kind: 'npcs', rating: { label: 'Professional Rating' } })
  expect(NPC_KINDS.critter).toEqual({ label: 'Critter', kind: 'critters' })
  expect(NPC_KINDS.spirit.rating).toEqual({ label: 'Force', letter: 'F' })
  expect(NPC_KINDS.sprite.rating).toEqual({ label: 'Level', letter: 'L' })
})

test('a spirit at a Force: its F stats follow the Force', () => {
  const s = npcFromEntry(entry('spirits', 'crb.spirit-of-puddles'), 4, NOW)
  expect(s.npc).toMatchObject({
    kind: 'spirit',
    rating: 4,
    from: { kind: 'spirits', id: 'crb.spirit-of-puddles', name: 'Spirit of Puddles', source: 'CRB', page: 230 },
  })
  expect(s.identity.streetName).toBe('Spirit of Puddles')
  expect(s.npc!.stats.category).toBeUndefined()
  expect(value(s, 'agi')).toEqual({ key: 'agi', label: 'AGI', printed: 'F+1', value: '5', ok: true })
  expect(value(s, 'dr')?.value).toBe('8')
  expect(value(s, 'cm')?.value).toBe('10')
  expect(value(s, 'init')).toMatchObject({ label: 'Initiative', value: '8 + 2D6' })
  const six = { ...s.npc!, rating: 6 }
  expect(
    npcValues(six)
      .filter(v => ['agi', 'dr', 'cm', 'init'].includes(v.key))
      .map(v => v.value),
  ).toEqual(['7', '12', '12 + 2D6', '11'])
  expect(s.npc!.lines.map(l => l.part)).toEqual(['skills', 'powers', 'optionalPowers'])
})

test('a spirit attribute is never below 1 at a low Force; other stats may be', () => {
  const v = npcValues({ kind: 'spirit', rating: 1, stats: { str: 'F–3', mag: 'F', dr: 'F – 3' }, lines: [] })
  expect(v.map(x => [x.key, x.value])).toEqual([
    ['str', '1'],
    ['mag', '1'],
    ['dr', '-2'],
  ])
})

test('a grunt: its Professional Rating, group and source; printed values as they are; lines in order', () => {
  const g = npcFromEntry(entry('npcs', 'crb.corner-goon'), undefined, NOW)
  expect(g.npc).toMatchObject({ kind: 'grunt', rating: 2, group: 'Street Crew', from: { kind: 'npcs', source: 'CRB', page: 205 } })
  expect(g.npc!.stats.rating).toBeUndefined()
  expect(g.npc!.stats.group).toBeUndefined()
  expect(g.npc!.lines).toEqual([
    { part: 'skills', text: 'Close Combat 4, Firearms 3' },
    { part: 'gear', text: 'Padded Vest' },
    { part: 'weapons', text: 'Zap Gun' },
  ])
  expect(value(g, 'bod')).toEqual({ key: 'bod', label: 'BOD', printed: '3', value: '3', ok: true })
  expect(value(g, 'init')?.value).toBe('6 + 1D6')
  expect(value(g, 'actions')?.value).toBe('1/2')
  expect(
    npcValues(g.npc!)
      .map(v => v.label)
      .slice(0, 12),
  ).toEqual(['BOD', 'AGI', 'REA', 'STR', 'WIL', 'LOG', 'INT', 'CHA', 'EDG', 'Essence', 'Defense Rating', 'Initiative'])
  // the file it makes reads back the same
  const back = xmlToSr6(sr6ToXml(g))
  expect(back.ok && back.character).toEqual(g)
})

test('a sprite at a Level: its matrix stats', () => {
  const s = npcFromEntry(entry('sprites', 'crb.glitch-sprite'), 3, NOW)
  expect(value(s, 'sleaze')).toMatchObject({ label: 'Sleaze', value: '4' })
  expect(value(s, 'data')?.label).toBe('Data Processing')
  expect(value(s, 'init')?.value).toBe('7')
})

test('pools: "Name N" or a bare name (a spirit’s at its Force), resolved by name; unresolved is printed only', () => {
  const boss = npcFromEntry(entry('npcs', 'crb.lot-boss'), undefined, NOW)
  expect(npcPools(boss.npc!, data)).toEqual([
    { name: 'Gab', rating: 5, attr: 'cha', pool: 10, printed: 'Gab 5' },
    { name: 'Tinkering', rating: 3, attr: 'log', pool: 6, printed: 'Tinkering 3' },
    { name: 'Close Combat', rating: 6, printed: 'Close Combat 6' },
  ])
  const drafts = npcFromEntry(entry('spirits', 'crb.spirit-of-drafts'), 4, NOW)
  expect(npcPools(drafts.npc!, data)).toEqual([
    { name: 'Gab', rating: 3, attr: 'cha', pool: 7, printed: 'Gab 3' },
    { name: 'Hexing', rating: 4, attr: 'mag', pool: 8, printed: 'Hexing' },
    { name: 'Gusting', rating: 4, printed: 'Gusting' },
  ])
  const puddles = npcFromEntry(entry('spirits', 'crb.spirit-of-puddles'), 4, NOW)
  expect(npcPools(puddles.npc!, data)[0]).toEqual({ name: 'Splashing', rating: 4, printed: 'Splashing' })
  // a bare skill on a critter has no rating
  const beast = npcFromEntry(entry('critters', 'crb.fuzzbeast'), undefined, NOW)
  expect(npcPools({ ...beast.npc!, lines: [{ part: 'skills', text: 'Tinkering' }] }, data)).toEqual([
    { name: 'Tinkering', rating: null, attr: 'log', printed: 'Tinkering' },
  ])
})

test('pools: a skill printed with its augmented rank or a specialization bonus keeps its rank', () => {
  const npc = { kind: 'grunt' as const, stats: { cha: '4', log: '3' }, lines: [{ part: 'skills' as const, text: 'Gab 5 (Haggling +2), Tinkering 2(3)' }] }
  expect(npcPools(npc, data).map(p => [p.name, p.rating, p.pool])).toEqual([
    ['Gab', 5, 9],
    ['Tinkering', 2, 5],
  ])
})

test('a stat the evaluator can’t read is shown as printed and not ok; its pool is left out', () => {
  const s = npcFromEntry(entry('spirits', 'crb.spirit-of-drafts'), 4, NOW)
  s.npc!.stats.mag = 'F+?'
  expect(value(s, 'mag')).toEqual({ key: 'mag', label: 'Magic', printed: 'F+?', value: 'F+?', ok: false })
  expect(npcPools(s.npc!, data)[1]).toEqual({ name: 'Hexing', rating: 4, attr: 'mag', printed: 'Hexing' })
})

test('a crafted skills line (a long run of spaces) is printed as it is, quickly: no quadratic backtracking', () => {
  const s = npcFromEntry(entry('npcs', 'crb.lot-boss'), undefined, NOW)
  const long = `a${' '.repeat(200_000)}b`
  s.npc!.lines = [{ part: 'skills', text: long }]
  const t = performance.now()
  expect(npcPools(s.npc!, data)).toEqual([{ name: long, rating: null, printed: long }])
  expect(performance.now() - t).toBeLessThan(200)
})

test('blank NPCs and the book key', () => {
  expect(blankSr6Npc('spirit', 3).npc).toEqual({ kind: 'spirit', rating: 3, stats: {}, lines: [] })
  expect(blankSr6Npc('sprite').npc!.rating).toBe(1)
  expect(blankSr6Npc('grunt').npc).toEqual({ kind: 'grunt', stats: {}, lines: [] })
  expect(blankSr6Npc('grunt').ledger).toEqual([])
  expect(bookNpcKey(entry('npcs', 'crb.corner-goon'))).toBe('CRB|crb.corner-goon')
})

// one of the book's sample contacts, as the recipe writes it: an npcs entry of group Contact with no Professional Rating
const contact = () => ({ ...entry('npcs', 'crb.quiet-fixer'), id: 'crb.fixer-fred', name: 'Fixer Fred', attrs: { group: 'Contact', cha: '5', log: '4' } })

test('a sample contact is a contact, not a grunt: no rating, no group', () => {
  expect(NPC_KINDS.contact).toEqual({ label: 'Contact', kind: 'npcs' })
  expect(npcKindOf(contact())).toBe('contact')
  expect(npcKindOf(entry('npcs', 'crb.corner-goon'))).toBe('grunt')
  expect(npcKindOf({ ...contact(), attrs: { group: 'Contact', rating: '2' } })).toBe('grunt') // a grunt group that happens to be called Contact
  const ch = npcFromEntry(contact(), undefined, NOW)
  expect(ch.npc).toMatchObject({ kind: 'contact', stats: { cha: '5', log: '4' } })
  expect(ch.npc).not.toHaveProperty('rating')
  expect(ch.npc).not.toHaveProperty('group')
  expect(npcHeadline(ch.npc!)).toBe('Contact')
  const back = xmlToSr6(sr6ToXml(ch))
  expect(back.ok && back.character.npc?.kind).toBe('contact')
})

test('Load book NPCs’ copies: under the book key; a spirit or sprite at the rating printed, else 3 (R); a critter none', () => {
  expect(bookNpc(entry('spirits', 'crb.spirit-of-puddles'), NOW)).toMatchObject({ sampleKey: 'CRB|crb.spirit-of-puddles', npc: { kind: 'spirit', rating: 3 } })
  expect(bookNpc({ ...entry('sprites', 'crb.glitch-sprite'), attrs: { ...entry('sprites', 'crb.glitch-sprite').attrs, rating: '5' } }, NOW).npc!.rating).toBe(5)
  expect(bookNpc(entry('critters', 'crb.fuzzbeast'), NOW).npc).not.toHaveProperty('rating')
  expect(bookNpc(entry('npcs', 'crb.corner-goon'), NOW).npc).toMatchObject({ kind: 'grunt', rating: 2 })
  expect(bookNpc(contact(), NOW).npc!.kind).toBe('contact')
})

test('the NPC block’s headline: the four forms', () => {
  expect(npcHeadline(npcFromEntry(entry('npcs', 'crb.corner-goon'), undefined, NOW).npc!)).toBe('Grunt, Professional Rating 2 · Street Crew')
  expect(npcHeadline(npcFromEntry(entry('spirits', 'crb.spirit-of-puddles'), 4, NOW).npc!)).toBe('Spirit, Force 4')
  expect(npcHeadline(npcFromEntry(entry('sprites', 'crb.glitch-sprite'), 3, NOW).npc!)).toBe('Sprite, Level 3')
  expect(npcHeadline(npcFromEntry(entry('critters', 'crb.fuzzbeast'), undefined, NOW).npc!)).toBe('Critter')
  expect(npcHeadline(blankSr6Npc('grunt').npc!)).toBe('Grunt')
})

test('a skill with its pool, or as printed; the line parts each kind uses', () => {
  const boss = npcFromEntry(entry('npcs', 'crb.lot-boss'), undefined, NOW)
  expect(npcPools(boss.npc!, data).map(poolText)).toEqual(['Gab 5 (pool 10)', 'Tinkering 3 (pool 6)', 'Close Combat 6'])
  expect(npcParts('sprite').map(([k]) => k)).toEqual(['skills', 'powers'])
  expect(npcParts('grunt').map(([, l]) => l)).toEqual([
    'Skills',
    'Powers',
    'Optional powers',
    'Spells',
    'Weaknesses',
    'Attacks',
    'Augmentations',
    'Gear',
    'Weapons',
  ])
  expect(npcParts('critter')).toEqual(npcParts('spirit'))
})
