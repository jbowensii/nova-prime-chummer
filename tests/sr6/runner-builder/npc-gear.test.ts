// Book NPC gear and augmentation lines linked to the catalog (src/sr6/runner-builder/domain/creation/npc.ts npcThings), by the
// owner's rulings of 2026-10-21 ("NPC unlinked gear"): A GM instructions are notes, B prose and grades split from items, C names
// normalised to the catalog's, D what no book prints stays plain gear. A small invented catalog; no book text.
import { expect, test } from 'vitest'
import { buildSr6Catalog } from '../../../src/sr6/catalog/domain/load'
import { sr6Data } from '../../../src/sr6/catalog/domain/data'
import { exportNpc } from '../../../src/sr6/foundry/domain/export'
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
    ['std-tags', 'Standard tags', { category: 'Tags' }],
    ['mob-light', 'Mob Light', { category: 'Lights' }],
    ['low-light', 'Low-light vision', { category: 'Accessory' }],
    ['sav-c', 'Therapeutic Nanites (Savior System) Colony', { category: 'Colony and nanite' }],
    ['sav-n', 'Therapeutic Nanites (Savior System) Nanites', { category: 'Colony and nanite' }],
  ]),
  file('electronics', [
    ['goggles', 'Goggles', { category: 'Optical device' }],
    ['test-deck', 'Test Deck', { category: 'Cyberdeck' }],
    ['emperor', 'Sony Emperor Test', { category: 'Commlink', rating: '2', cost: '700' }],
    ['contacts', 'Contacts 1', { category: 'Optical device', rating: '1' }],
    ['glasses1', 'Glasses 1', { category: 'Optical device', rating: '1' }],
    ['glasses2', 'Glasses 2', { category: 'Optical device', rating: '2' }],
    ['glasses3', 'Glasses 3', { category: 'Optical device', rating: '3' }],
    ['link1', 'Meta Link', { category: 'Commlink', rating: '1', cost: '100' }],
    ['link5', 'Hermes Test', { category: 'Commlink', rating: '5', cost: '900' }],
    ['link6', 'Avalon Test', { category: 'Commlink', rating: '6', cost: '3000' }],
  ]),
  file('armor', [
    ['bdu', 'Basic Duty Utilities', { category: 'Armor', defense: '+2' }],
    ['jacket', 'Armor jacket', { category: 'Armor', defense: '+4' }],
    ['vest', 'Armor vest', { category: 'Armor', defense: '+3' }],
    ['lined', 'Lined coat', { category: 'Armor', defense: '+3' }],
    ['hood', 'Ballistic hood', { category: 'Armor', defense: '+1' }],
    ['helmet', 'Helmet', { category: 'Armor', defense: '+1' }],
    ['cloak', 'Test cloak', { category: 'Armor', defense: '+1' }],
    ['clothes', 'Street clothes', { category: 'Armor', defense: '+1' }],
    ['fba', 'Full body armor w/ helmet', { category: 'Armor', defense: '+7' }],
  ]),
  file('vehicles', [['bulldog', 'GMC Bulldog', { category: 'Trucks and van' }]]),
  file('lifestyles', [
    ['middle', 'Middle', { cost: '5000' }],
    ['low', 'Low', { cost: '2000' }],
  ]),
  file('critters', [
    ['horse', 'Horse'],
    ['kin', 'Spirit Of Kin'],
  ]),
  file('grades', [['delta', 'Deltaware', { essence: '0.5', cost: '2.5', avail: '3' }]]),
  file('datastructures', [['oracle', 'Oracle']]),
  file('licencetypes', [
    ['lic-c', 'Cyberware license'],
    ['lic-s', 'Spellcasting license'],
  ]),
  file('weapons', [
    ['reg', 'Crackshot Regulator', { category: 'Exotic weapon', type: 'Gun gauntlet' }],
    ['bolt', 'Bolt', { category: 'Projectile' }],
    ['ballista', 'Ballista Bolt, Standard', { category: 'Airship weapon' }],
  ]),
  file('augmentations', [
    ['datajack', 'Datajack', { type: 'cyberware', category: 'Headware', cost: '1000', essence: '0.1', avail: '2' }],
    ['eyes6', 'Cybereyes (Rating 6)', { type: 'cyberware', category: 'Cybereyes', rating: '6' }],
    ['eyes7', 'Cybereyes (Rating 7)', { type: 'cyberware', category: 'Cybereyes', rating: '7' }],
    ['eyes3', 'Cybereyes basic system (Rating 3)', { type: 'cyberware', category: 'Eyeware', rating: '3' }],
    ['eyes4', 'Cybereyes basic system (Rating 4)', { type: 'cyberware', category: 'Eyeware', rating: '4' }],
    ['bl-p', 'Bone lacing (Plastic)', { type: 'cyberware', category: 'Bodyware' }],
    ['bl-a', 'Bone lacing (Aluminum)', { type: 'cyberware', category: 'Bodyware' }],
    ['bl-t', 'Bone lacing (Titanium)', { type: 'cyberware', category: 'Bodyware' }],
    ['gm-p', 'GMT bone lacing (Plastic)', { type: 'cyberware', category: 'Bodyware' }],
    ['ears6', 'Cyberears (Rating 6)', { type: 'cyberware', category: 'Earware', rating: '6' }],
    ['leg-o', 'Leg (obvious)', { type: 'cyberware', category: 'Cyberlimb' }],
    ['leg-s', 'Leg (synthetic)', { type: 'cyberware', category: 'Cyberlimb' }],
    ['skilljack', 'Skilljack', { type: 'cyberware', category: 'Headware' }],
    ['skillwires', 'Skillwires', { type: 'cyberware', category: 'Bodyware' }],
    ['wired', 'Wired reflexes', { type: 'cyberware', category: 'Bodyware' }],
    ['hear', 'Increased spectrum hearing', { type: 'bioware', category: 'Earware' }],
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
  expect(names('gear', 'low lifestyle (current month only)')).toEqual(['Low'])
  // a word the catalog does not have stays plain gear
  expect(names('gear', 'Medium lifestyle (current month only)')).toEqual(['(built) Medium lifestyle'])
  expect(names('gear', 'data structure (Oracle 4)')).toEqual(['Oracle'])
  expect(things('gear', 'data structure (Oracle 4)')[0].values.rating).toBe(4)
  expect(names('gear', 'standard credstick')).toEqual(['Standard']) // a type name alone is its standard item
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

test('C: a variant named inside an entry, the same words in another order, a type word and a licence list link', () => {
  // the variant alone (the nanites, not the colony); on an augmentation line too
  expect(names('augmentations', 'savior system')).toEqual(['Therapeutic Nanites (Savior System) Nanites'])
  expect(names('augmentations', '[savior system, datajack]')).toEqual(['Therapeutic Nanites (Savior System) Nanites', 'Datajack'])
  expect(names('augmentations', 'increased hearing spectrum')).toEqual(['Increased spectrum hearing'])
  expect(names('gear', 'regulator gauntlets (Foo Roomsweepers attached)')).toEqual(['Crackshot Regulator'])
  const [f] = things('gear', 'fake SIN [rating 4; w/ licenses (cyberware, bioware, spellcasting)]')
  // a licence by its name only: another's name is not a guess at it
  expect(f.accessories.map(a => [a.name, a.entry?.name])).toEqual([
    ['Cyberware license', 'Cyberware license'],
    ['bioware license', undefined],
    ['Spellcasting license', 'Spellcasting license'],
  ])
})

test('negative: a stand-in that is nothing like the name, or a wrong kind of armor, is no link', () => {
  // no "Certified credstick" in the catalog: plain gear, not the Standard credstick
  expect(names('gear', 'certified credisticks (for payments)')).toEqual(['(built) certified credisticks'])
  // standard bolts are the Bolt, not the Standard tags
  expect(names('gear', 'standard bolts')).toEqual(['Bolt'])
  // armor of a printed Defense with no name: body armor, never a helmet, the same for every NPC
  for (const text of ['Gang leather (+1 Defense Rating)', 'gang leathers (Defense Rating+1)']) {
    const [a] = things('gear', text)
    expect(a.entry?.kind).toBe('armor')
    expect(a.entry?.name).not.toMatch(/helmet|cloak/i)
  }
  const [suit] = things('gear', 'Aubert bodyguard suit (+3) with electric insulation 1')
  expect(suit.entry?.name).toBe('Armor vest')
  expect(suit.accessories.map(a => a.name)).toEqual(['electric insulation 1'])
})

test('negative: the printed rating picks its level, a commlink its device rating or the nearest below', () => {
  expect(things('augmentations', 'Cybereyes 3 w/ camera')[0].entry?.name).toBe('Cybereyes basic system (Rating 3)')
  expect(things('augmentations', 'cybereyes [rating 3, w/ image link]')[0].entry?.name).toBe('Cybereyes basic system (Rating 3)')
  expect(names('gear', 'commlink (device rating 6, armorlink upgrade 6)')).toEqual(['Avalon Test'])
  expect(names('gear', 'commlink (device rating 5)')).toEqual(['Hermes Test'])
  expect(names('gear', 'commlink (device rating 7)')).toEqual(['Avalon Test']) // the nearest below
})

test('negative: a first word alone is not the item, a creature is not gear, a variant two families share is nobody’s', () => {
  expect(names('gear', 'medkit pouch')).toEqual(['(built) medkit pouch'])
  expect(names('augmentations', 'datajack adapter')).toEqual(['(built) datajack adapter'])
  expect(names('gear', 'horse saddle')).toEqual(['(built) horse saddle'])
  expect(names('gear', 'spirit of kin (Force 4, 2 services)')).toEqual(['Spirit Of Kin'])
  // `plastic` is a bone lacing and a GMT bone lacing
  expect(names('augmentations', 'plastic')).toEqual(['(built) plastic'])
  // goggles with a low-light add-on: the add-on is no `Mob Light`
  expect(things('gear', 'goggles w/ low-light').flatMap(t => t.accessories.map(a => a.entry?.name))).toEqual(['Low-light vision'])
})

test('a link through another form of the name is shown as the guess it is', () => {
  const [t] = things('gear', '2 x jazz inhalers')
  expect(t.match?.how).toBe('fuzzy')
  expect(npcCorrections([t]).join()).toContain('Jazz')
  // the full name with its w/ keeps the entry that has it
  expect(names('gear', 'Full body armor with helmet (+7)')).toEqual(['Full body armor w/ helmet'])
})

test('a list of licences after w/ keeps its list; a line label ends the grade before it', () => {
  const [h] = things('gear', 'Commlink w/ licenses (augmentation, pistols, RCC)')
  expect(h.accessories.map(a => a.name)).toEqual(['augmentation license', 'pistols license', 'RCC license'])
  const [k] = things('gear', 'Commlink w/ fake licenses 3 (firearms, magic)')
  expect(k.accessories.map(a => a.name)).toEqual(['firearms license', 'magic license'])
  expect(things('augmentations', '(all deltaware): datajack. Gear: datajack').map(x => x.grade)).toEqual(['delta', undefined])
})

test('a graded augmentation is priced with its grade', () => {
  const ch = blankSr6Npc('grunt', 3)
  ch.npc!.lines = [{ part: 'augmentations', text: 'datajack (deltaware)' }]
  const x = exportNpc(ch.npc!, sr6Data(c), c)
  expect(x.items[0]).toMatchObject({ grade: 'delta', values: { cost: 2500, essence: 0.05, avail: 5 } })
})

test('C: a model named by its form, a package naming its parts, a form word, and a placeholder for a job', () => {
  expect(names('gear', 'custom commlink (Sony Emperor Test form, DR 3, 3/1)')).toEqual(['Sony Emperor Test'])
  // the package stays plain gear, its parts link
  expect(names('augmentations', 'metahuman control package (skilljack 6, skillwires 6, wired reflexes 2)')).toEqual([
    '(built) metahuman control package',
    'Skilljack',
    'Skillwires',
    'Wired reflexes',
  ])
  // a name that links is not split into its bracket's parts
  expect(names('augmentations', 'Skilljack (rating 6, w/ image link)')).toEqual(['Skilljack'])
  expect(names('gear', 'trode net')).toEqual(['Trodes'])
  expect(names('gear', 'trode pouch')).toEqual(['(built) trode pouch'])
  expect(names('gear', 'medkit, all skillsofts needed for a specific job (rating 6)')).toEqual(['Medkit'])
})

test('negative: an attribute value is no item, contact lenses are Contacts, bolts are the crossbow’s, a long coat is the Lined coat', () => {
  expect(names('augmentations', 'Agility 9, datajack, Armor 3')).toEqual(['Datajack'])
  expect(things('augmentations', 'datajack (w/ Agility 9, Strength 4)')[0].accessories).toEqual([])
  expect(names('gear', 'contact lenses (image link)')).toEqual(['Contacts 1'])
  const [x] = things('gear', 'crossbow w/ standard bolts')
  expect(x.accessories.map(a => a.entry?.name)).toEqual(['Bolt'])
  expect(names('gear', 'longcoat (+3)')).toEqual(['Lined coat'])
})

test('negative: head gear is head armor, never a jacket; a rating above the top level takes the top level', () => {
  expect(names('gear', 'hood (+1)')).toEqual(['Ballistic hood'])
  expect(names('gear', 'visor (+1)')).not.toContain('Street clothes')
  expect(names('gear', 'smartglasses (device rating 7)')).toEqual(['Glasses 3'])
  expect(names('gear', 'smartglasses (device rating 2)')).toEqual(['Glasses 2'])
})

test('negative: a cyberlimb is never another body part, a plus joins two things', () => {
  // the catalog here has no arm entry: not Cyberears by spelling
  expect(names('augmentations', 'cyberarm [right, obvious, w/ silencer]')).toEqual(['(built) cyberarm'])
  expect(names('augmentations', 'cyberleg (obvious)')).toEqual(['Leg (obvious)'])
  const t = things('gear', 'Armor jacket + helmet (DR+5)')
  expect(t.map(x => x.entry?.name)).toEqual(['Armor jacket', 'Helmet'])
  expect(t[0].values.defense).toBe(5)
  expect(t[1].values.defense).toBeUndefined()
})
