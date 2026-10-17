// A critter the GM designs (owner 2026-10-16, BUILDER Q11): its printed lines read into catalog powers, weaknesses and
// skills; the lines generated again; Condition Monitor, Defense Rating and Initiative by the table's formulas, a typed
// value staying; sanity warnings only; the file; a copy into a compendium as a critters entry a runner can own.
// Invented entries, invented numbers (the fixture's monitorBase 9, monitorDivisor 3, specDice 4).
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { validateXML } from 'xmllint-wasm'
import { sr6ToXml, xmlToSr6 } from '../../src/sr6/engine/charxml'
import { critterAsEntry, entryProblem } from '../../src/sr6/engine/compendium'
import { critterDerived, critterWarnings, designCritter, redesign, splitLine } from '../../src/sr6/engine/critterdesign'
import { critterPrice } from '../../src/sr6/engine/critters'
import { sr6Data } from '../../src/sr6/engine/data'
import { blankSr6Npc, npcFromEntry } from '../../src/sr6/engine/npc'
import { fixtureCatalog, fixtureCreation } from './fixture'

const NS = 'xmlns:sr6="urn:chummer-sr6:data:1"'
const at = 'source="ZZ" page="3"'
const POWERS = `<sr6:data ${NS} kind="critterpowers" version="1">
  <critterpower id="zz.armor" ${at} type="P"><name>Armor</name><text/></critterpower>
  <critterpower id="zz.scaly-plates" ${at} type="P"><name>Scaly Plates</name><link rel="as" name="Hardened Armor"/><text/></critterpower>
  <critterpower id="zz.sparkle-sense" ${at} type="P"><name>Sparkle Sense</name><text/></critterpower>
  <critterpower id="zz.inborn-trick" ${at} type="M"><name>Inborn Trick</name><selection type="SPELL"/><text/></critterpower>
  <critterpower id="zz.soap-allergy" ${at} type="P" weakness="true"><name>Soap Allergy</name><text/></critterpower>
</sr6:data>`
const CRITTERS = `<sr6:data ${NS} kind="critters" version="1">
  <critter id="zz.bramblehog" ${at} bod="5" agi="3" rea="2" str="4" wil="2" log="1" int="3" cha="1" edg="1" ess="6" init="5/2" cm="99" dr="7">
    <name>Bramblehog</name><skills>Tinkering 3 (Gizmos +4), Gab 2, Moonwalking 1</skills><powers>Armor 2, Sparkle Sense (Glitter, Dust), Mystery Glow</powers><weaknesses>Soap Allergy (mild)</weaknesses><text/></critter>
</sr6:data>`
const world = () => {
  const c = fixtureCatalog(undefined, [
    { file: 'custom/sr6/imported/zz/critterpowers.xml', xml: POWERS },
    { file: 'custom/sr6/imported/zz/critters.xml', xml: CRITTERS },
  ])
  return { c, data: sr6Data(c), cr: fixtureCreation() }
}

test('a line splits at its commas outside parentheses', () => {
  expect(splitLine('Armor 2, Sparkle Sense (Glitter, Dust),  , Mystery Glow')).toEqual(['Armor 2', 'Sparkle Sense (Glitter, Dust)', 'Mystery Glow'])
})

test('a catalog copy made designable: powers, weaknesses and skills matched by name, the rest kept; printed values stay', () => {
  const { c, data, cr } = world()
  const npc = npcFromEntry(c.entries.critters.get('zz.bramblehog')!).npc!
  designCritter(npc, data, cr)
  expect(npc.design).toEqual({
    powers: [{ id: 'zz.armor', name: 'Armor', level: 2 }, { id: 'zz.sparkle-sense', name: 'Sparkle Sense', note: 'Glitter, Dust' }, { name: 'Mystery Glow' }],
    weaknesses: [{ id: 'zz.soap-allergy', name: 'Soap Allergy', note: 'mild' }],
    skills: [
      { id: 'crb.tinkering', name: 'Tinkering', rank: 3, spec: 'Gizmos' },
      { id: 'crb.gab', name: 'Gab', rank: 2 },
      { name: 'Moonwalking', rank: 1 },
    ],
    dice: 2,
  })
  // the lines as generated (a specialization's dice: specDice)
  expect(Object.fromEntries(npc.lines.map(l => [l.part, l.text]))).toMatchObject({
    skills: 'Tinkering 3 (Gizmos +4), Gab 2, Moonwalking 1',
    powers: 'Armor 2, Sparkle Sense (Glitter, Dust), Mystery Glow',
    weaknesses: 'Soap Allergy (mild)',
  })
  // the book copy's printed values stay; the missing ones are derived
  expect(npc.stats).toMatchObject({ cm: '99', dr: '7', init: '5/2' })
})

