// The SR6 Compendiums page's pure helpers (src/sr6/ui/Compendiums.tsx): rows grouped by kind in COMP_KINDS order, then the
// compendium's NPCs, each by name; a new entry's id is free in the catalog and the compendium. Made-up entries only.
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { blankSr6Entry, COMP_KINDS, newEntryId } from '../../src/sr6/engine/compendium'
import { xmlToSr6 } from '../../src/sr6/engine/charxml'
import { NPC_GROUP, sr6Rows } from '../../src/sr6/ui/Compendiums'
import { SR6_KINDS, type Sr6Compendium, type Sr6Kind } from '../../src/sr6/model/types'
import { fixtureCatalog } from '../sr6/fixture'

const c = fixtureCatalog()
const grunt = (() => { const r = xmlToSr6(readFileSync('tests/fixtures/sr6/npc-grunt.xml', 'utf8')); if (!r.ok) throw new Error(r.reason); return r.character })()
const kit: Sr6Compendium = { id: '0123456789ab', name: 'Street Kit', source: 'STREET', sharing: 'private', updatedAt: '', entries: [], npcs: [] }
const made = (kind: Sr6Kind, name: string, attrs: Record<string, string> = {}) => ({ ...blankSr6Entry(c, kind, kit, name), attrs })

test('rows: one group per compendium kind in COMP_KINDS order, then the NPCs; by name; values and lines as the detail', () => {
  const list = [made('spirits', 'Gutter Spirit', { bod: 'F+1' }), made('weapons', 'Zip Stick', { category: 'Clubs', dv: '2S' }),
    made('weapons', 'Ash Bat', { category: 'Clubs' }), made('qualities', 'Lucky Socks', { kind: 'positive' })]
  list[0].parts = [{ tag: 'skills', attrs: {}, text: 'Lurking 3' }, { tag: 'powers', attrs: {}, text: '' }]
  const rows = sr6Rows(list, [grunt])
  expect([...rows.keys()]).toEqual([...Object.keys(COMP_KINDS).map(k => SR6_KINDS[k as Sr6Kind].label), NPC_GROUP])
  const filled = [...rows].filter(([, r]) => r.length).map(([g, r]) => [g, r.map(x => x.name)])
  expect(filled).toEqual([['Qualities', ['Lucky Socks']], ['Weapons', ['Ash Bat', 'Zip Stick']], ['Spirits', ['Gutter Spirit']],
    [NPC_GROUP, [grunt.identity.streetName || grunt.identity.name]]])
  expect(rows.get('Weapons')![1]).toMatchObject({ detail: 'category Clubs · dv 2S', source: 'STREET', page: 1 })
  expect(rows.get('Spirits')![0].detail).toBe('bod F+1 · skills: Lurking 3')
  expect(rows.get(NPC_GROUP)![0].npc).toBe(grunt)
  // a kind no compendium holds (a book's skills) isn't listed
  expect([...sr6Rows([...c.entries.skills.values()], []).values()].flat()).toEqual([])
})

test('a new entry’s id is free in that kind’s catalog map and in the compendium', () => {
  const zap = [...c.entries.weapons.values()][0]
  const comp = { ...kit, source: zap.id.split('.')[0].toUpperCase() } // the book's own prefix: the catalog holds that id
  const id = newEntryId(c, 'weapons', comp, zap.name)
  expect(id).not.toBe(zap.id)
  expect(c.entries.weapons.has(id)).toBe(false)
  const next = newEntryId(c, 'weapons', { ...comp, entries: [{ ...made('weapons', zap.name), id }] }, zap.name)
  expect([next === id, c.entries.weapons.has(next)]).toEqual([false, false])
})
