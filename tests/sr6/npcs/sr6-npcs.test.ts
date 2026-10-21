// The SR6 NPC page's pure helpers (src/sr6/npcs/ui/Npcs.tsx): which book NPCs Load book NPCs adds (one already loaded, even
// renamed, is skipped), the New NPC dialog's grunts grouped by Professional Rating, and the row chip. Made-up fixture.
import { expect, test } from 'vitest'
import { blankSr6Npc, npcFromEntry } from '../../../src/sr6/runner-builder/domain/creation/npc'
import { bookNpc, bookNpcVersions, byPublication } from '../../../src/sr6/runner-builder/domain/creation/npc'
import type { Sr6Catalog } from '../../../src/sr6/formats/domain/types'
import { SR6_NPC_KINDS } from '../../../src/sr6/formats/domain/character'
import { npcChip, npcSection, sr6NpcsHref } from '../../../src/sr6/runner-builder/ui/editor'
import { atRating, bookNpcsToLoad, byRating, gruntRatings, npcGroups, oldContact, tidyBookCopies } from '../../../src/sr6/npcs/ui/Npcs'
import { fixtureCatalog } from '../catalog/fixture'

const c = fixtureCatalog()
const grunts = [...c.entries.npcs.values()]

test('Load book NPCs skips the ones already loaded, by their book key, even renamed', () => {
  expect(
    bookNpcsToLoad(grunts, [], c.sources)
      .map(x => x.e.id)
      .sort(),
  ).toEqual(['crb.corner-goon', 'crb.lot-boss', 'crb.quiet-fixer'])
  const goon = npcFromEntry(c.entries.npcs.get('crb.corner-goon')!)
  goon.sampleKey = 'CRB|crb.corner-goon'
  goon.identity.streetName = 'Renamed Goon'
  const blank = blankSr6Npc('grunt')
  blank.identity.streetName = 'Lot Boss' // the same name but not loaded from the book: doesn't count
  expect(
    bookNpcsToLoad(grunts, [goon, blank], c.sources)
      .map(x => x.e.id)
      .sort(),
  ).toEqual(['crb.lot-boss', 'crb.quiet-fixer'])
})

test('Load book NPCs never copies a compendium’s npcs entry (a house source of origin user)', () => {
  const sources = new Map(c.sources).set('STREET', {
    id: 'STREET',
    name: 'Street Kit',
    publisher: 'Gil',
    canon: false,
    origin: 'user',
    compendium: { id: '0123456789ab', owner: 'gil' },
  })
  const house = { ...grunts[0], id: 'street.alley-goon', name: 'Alley Goon', source: 'STREET' }
  expect(
    bookNpcsToLoad([...grunts, house], [], sources)
      .map(x => x.e.id)
      .sort(),
  ).toEqual(['crb.corner-goon', 'crb.lot-boss', 'crb.quiet-fixer'])
})

test('grunts grouped by Professional Rating, lowest first; one with none goes last', () => {
  const odd = { ...grunts[0], id: 'x.odd', name: 'Odd One', attrs: {} }
  expect(byRating([...grunts, odd]).map(([r, es]) => [r, es.map(e => e.name)])).toEqual([
    [1, ['Quiet Fixer']],
    [2, ['Corner Goon']],
    [4, ['Lot Boss']],
    [null, ['Odd One']],
  ])
})

test('the row chip names the kind and its rating', () => {
  expect(npcChip(npcFromEntry(c.entries.npcs.get('crb.corner-goon')!).npc!)).toBe('Grunt PR 2')
  expect(npcChip(npcFromEntry(c.entries.spirits.get('crb.spirit-of-puddles')!, 4).npc!)).toBe('Spirit F 4')
  expect(npcChip(npcFromEntry(c.entries.sprites.get('crb.glitch-sprite')!, 3).npc!)).toBe('Sprite L 3')
  expect(npcChip(blankSr6Npc('critter').npc!)).toBe('Critter')
  expect(npcChip(blankSr6Npc('grunt').npc!)).toBe('Grunt')
})

test('Load book NPCs takes the critters, spirits and sprites too, each once', () => {
  const all = (['npcs', 'critters', 'spirits', 'sprites'] as const).flatMap(k => [...c.entries[k].values()])
  expect(bookNpcsToLoad(all, [], c.sources)).toHaveLength(9)
  const puddles = { ...npcFromEntry(c.entries.spirits.get('crb.spirit-of-puddles')!, 3), sampleKey: 'CRB|crb.spirit-of-puddles' }
  expect(bookNpcsToLoad(all, [puddles], c.sources).map(x => x.e.id)).not.toContain('crb.spirit-of-puddles')
})

