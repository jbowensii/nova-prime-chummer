// The SR6 NPC page's pure helpers (src/sr6/ui/Npcs.tsx): which book NPCs Load book NPCs adds (one already loaded, even
// renamed, is skipped), the New NPC dialog's grunts grouped by Professional Rating, and the row chip. Made-up fixture.
import { expect, test } from 'vitest'
import { blankSr6Npc, npcFromEntry } from '../../src/sr6/engine/npc'
import { bookNpcsToLoad, byRating, npcChip } from '../../src/sr6/ui/Npcs'
import { fixtureCatalog } from '../sr6/fixture'

const c = fixtureCatalog()
const grunts = [...c.entries.npcs.values()]

test('Load book NPCs skips the ones already loaded, by their book key, even renamed', () => {
  expect(bookNpcsToLoad(grunts, [], c.sources).map(e => e.id).sort()).toEqual(['crb.corner-goon', 'crb.lot-boss', 'crb.quiet-fixer'])
  const goon = npcFromEntry(c.entries.npcs.get('crb.corner-goon')!)
  goon.sampleKey = 'CRB|crb.corner-goon'
  goon.identity.streetName = 'Renamed Goon'
  const blank = blankSr6Npc('grunt')
  blank.identity.streetName = 'Lot Boss' // the same name but not loaded from the book: doesn't count
  expect(bookNpcsToLoad(grunts, [goon, blank], c.sources).map(e => e.id).sort()).toEqual(['crb.lot-boss', 'crb.quiet-fixer'])
})

test('Load book NPCs never copies a compendium’s npcs entry (a house source of origin user)', () => {
  const sources = new Map(c.sources).set('STREET', { id: 'STREET', name: 'Street Kit', publisher: 'Gil', canon: false, origin: 'user', compendium: { id: '0123456789ab', owner: 'gil' } })
  const house = { ...grunts[0], id: 'street.alley-goon', name: 'Alley Goon', source: 'STREET' }
  expect(bookNpcsToLoad([...grunts, house], [], sources).map(e => e.id).sort()).toEqual(['crb.corner-goon', 'crb.lot-boss', 'crb.quiet-fixer'])
})

test('grunts grouped by Professional Rating, lowest first; one with none goes last', () => {
  const odd = { ...grunts[0], id: 'x.odd', name: 'Odd One', attrs: {} }
  expect(byRating([...grunts, odd]).map(([r, es]) => [r, es.map(e => e.name)])).toEqual([
    [1, ['Quiet Fixer']], [2, ['Corner Goon']], [4, ['Lot Boss']], [null, ['Odd One']]])
})

test('the row chip names the kind and its rating', () => {
  expect(npcChip(npcFromEntry(c.entries.npcs.get('crb.corner-goon')!).npc!)).toBe('Grunt PR 2')
  expect(npcChip(npcFromEntry(c.entries.spirits.get('crb.spirit-of-puddles')!, 4).npc!)).toBe('Spirit F 4')
  expect(npcChip(npcFromEntry(c.entries.sprites.get('crb.glitch-sprite')!, 3).npc!)).toBe('Sprite L 3')
  expect(npcChip(blankSr6Npc('critter').npc!)).toBe('Critter')
  expect(npcChip(blankSr6Npc('grunt').npc!)).toBe('Grunt')
})
