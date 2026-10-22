// Book NPC gear and augmentation lines linked to the catalog (src/sr6/runner-builder/domain/creation/npc.ts npcThings), by the
// owner's rulings of 2026-10-21 ("NPC unlinked gear"): A GM instructions are notes, B prose and grades split from items, C names
// normalised to the catalog's, D what no book prints stays plain gear. A small invented catalog; no book text.
import { expect, test } from 'vitest'
import { buildSr6Catalog } from '../../../src/sr6/catalog/domain/load'
import { blankSr6Npc, npcCorrections, npcThings } from '../../../src/sr6/runner-builder/domain/creation/npc'
import { SR6_KINDS, type Sr6Kind } from '../../../src/sr6/formats/domain/types'

const NS = 'xmlns:sr6="urn:chummer-sr6:data:1"'
type Row = [string, string, Record<string, string>?]
const file = (kind: Sr6Kind, rows: Row[]) => ({
  file: `${kind}.xml`,
  overlay: true,
  xml: `<sr6:data ${NS} kind="${kind}" version="1">${rows
    .map(([id, name, a = {}]) => {
      const attrs = Object.entries({ source: 'TST', page: '1', ...a })
        .map(([k, v]) => ` ${k}="${v}"`)
        .join('')
      return `<${SR6_KINDS[kind].tag} id="tst.${id}"${attrs}><name>${name}</name></${SR6_KINDS[kind].tag}>`
    })
    .join('')}</sr6:data>`,
})
const c = buildSr6Catalog([
  file('gear', [
    ['jazz', 'Jazz', { category: 'Drug' }],
    ['novacoke', 'Novacoke', { category: 'Drug' }],
    ['medkit', 'Medkit', { category: 'Medical' }],
    ['trodes', 'Trodes', { category: 'Accessory' }],
    ['standard-stick', 'Standard', { category: 'Credstick', cost: '5' }],
    ['gold-stick', 'Gold', { category: 'Credstick', cost: '100' }],
    ['image-link', 'Image link', { category: 'Accessory' }],
  ]),
  file('electronics', [
    ['goggles', 'Goggles', { category: 'Optical device' }],
    ['test-deck', 'Test Deck', { category: 'Cyberdeck' }],
  ]),
  file('armor', [
    ['bdu', 'Basic Duty Utilities', { category: 'Armor', defense: '+2' }],
    ['jacket', 'Armor jacket', { category: 'Armor', defense: '+4' }],
  ]),
  file('vehicles', [['bulldog', 'GMC Bulldog', { category: 'Trucks and van' }]]),
  file('lifestyles', [['middle', 'Middle', { cost: '5000' }]]),
  file('datastructures', [['oracle', 'Oracle']]),
  file('augmentations', [
    ['datajack', 'Datajack', { type: 'cyberware', category: 'Headware' }],
    ['hand-o', 'Hand (obvious)', { type: 'cyberware', category: 'Cyberlimb' }],
    ['hand-s', 'Hand (synthetic)', { type: 'cyberware', category: 'Cyberlimb' }],
    ['geno-a', 'Genotype Enhancement (Alpha Factor)', { type: 'geneware', category: 'Augmentic geneware' }],
    ['geno-q', 'Genotype Enhancement (Qualia)', { type: 'geneware', category: 'Augmentic geneware' }],
    ['geno-r', 'Genotype Enhancement (Reakt)', { type: 'geneware', category: 'Augmentic geneware' }],
  ]),
])
/** the things a grunt's one line prints */
const things = (part: string, text: string) => {
  const ch = blankSr6Npc('grunt', 3)
  ch.npc!.lines = [{ part, text }]
  return npcThings(ch.npc!, c)
}
const names = (part: string, text: string) => things(part, text).map(t => t.entry?.name ?? `(built) ${t.name}`)

test('A: a GM instruction is a note, never an item', () => {
  expect(names('gear', 'Medkit, as needed, Other gear as needed, 6 Copies, As selected by the gamemaster, *fit to situation, Whatever she needs.')).toEqual([
    'Medkit',
  ])
  expect(names('gear', 'Medkit (w/ 3 programs of GM’s choice)')).toEqual(['Medkit'])
  expect(things('gear', 'Medkit (w/ 3 programs of GM’s choice)')[0].accessories).toEqual([])
  expect(names('augmentations', 'Text')).toEqual([])
  // a sentence after the item is a note too
  expect(names('gear', 'Test Deck (DR 6). Other gear as needed.')).toEqual(['Test Deck'])
})

