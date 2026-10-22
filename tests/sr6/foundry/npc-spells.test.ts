// npc-spells: an NPC's spells export as a runner's spell picks do, and a caster gets the tradition with the best drain pool
// (owner 2026-10-21 "NPC spells"). Names and numbers are made up; the traditions' attribute lines copy the books' shape.
import { readFileSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020'
import { expect, test } from 'vitest'
import { sr6Data } from '../../../src/sr6/catalog/domain/data'
import { exportNpc, exportSr6Runners } from '../../../src/sr6/foundry/domain/export'
import { blankSr6, type Sr6Npc } from '../../../src/sr6/formats/domain/character'
import { blankSr6Npc } from '../../../src/sr6/runner-builder/domain/creation/npc'
import { fixtureCatalog, fixtureCreation } from '../catalog/fixture'

const TRADITIONS = `
  <tradition id="crb.made-up-lore" source="CRB" page="199"><name>Made-up Lore</name></tradition>
  <tradition id="crb.made-up-song" source="CRB" page="199"><name>Made-up Song</name></tradition>
  <tradition id="crb.made-up-hive" source="CRB" page="199"><name>Made-up Hive</name></tradition>
</sr6:data>`
const TEXTS = `
  <text of="traditions" id="crb.made-up-lore">**Tradition Attribute:** Logic
Invented.</text>
  <text of="traditions" id="crb.made-up-song">**Tradition Attribute:** Charisma
Invented.</text>
  <text of="traditions" id="crb.made-up-hive">• **Drain:** Willpower + Intuition Invented.</text>
</sr6:data>`
const c = fixtureCatalog((file, xml) =>
    file.endsWith('crb/traditions.xml') ? xml.replace('</sr6:data>', TRADITIONS) : file.endsWith('texts/crb.xml') ? xml.replace('</sr6:data>', TEXTS) : xml,
  ),
  data = sr6Data(c)
const schema = new Ajv2020({ strict: false, validateFormats: false }).compile(JSON.parse(readFileSync('public/data/schema/sr6-export.schema.json', 'utf8')))
const OPTS = { descriptions: true, now: '2026-10-21T09:00:00.000Z', appVersion: '0.19.0' }

const npc = (spells: string | undefined, stats: Record<string, string> = { wil: '3', log: '5', int: '4', cha: '2' }): Sr6Npc => ({
  ...blankSr6Npc('grunt', 3).npc!,
  stats,
  lines: spells === undefined ? [] : [{ part: 'spells', text: spells }],
})

test('npc-spells: a spell item has the keys and values of a runner’s spell pick of the same entry, its printed text in its note', () => {
  const pc = blankSr6('karma', 'pc-1', OPTS.now)
  pc.build.picks.push({ uid: 'p1', kind: 'spells', id: 'crb.glow-ward' })
  const gm = { ...blankSr6Npc('grunt', 3), id: 'npc-1' }
  gm.npc = npc('Glow Ward (F6)')
  const f = exportSr6Runners(c, data, fixtureCreation(), [pc, gm], OPTS)
  expect(schema(f), JSON.stringify(schema.errors)).toBe(true)
  const pick = f.runners![0].picks[0],
    item = f.runners![1].npc!.items[0]
  const { uid: _, ...shared } = pick
  for (const [k, v] of Object.entries(shared)) expect([k, item[k as keyof typeof item]]).toEqual([k, v])
  expect(item).toMatchObject({ name: 'Glow Ward', pick: 'spells', note: 'Glow Ward (F6)', description: 'An invented ward that glows.' })
})

test('npc-spells: the description goes with descriptions on only; an unlinked spell is a plain spell by its printed name', () => {
  const on = exportNpc(npc('Glow Ward, Made-up Hex [direct, DV 3]'), data, c, true).items,
    off = exportNpc(npc('Glow Ward'), data, c, false).items
  expect(on[0].description).toBe('An invented ward that glows.')
  expect(off[0].description).toBeUndefined()
  expect(on[1]).toMatchObject({ kind: 'spells', name: 'Made-up Hex', pick: 'spells', note: 'Made-up Hex [direct, DV 3]', attrs: {}, values: {} })
  expect(on[1].id).toBeUndefined()
})

test('npc-spells: a run-together line splits, GM instructions and a book reference are no spells', () => {
  const x = exportNpc(
    npc('Glow Ward [direct, LOS, DV 3] Made-up Hex [indirect, DV 4], Gamemaster discretion; Rituals: Glow Ward, p. 12, Any desired.'),
    data,
    c,
  )
  expect(x.items.map(i => [i.name, i.note])).toEqual([
    ['Glow Ward', 'Glow Ward [direct, LOS, DV 3]'],
    ['Made-up Hex', 'Made-up Hex [indirect, DV 4]'],
    ['Glow Ward', 'Glow Ward, p. 12'],
  ])
})

test('npc-spells: a caster’s tradition is the one with the largest drain pool, its drain attribute set; a tie lists each', () => {
  const one = exportNpc(npc('Glow Ward'), data, c)
  expect(one.magic).toEqual({
    tradition: 'Made-up Lore',
    drainAttr: 'log',
    drain: 8,
    traditions: [{ id: 'crb.made-up-lore', name: 'Made-up Lore', drainAttr: 'log' }],
  })
  expect(one.corrections).toContain('Tradition: Made-up Lore (Willpower + Logic), drain pool 8')
  expect(exportNpc(npc('Glow Ward', { wil: '2', log: '3', int: '6', cha: '1' }), data, c).magic).toMatchObject({
    tradition: 'Made-up Hive',
    drainAttr: 'int',
    drain: 8,
  })
  const tie = exportNpc(npc('Glow Ward', { wil: '4', log: '5', int: '2', cha: '5' }), data, c)
  expect(tie.magic).toMatchObject({ tradition: 'Made-up Lore', drainAttr: 'log', drain: 9 })
  expect(tie.magic!.traditions.map(t => [t.name, t.drainAttr])).toEqual([
    ['Made-up Lore', 'log'],
    ['Made-up Song', 'cha'],
  ])
  expect(tie.corrections.at(-1)).toBe('Tradition: Made-up Lore (Willpower + Logic) or Made-up Song (Willpower + Charisma), drain pool 9')
})

test('npc-spells: a non-caster, or one whose Willpower can’t be read, gets no tradition', () => {
  const none = exportNpc(npc(undefined), data, c)
  expect(none.magic).toBeUndefined()
  expect(none.corrections.some(l => l.startsWith('Tradition'))).toBe(false)
  expect(exportNpc(npc('Glow Ward', { log: '5' }), data, c).magic).toBeUndefined()
})