test('a 0.9.0 copy of a sample contact (a grunt of group Contact, loaded from the book) is fixed; a GM’s own grunt isn’t', () => {
  const old = blankSr6Npc('grunt')
  old.npc!.group = 'Contact'
  expect(oldContact(old)).toBe(false) // not loaded from the book
  old.sampleKey = 'CRB|crb.fixer-fred'
  expect(oldContact(old)).toBe(true)
  expect(oldContact({ ...old, npc: { ...old.npc!, rating: 2 } })).toBe(false)
  expect(npcChip(blankSr6Npc('contact').npc!)).toBe('Contact')
})

// made-up books: Alpha (2020-01), Beta and Gamma (both 2021-05: Beta's product number first), an import with no date
const BOOK = (id: string, published?: string, cat?: string) => ({ id, name: id, publisher: 'Made Up', canon: true, origin: 'shipped' as const, published, cat })
const books: Sr6Catalog['sources'] = new Map(
  [BOOK('ALPHA', '2020-01', 'CAT1'), BOOK('BETA', '2021-05', 'CAT2'), BOOK('GAMMA', '2021-05', 'CAT3'), BOOK('ZED')].map(s => [s.id, s]),
)
const fuzz = c.entries.critters.get('crb.fuzzbeast')!
const printed = (source: string, over: Partial<typeof fuzz> = {}) => ({
  ...fuzz,
  id: `${source.toLowerCase()}.fuzzbeast`,
  source,
  page: 10,
  text: `${source}'s own words`,
  ...over,
})

test('publication order: the month, then the product number, then the id; a book with no date last', () => {
  expect(['ZED', 'GAMMA', 'BETA', 'ALPHA'].sort(byPublication(books))).toEqual(['ALPHA', 'BETA', 'GAMMA', 'ZED'])
  expect(c.sources.get('CRB')?.published).toBe('2019-08') // the shipped sources.xml: every book dated
  expect([...c.sources.values()].filter(s => s.origin !== 'user' && !/^\d{4}-\d{2}$/.test(s.published ?? ''))).toEqual([])
})

test('a book NPC printed the same in several books loads once, from the earliest; page, id, case and description don’t count', () => {
  const es = [printed('GAMMA'), printed('ALPHA', { name: 'FUZZBEAST!', page: 99 }), printed('BETA')]
  expect(bookNpcVersions(es, books).map(v => [v.name, v.entries.map(e => e.source)])).toEqual([['FUZZBEAST!', ['ALPHA', 'BETA', 'GAMMA']]])
  expect(bookNpcsToLoad(es, [], books).map(x => [x.e.source, x.name])).toEqual([['ALPHA', 'FUZZBEAST!']])
  // one printing already loaded (from any book): nothing more
  expect(bookNpcsToLoad(es, [bookNpc(es[0])], books)).toEqual([])
})

test('printed differently: each version loads, numbered in publication order; the same as an earlier one shares its number', () => {
  const tougher = { ...fuzz.attrs, bod: '9' }
  const es = [printed('GAMMA'), printed('ZED', { attrs: tougher }), printed('BETA', { attrs: tougher }), printed('ALPHA')]
  expect(bookNpcVersions(es, books).map(v => [v.name, v.entries.map(e => e.source)])).toEqual([
    ['Fuzzbeast #1', ['ALPHA', 'GAMMA']],
    ['Fuzzbeast #2', ['BETA', 'ZED']],
  ])
  expect(bookNpcsToLoad(es, [], books).map(x => [x.e.source, x.name])).toEqual([
    ['ALPHA', 'Fuzzbeast #1'],
    ['BETA', 'Fuzzbeast #2'],
  ])
  // a spirit of the same name is another NPC
  const spirit = { ...c.entries.spirits.get('crb.spirit-of-puddles')!, name: 'Fuzzbeast', source: 'BETA' }
  expect(bookNpcsToLoad([...es, spirit], [], books).map(x => x.name)).toEqual(['Fuzzbeast #1', 'Fuzzbeast #2', 'Fuzzbeast'])
})

