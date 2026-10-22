// npc-powers: an NPC's powers line linked to the catalog by the power's NAME (owner rulings 2026-10-21, "NPC unmatched
// powers"): A the brackets, rating and parameters are its detail, not its name; the split run-together powers; B the prose
// the reader parts from the line (importer, prose_items.power_list); C the powers the importer now catalogues link; D a
// power no book defines stays a generic one with the printed name. Every name, number and text here is made up.
import { readFileSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020'
import { expect, test } from 'vitest'
import { sr6Data } from '../../../src/sr6/catalog/domain/data'
import { exportNpc, exportSr6Runners } from '../../../src/sr6/foundry/domain/export'
import { blankSr6Npc, npcCorrections, npcThings } from '../../../src/sr6/runner-builder/domain/creation/npc'
import type { Sr6Npc } from '../../../src/sr6/formats/domain/character'
import { fixtureCatalog, fixtureCreation } from '../catalog/fixture'
import { SAMPLE_OPTS } from './samples'

const power = (id: string, name: string, extra = '') =>
  `<critterpower id="zz.${id}" source="ZZ" page="5" type="P" action="Auto" range="Self" duration="Always"${extra}><name>${name}</name></critterpower>`
const ROOT = (kind: string, rows: string) => `<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="${kind}" version="1">${rows}</sr6:data>`
const EXTRA = [
  {
    file: 'custom/sr6/imported/zz/critterpowers.xml',
    xml: ROOT(
      'critterpowers',
      [
        power('immunity', 'Immunity'),
        power('hardened-armor', 'Hardened Armor'),
        power('venom', 'Venom'),
        power('enhanced-senses', 'Enhanced Senses'),
        power('sapience', 'Sapience'),
        power('dual-natured', 'Dual Natured'),
        power('concealment', 'Concealment'),
        power('armor', 'Armor'),
        power('astral-form', 'Astral Form'),
        power('zing', 'Zing'),
        power('resistance-to-toxins', 'Resistance to Toxins'),
        power('hardened-mystic-armor', 'Hardened Mystic Armor'),
        power('wall-walking', 'Wall Walking'),
        power('heavy-scales', 'Heavy Scales (Western Drake)'),
      ].join(''),
    ),
  },
  {
    file: 'custom/sr6/imported/zz/adeptpowers.xml',
    xml: ROOT('adeptpowers', '<adeptpower id="zz.improved-sense" source="ZZ" page="7" cost="0.25"><name>Improved Sense</name></adeptpower>'),
  },
  {
    file: 'custom/sr6/imported/zz/qualities.xml',
    xml: ROOT('qualities', '<quality id="zz.built-tough" source="ZZ" page="6" kind="positive" karma="5"><name>Built Tough</name></quality>'),
  },
]
const c = fixtureCatalog(undefined, EXTRA),
  data = sr6Data(c)
const critter = (powers: string, kind: Sr6Npc['kind'] = 'critter'): Sr6Npc => ({
  ...blankSr6Npc(kind, kind === 'spirit' ? 3 : undefined).npc!,
  from: { kind: kind === 'spirit' ? 'spirits' : 'critters', id: 'zz.made-up', name: 'Made-up', source: 'ZZ', page: 1 },
  lines: [{ part: 'powers', text: powers }],
})
const things = (powers: string, kind: Sr6Npc['kind'] = 'critter') => npcThings(critter(powers, kind), c)
const names = (powers: string) => things(powers).map(t => `${t.name}${t.entry ? '' : '*'}`)

test('npc-powers A: a power matches by its name; its brackets, rating and parameters are its detail', () => {
  const [imm, ven, arm] = things(
    'Immunity (Cold, Fire, Toxins), Venom [Vector: Injection; Speed: 1 round; Effect: Dazed, Poisoned (Magic)P], Hardened Armor (4)',
  )
  expect(imm).toMatchObject({ name: 'Immunity', detail: 'Cold, Fire, Toxins', match: { how: 'exact' } })
  expect(ven).toMatchObject({ name: 'Venom', detail: 'Vector: Injection; Speed: 1 round; Effect: Dazed, Poisoned (Magic)P', match: { how: 'exact' } })
  expect(arm).toMatchObject({ name: 'Hardened Armor', values: { rating: 4 }, match: { how: 'exact' } })
  expect(arm.detail).toBeUndefined()
  // the first words that name a power: the rest is the detail
  expect(things('Sapience digital assault')[0]).toMatchObject({ name: 'Sapience', detail: 'digital assault', match: { how: 'exact' } })
  expect(things('Immunity to fire')[0]).toMatchObject({ name: 'Immunity', detail: 'to fire' })
  // the export carries the printed line, the rating and the detail
  const x = exportNpc(critter('Immunity (Cold), Hardened Armor 2'), data, c)
  expect(x.items.map(i => [i.name, i.line.detail, i.line.values.rating])).toEqual([
    ['Immunity', 'Cold', undefined],
    ['Hardened Armor', undefined, 2],
  ])
})

test('npc-powers split: powers the book ran together are each linked (the reader puts the commas back)', () => {
  // as the importer's power_list writes `Hardened Armor 2; Immunity (…)`, `Armor 2. Astral Form`, `(Self Only). Dual Natured`
  expect(names('Armor 2, Astral Form, Concealment (Self Only), Dual Natured')).toEqual(['Armor', 'Astral Form', 'Concealment', 'Dual Natured'])
  expect(names('Hardened Armor 2, Immunity (Cold, Fire, Toxins)')).toEqual(['Hardened Armor', 'Immunity'])
})

test('npc-powers B: a sentence the book ran on after the powers is no power (the reader moves it to the entry’s text)', () => {
  // the line as the importer leaves it: the powers only, the sentence in the entry's text
  expect(names('Dual Natured, Sapience')).toEqual(['Dual Natured', 'Sapience'])
  expect(npcCorrections(things('Dual Natured, Sapience'))).toEqual([])
})

test('npc-powers C: powers the importer now catalogues link (a quality a book defines, a section a book describes, a bracketed name)', () => {
  // Built Tough is a book's quality; Zing is a section the importer made a critter power of (statpowers.py)
  expect(things('Built Tough 2')[0]).toMatchObject({ kind: 'qualities', name: 'Built Tough', values: { rating: 2 }, match: { how: 'exact' } })
  expect(things('Zing (must run, knocks the target down)')[0]).toMatchObject({
    kind: 'critterpowers',
    name: 'Zing',
    detail: 'must run, knocks the target down',
  })
  // a book's `Heavy Scales (Western Drake)` is the bare `Heavy Scales`
  expect(things('Heavy Scales')[0]).toMatchObject({ kind: 'critterpowers', name: 'Heavy Scales (Western Drake)', match: { how: 'exact' } })
})

test('npc-powers D: a power no book defines stays a generic critter power with the printed name', () => {
  const [t] = things('Zork Glow (green, dim)')
  expect(t).toMatchObject({ kind: 'critterpowers', name: 'Zork Glow', printedName: 'Zork Glow', detail: 'green, dim' })
  expect(t.entry).toBeUndefined()
  expect(npcCorrections([t])).toEqual(['Not in the catalog, built from the stat block: Zork Glow'])
})

test('npc-powers: a guess never drops or swaps a word of the name', () => {
  // `Improved Close Combat` is no `Improved Sense` (words swapped), though the names are 79% alike: it stays a generic power
  const [t] = things('Improved Close Combat 1')
  expect(t).toMatchObject({ kind: 'critterpowers', name: 'Improved Close Combat', values: { rating: 1 } })
  expect(t.entry).toBeUndefined()
  // the same words in another order are the same power, at the printed rating
  expect(things('Mystic Hardened Armor 4')[0]).toMatchObject({ name: 'Hardened Mystic Armor', values: { rating: 4 } })
  // connectors and plurals do not matter to the words
  expect(things('Toxin Resistance')[0]).toMatchObject({ name: 'Resistance to Toxins', match: { how: 'fuzzy' } })
  // a close spelling of the same words still links
  expect(things('Concealments')[0]).toMatchObject({ name: 'Concealment', match: { how: 'fuzzy' } })
  expect(things('Wall Walk')[0]).toMatchObject({ name: 'Wall Walking', match: { how: 'fuzzy' } })
})

test('npc-powers: an export with a power’s detail is valid against the export schema', () => {
  const schema = new Ajv2020({ strict: false, validateFormats: false }).compile(JSON.parse(readFileSync('public/data/schema/sr6-export.schema.json', 'utf8')))
  const ch = blankSr6Npc('critter')
  ch.npc = critter('Immunity (Cold, Fire), Zork Glow (green)')
  const f = exportSr6Runners(c, data, fixtureCreation(), [ch], SAMPLE_OPTS)
  expect(f.runners![0].npc!.items.map(i => i.line.detail)).toEqual(['Cold, Fire', 'green'])
  expect(schema(f), JSON.stringify(schema.errors)).toBe(true)
})