test('derived: Condition Monitor by the table’s settings, Defense Rating Body + Armor powers, Initiative REA + INT + dice', () => {
  const { data, cr } = world()
  const npc = blankSr6Npc('critter').npc!
  designCritter(npc, data, cr)
  expect(npc.stats).toEqual({ cm: '9', dr: '0', init: '0 + 1D6' })
  redesign(npc, data, cr, n => {
    Object.assign(n.stats, { bod: '7', rea: '3', int: '4' })
    n.design!.powers.push({ id: 'zz.armor', name: 'Armor', level: 2 }, { id: 'zz.scaly-plates', name: 'Scaly Plates', level: 1 })
    n.design!.dice = 3
  })
  // 9 + ceil(7 / 3); 7 + 2 + 1 (Scaly Plates works as Hardened Armor); 3 + 4
  expect(npc.stats).toMatchObject({ cm: '12', dr: '10', init: '7 + 3D6' })
  expect(npc.lines).toEqual([{ part: 'powers', text: 'Armor 2, Scaly Plates 1' }])
  // a value the GM typed stays through later changes; the others follow
  npc.stats.dr = '15'
  redesign(npc, data, cr, n => {
    n.stats.bod = '10'
  })
  expect(npc.stats).toMatchObject({ cm: '13', dr: '15' })
  expect(critterDerived(npc, data, cr).dr).toBe('13')
  // unset monitor settings: no Condition Monitor
  cr.delete('monitorBase')
  expect(critterDerived(npc, data, cr).cm).toBeNull()
})

test('warnings, never refusals: above every printed critter, not in the catalog, a choice unmade, Armor without a level, a missing attribute, too many dice', () => {
  const { c, data, cr } = world()
  const printed = [...c.entries.critters.values()]
  const npc = blankSr6Npc('critter').npc!
  designCritter(npc, data, cr)
  redesign(npc, data, cr, n => {
    Object.assign(n.stats, { bod: '20', log: '1' })
    n.design!.powers.push({ id: 'zz.inborn-trick', name: 'Inborn Trick' }, { id: 'zz.armor', name: 'Armor' }, { name: 'Made-up Power' })
    n.design!.skills.push({ id: 'crb.glowcraft', name: 'Glowcraft', rank: 2 }, { id: 'crb.tinkering', name: 'Tinkering', rank: 1 })
    n.design!.dice = 6
  })
  cr.set('initiativeDiceMax', { key: 'initiativeDiceMax', value: 5, source: 'ZZ', page: 9 })
  const top = printed.reduce((a, e) => (Number(e.attrs.bod ?? 0) > Number(a.attrs.bod ?? 0) ? e : a))
  expect(critterWarnings(npc, data, cr, printed).map(w => w.message)).toEqual([
    `BOD 20 is above every printed critter’s: the highest is ${top.attrs.bod} (${top.name}).`,
    'Inborn Trick asks for a choice: write it in its note.',
    'Armor has no level: it adds nothing to the Defense Rating.',
    'The power Made-up Power isn’t in the catalog: it prints as entered.',
    'Glowcraft uses Magic; the critter has none.',
    '6 initiative dice; the table allows 5.',
  ])
  redesign(npc, data, cr, n => {
    n.stats.bod = '1'
    n.stats.mag = '3'
    n.design!.powers = [{ id: 'zz.inborn-trick', name: 'Inborn Trick', note: 'Sparkle' }]
    n.design!.dice = 2
  })
  expect(critterWarnings(npc, data, cr, printed)).toEqual([])
})

const XSD = readFileSync('public/data/sr6/schema/character.xsd', 'utf8')
test('the file keeps the design and validates; an old NPC file reads as before', async () => {
  const { c, data, cr } = world()
  const ch = npcFromEntry(c.entries.critters.get('zz.bramblehog')!, undefined, '2026-10-16T00:00:00.000Z')
  const plain = sr6ToXml(ch)
  expect(plain).not.toMatch(/designed=/)
  designCritter(ch.npc!, data, cr)
  const xml = sr6ToXml(ch)
  expect((await validateXML({ xml: { fileName: 'n.xml', contents: xml }, schema: { fileName: 'character.xsd', contents: XSD } })).errors).toEqual([])
  const back = xmlToSr6(xml)
  expect(back.ok && back.character).toEqual(ch)
})

test('a GM’s critter into a compendium: a critters entry a runner can own, priced from its Body (Wild Life p. 180)', () => {
  const { c, data, cr } = world()
  const ch = blankSr6Npc('critter')
  ch.identity.streetName = 'Puddle Drake'
  designCritter(ch.npc!, data, cr)
  redesign(ch.npc!, data, cr, n => {
    Object.assign(n.stats, { bod: '6', mag: '2', move: '5/10/+1' })
    n.design!.powers.push({ id: 'zz.armor', name: 'Armor', level: 1 })
    n.lines.unshift({ part: 'attacks', text: 'Splash 4S' })
  })
  const e = critterAsEntry(c, ch, { source: 'HOUSE', entries: [] })
  expect(e).toMatchObject({ id: 'house.puddle-drake', kind: 'critters', name: 'Puddle Drake', source: 'HOUSE', page: 1, text: '' })
  expect(e.attrs).toEqual({ bod: '6', mag: '2', move: '5/10/+1', cm: '11', dr: '7', init: '0 + 1D6' })
  // common.xsd's order: powers before attacks
  expect(e.parts.map(p => p.tag)).toEqual(['powers', 'attacks'])
  expect(entryProblem(e)).toBe('')
  // owned by a runner, it's Awakened by its own Magic; the pricing reads its Body and Magic (no price rows here: noted)
  expect(critterPrice({ uid: 'x', kind: 'critters', id: e.id, snapshot: e, accessories: [] }, data)).toMatchObject({ cls: 'awakened' })
})