test('Tidy book copies: an identical extra copy goes to the trash, the differing ones get their numbers; changed or own NPCs stay', () => {
  const tougher = { ...fuzz.attrs, bod: '9' }
  const es = [printed('ALPHA'), printed('GAMMA'), printed('BETA', { attrs: tougher })]
  const row = (e: (typeof es)[number], rev = 1, at = '2026-10-01T00:00:00.000Z') => ({ ch: { ...bookNpc(e, at) }, rev })
  const alpha = row(es[0]),
    gamma = row(es[1]),
    beta = row(es[2]),
    again = row(es[0], 1, '2026-10-02T00:00:00.000Z')
  const edited = row(es[1], 2),
    own = { ch: blankSr6Npc('critter'), rev: 1 }
  own.ch.identity.streetName = 'Fuzzbeast'
  const plan = tidyBookCopies([gamma, again, beta, alpha, edited, own], es, books)
  expect(plan.trash.map(s => s.ch)).toEqual([again.ch, gamma.ch]) // Alpha's first copy stays
  expect(plan.rename.map(r => [r.s.ch.npc!.from!.source, r.name])).toEqual([
    ['ALPHA', 'Fuzzbeast #1'],
    ['BETA', 'Fuzzbeast #2'],
  ])
  // done: nothing left to tidy
  const done = [
    { ...alpha, ch: { ...alpha.ch, identity: { ...alpha.ch.identity, streetName: 'Fuzzbeast #1' } } },
    { ...beta, ch: { ...beta.ch, identity: { ...beta.ch.identity, streetName: 'Fuzzbeast #2' } } },
    edited,
    own,
  ]
  expect(tidyBookCopies(done, es, books)).toEqual({ trash: [], rename: [] })
})

test('two sections: grunts and contacts are NPCs; critters, spirits and sprites are critters', () => {
  expect(SR6_NPC_KINDS.map(k => [k, npcSection(blankSr6Npc(k).npc)])).toEqual([
    ['grunt', 'npcs'],
    ['contact', 'npcs'],
    ['critter', 'critters'],
    ['spirit', 'critters'],
    ['sprite', 'critters'],
  ])
  expect(sr6NpcsHref(blankSr6Npc('spirit').npc)).toBe('#/sr6/npcs/critters')
  expect(sr6NpcsHref(blankSr6Npc('contact').npc)).toBe('#/sr6/npcs')
  expect(sr6NpcsHref(undefined)).toBe('#/sr6/npcs')
})

test('the list groups grunts by Professional Rating, spirits by Force and sprites by Level, in the list’s own order', () => {
  const named = (ch: ReturnType<typeof blankSr6Npc>, name: string) => {
    ch.identity.streetName = name
    return { ch }
  }
  const rows = [
    named(blankSr6Npc('spirit', 4), 'Wisp'),
    named(npcFromEntry(c.entries.npcs.get('crb.lot-boss')!), 'Boss'),
    named(blankSr6Npc('grunt'), 'Odd'),
    named(blankSr6Npc('sprite', 3), 'Glitch'),
    named(blankSr6Npc('contact'), 'Fred'),
    named(npcFromEntry(c.entries.npcs.get('crb.corner-goon')!), 'Goon'),
    named(blankSr6Npc('critter'), 'Fuzz'),
    named(blankSr6Npc('spirit', 2), 'Puddle'),
    named(npcFromEntry(c.entries.npcs.get('crb.corner-goon')!), 'Goon B'),
  ]
  expect(npcGroups(rows).map(([label, rs]) => [label, rs.map(r => r.ch.identity.streetName)])).toEqual([
    ['Grunts, Professional Rating 2', ['Goon', 'Goon B']],
    ['Grunts, Professional Rating 4', ['Boss']],
    ['Grunts, no Professional Rating', ['Odd']],
    ['Contacts', ['Fred']],
    ['Critters', ['Fuzz']],
    ['Spirits, Force 2', ['Puddle']],
    ['Spirits, Force 4', ['Wisp']],
    ['Sprites, Level 3', ['Glitch']],
  ])
})

test('the Professional Rating picker: the ratings grunts have, lowest first; a rating leaves out contacts and critters; grunts stay on top', () => {
  const named = (ch: ReturnType<typeof blankSr6Npc>, name: string) => {
    ch.identity.streetName = name
    return { ch }
  }
  const rows = [
    named(blankSr6Npc('contact'), 'Fred'),
    named(npcFromEntry(c.entries.npcs.get('crb.lot-boss')!), 'Boss'),
    named(blankSr6Npc('critter'), 'Fuzz'),
    named(npcFromEntry(c.entries.npcs.get('crb.corner-goon')!), 'Goon'),
    named(blankSr6Npc('grunt'), 'Odd'),
    named(blankSr6Npc('spirit', 2), 'Puddle'),
  ]
  expect(gruntRatings(rows)).toEqual([2, 4])
  expect(atRating(rows, '').length).toBe(rows.length)
  expect(atRating(rows, '2').map(r => r.ch.identity.streetName)).toEqual(['Goon'])
  expect(atRating(rows, '4').map(r => r.ch.identity.streetName)).toEqual(['Boss'])
  expect(atRating(rows, '5')).toEqual([])
  // the Contacts group is listed before the Critters; Grunts first of all, however the rows came
  expect(npcGroups([...rows].reverse()).map(([label]) => label)[0]).toMatch(/^Grunts/)
})