test('B: a grade word is the grade of its items, prose and lone qualifiers are no items', () => {
  const t = things(
    'augmentations',
    'He has a mix of ware that raises his numbers. He also gains a +2 bonus on any Logic test. In addition, he has the following deltaware items: datajack, bioware',
  )
  expect(t.map(x => [x.entry?.name, x.grade])).toEqual([['Datajack', 'delta']])
  expect(things('augmentations', '(all betaware): datajack').map(x => x.grade)).toEqual(['beta'])
  expect(things('augmentations', 'datajack (alphaware)').map(x => x.grade)).toEqual(['alpha'])
  // a grade alone after an item grades that item
  expect(things('augmentations', 'datajack, (delta), Hand (obvious)').map(x => [x.entry?.name, x.grade])).toEqual([
    ['Datajack', 'delta'],
    ['Hand (obvious)', undefined],
  ])
  // a deck named after its type keeps its printed stats as values
  const deck = things('augmentations', 'cyberdeck: Test Deck (DR 6, A 9, S 8, program slots 12)')[0]
  expect(deck.entry?.name).toBe('Test Deck')
  expect(deck.values.rating).toBe(6)
})

test('C: names are normalised to the catalog’s, in any kind', () => {
  expect(names('gear', 'smartgoggles')).toEqual(['Goggles']) // a glued word split
  expect(names('gear', 'Bulldog stepvan')).toEqual(['GMC Bulldog'])
  expect(names('gear', 'BDUs')).toEqual(['Basic Duty Utilities']) // an initialism
  expect(names('gear', 'Medium lifestyle (current month only)')).toEqual(['Middle'])
  expect(names('gear', 'data structure (Oracle 4)')).toEqual(['Oracle'])
  expect(things('gear', 'data structure (Oracle 4)')[0].values.rating).toBe(4)
  expect(names('gear', 'certified credisticks (for payments)')).toEqual(['Standard']) // a plural, a typo: the standard credstick
  expect(names('gear', 'datajack')).toEqual(['Datajack']) // an augmentation on a gear line
  expect(names('gear', 'commlink and trodes (device rating 4)')).toContain('Trodes')
})

test('C: sides and qualifiers pick the cyberlimb, a variant family’s member stands alone, a bracket list is several things', () => {
  expect(names('augmentations', 'Cyberhand (right, obvious)')).toEqual(['Hand (obvious)'])
  expect(names('augmentations', 'cyberhand (synthetic, right, shock hand)')).toEqual(['Hand (synthetic)'])
  expect(names('augmentations', 'Reakt.')).toEqual(['Genotype Enhancement (Reakt)'])
  expect(names('augmentations', 'genotype enhancements (Alpha Factor , Qualia]')).toEqual([
    'Genotype Enhancement (Alpha Factor)',
    'Genotype Enhancement (Qualia)',
  ])
})

test('C: w/ and with add-ons are accessories, kept as plain gear when the catalog has none', () => {
  const [a] = things('gear', 'Armor jacket (+4) with image link and electric insulation 1')
  expect(a.entry?.name).toBe('Armor jacket')
  expect(a.accessories.map(x => [x.name, x.entry?.name])).toEqual([
    ['Image link', 'Image link'],
    ['electric insulation 1', undefined],
  ])
  expect(npcCorrections([a]).join('\n')).toContain('electric insulation 1')
  const [g] = things('gear', 'Goggles (w/ image link, night frobnicator)')
  expect(g.accessories.map(x => x.name)).toEqual(['Image link', 'night frobnicator'])
})

test('C: Jazz is a drug and an inhaler only its delivery', () => {
  for (const text of ['2 x jazz inhalers (*+1 Reaction, +2I)', '2x jazz inhaler', 'jazz inhalers x2', 'Jazz (x2)']) {
    const t = things('gear', text)
    expect(t.map(x => [x.entry?.name, x.qty])).toEqual([['Jazz', 2]])
  }
  expect(names('gear', 'dose of jazz')).toEqual(['Jazz'])
  expect(names('gear', '2 x novacoke inhaler')).toEqual(['Novacoke'])
  expect(names('gear', 'personal inhaler (jazz, novacoke, 1 dose each)')).toEqual(['Jazz', 'Novacoke'])
})

test('D: what no book prints becomes plain gear with the printed name', () => {
  const [t] = things('gear', '2 x packs of cigarettes')
  expect(t).toMatchObject({ kind: 'gear', qty: 2 })
  expect(t.entry).toBeUndefined()
  expect(t.name).toBe('packs of cigarettes')
  const [f] = things('gear', 'Faustian crystal 6')
  expect(f).toMatchObject({ kind: 'gear', name: 'Faustian crystal 6' })
  expect(f.entry).toBeUndefined()
  expect(f.values.rating).toBe(6)
})
