// npc-combat-items: an NPC's or critter's stat block lines as the items its Foundry sheet fights with (owner 2026-10-20:
// weapons, attacks, armor, gear and powers must be on the actor so it can roll). The lines copy the shapes the books print
// (a bracket per weapon, attacks with no bracket and no comma between them, Force formulas, `w/` accessories, a level's
// number); names and numbers are invented (book numbers stay out of tests). The live check is npc-combat-items-live.test.ts.
import { readFileSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020'
import { expect, test } from 'vitest'
import { sr6Data } from '../../src/sr6/engine/data'
import { exportNpc, exportSr6Runners } from '../../src/sr6/engine/export'
import { blankSr6Npc, splitThings } from '../../src/sr6/engine/npc'
import type { Sr6Npc } from '../../src/sr6/model/character'
import { fixtureCatalog, fixtureCreation } from './fixture'
import { SAMPLE_OPTS } from './samples'

const c = fixtureCatalog(),
  data = sr6Data(c)
const npc = (kind: Sr6Npc['kind'], lines: Record<string, string>, rating?: number): Sr6Npc => ({
  ...blankSr6Npc(kind, rating).npc!,
  from: { kind: kind === 'grunt' ? 'npcs' : kind === 'spirit' ? 'spirits' : 'critters', id: 'crb.made-up', name: 'Made-up', source: 'CRB', page: 10 },
  stats: { bod: '4', agi: '4', str: '3', rea: '3' },
  lines: Object.entries(lines).map(([part, text]) => ({ part, text })),
})
const by = (items: ReturnType<typeof exportNpc>['items'], name: string) => items.find(i => i.name === name)!

test('npc-combat-items: a line splits into its things however the book prints them', () => {
  expect(splitThings('Bite [Close Combat, DV 2P, 8/—/—/—/—] Tail Lash [Close Combat, DV 2S (sets Made-up I status), 9/—/—/—/—]')).toEqual([
    'Bite [Close Combat, DV 2P, 8/—/—/—/—]',
    'Tail Lash [Close Combat, DV 2S (sets Made-up I status), 9/—/—/—/—]',
  ])
  expect(splitThings('Bite 2P, 6/—/—/—/— Claw 1P, 4/—/—/—/—')).toEqual(['Bite 2P, 6/—/—/—/—', 'Claw 1P, 4/—/—/—/—'])
  expect(splitThings('Claws: DV 3P, Attack Ratings 9/—/—/—/—; Bite: DV 4P, Attack Rating 9, Infection')).toEqual([
    'Claws: DV 3P, Attack Ratings 9/—/—/—/—',
    'Bite: DV 4P, Attack Rating 9, Infection',
  ])
  // a weapon in round brackets, an opener left open inside a bracket, a stray closer, and book text after `**`
  expect(splitThings('Made-up Popper (Light Pistol, DV 2P, 9/8/6/—/—) Knife (Blade, DV 2P, 6/—/—/—/—)')).toEqual([
    'Made-up Popper (Light Pistol, DV 2P, 9/8/6/—/—)',
    'Knife (Blade, DV 2P, 6/—/—/—/—)',
  ])
  expect(splitThings('Engulf [(DV (F + 2)S + Fatigue I, Attack Ratings (F x 2) + 1/—/—/—/—] Gust [DV (F)P, (F x 2) – 8)/—/—/—/—]')).toEqual([
    'Engulf [(DV (F + 2)S + Fatigue I, Attack Ratings (F x 2) + 1/—/—/—/—]',
    'Gust [DV (F)P, (F x 2) – 8)/—/—/—/—]',
  ])
  expect(splitThings('Zap Gun, Made-up Stick [Club, DV 3S, 7/—/—/—/—] **MADE-UP BACK COVER** text, more text')).toEqual([
    'Zap Gun',
    'Made-up Stick [Club, DV 3S, 7/—/—/—/—]',
  ])
})

test('npc-combat-items: a grunt’s gun and armor are its catalog entries with the stat block’s numbers; the rest is built from the line', () => {
  const x = exportNpc(
    npc('grunt', {
      weapons:
        'Zap Gun [Zapper, DV 4P, SA, 10/8/—/—/—, 8(c), w/ Zap Scope] Made-up Shredder [Heavy Pistol DV 3S(e), SA/BF, Attack Ratings 9/9/7/—/—, 12 (c)] Fists [Unarmed, DV 2S, 7/—/—/—/—]',
      gear: 'Padded Vest (+3), Made-up longcoat (DR +2), Tangle Rope [rating 2], Made-up credstick',
      augmentations: 'Glow Eyes, Made-up wired nerves 2',
      powers: 'Quick Step 2, Made-up Calm',
    }),
    data,
    c,
  )
  const gun = by(x.items, 'Zap Gun')
  expect(gun).toMatchObject({ uid: expect.stringMatching(/^line:weapons:Zap Gun \[/), id: 'crb.zap-gun', kind: 'weapons', qty: 1, worn: false })
  // the stat block's DV, attack ratings, mode and ammo over the catalog's 3P, 9/7, SS, 8
  expect(gun.values).toMatchObject({ dv: 4, stun: false, ar: [10, 8, null, null, null], modes: ['SA'], ammo: 8 })
  expect(gun.line).toEqual({ part: 'weapons', printed: expect.stringContaining('Zap Gun ['), values: expect.objectContaining({ dv: 4 }), dv: '4P' })
  expect(gun.accessories).toEqual([expect.objectContaining({ id: 'crb.zap-scope', uid: `${gun.uid}:w/Zap Scope` })])
  // no catalog entry: built from the line, its category and DV as printed (a weapon class: no skill, the class says)
  expect(by(x.items, 'Made-up Shredder')).toMatchObject({
    attrs: { category: 'Heavy Pistol', dv: '3S(e)' },
    values: { dv: 3, stun: true, ar: [9, 9, 7, null, null], modes: ['SA', 'BF'], ammo: 12 },
  })
  expect(by(x.items, 'Made-up Shredder')).not.toHaveProperty('id')
  expect(by(x.items, 'Fists')).toMatchObject({
    kind: 'weapons',
    attrs: { category: 'Unarmed' },
    values: { dv: 2, stun: true, ar: [7, null, null, null, null] },
  })
  // armor worn (its Defense counts): the catalog's with the printed +3, and a built one from its printed DR
  expect(by(x.items, 'Padded Vest')).toMatchObject({ id: 'crb.padded-vest', kind: 'armor', worn: true, values: { defense: 3 } })
  expect(by(x.items, 'Made-up longcoat')).toMatchObject({ kind: 'armor', worn: true, values: { defense: 2 } })
  // a printed rating is its level's entry; unknown gear and augmentations built as such
  expect(by(x.items, 'Tangle Rope 2')).toMatchObject({ kind: 'gear', values: { rating: 2 } })
  expect(by(x.items, 'Made-up credstick')).toMatchObject({ kind: 'gear', worn: false })
  // a rated family printed without its rating: its lowest level
  expect(by(x.items, 'Glow Eyes 1')).toMatchObject({ id: 'crb.glow-eyes.1', kind: 'augmentations', values: { rating: 1 } })
  expect(by(x.items, 'Made-up wired nerves 2')).toMatchObject({ kind: 'augmentations' })
  // a person's power: an adept power first (its level's entry), else a critter power built from its name
  expect(by(x.items, 'Quick Step 2')).toMatchObject({ uid: 'power:Quick Step 2', kind: 'adeptpowers', level: 2 })
  expect(by(x.items, 'Made-up Calm')).toMatchObject({ uid: 'power:Made-up Calm', kind: 'critterpowers' })
})

test('npc-combat-items: a critter’s natural attacks are weapons it rolls (close combat, or Exotic Weapons past close range); its powers come along', () => {
  const x = exportNpc(
    npc('critter', {
      powers: 'Glimmer, Made-up Hide (2), Made-up Senses (smell, hearing)',
      weapons: 'Bite [Close Combat, DV 4P, 9/—/—/—/—] Tail Lash [Close Combat, DV 2S (sets Made-up I status), 9/—/—/—/—]',
      attacks: 'Claws: DV 3P, Attack Ratings 8/—/—/—/—; Spit: DV 2P (made-up acid), 6/5/2/—/— As the gamemaster sees fit',
    }),
    data,
    c,
  )
  expect(x.items.filter(i => i.kind === 'weapons').map(i => [i.name, i.attrs.skill, i.values.dv, i.values.stun, i.values.ar])).toEqual([
    ['Bite', 'Close Combat', 4, false, [9, null, null, null, null]],
    ['Tail Lash', 'Close Combat', 2, true, [9, null, null, null, null]],
    ['Claws', 'Close Combat', 3, false, [8, null, null, null, null]],
    ['Spit', 'Exotic Weapons', 2, false, [6, 5, 2, null, null]],
  ])
  expect(by(x.items, 'Bite').uid).toBe('line:weapons:Bite [Close Combat, DV 4P, 9/—/—/—/—]')
  expect(by(x.items, 'Glimmer')).toMatchObject({ uid: 'power:Glimmer', id: 'crb.glimmer', kind: 'critterpowers' })
  expect(by(x.items, 'Made-up Hide (2)')).toMatchObject({ kind: 'critterpowers', values: { rating: 2 } })
  expect(by(x.items, 'Made-up Senses (smell, hearing)')).toMatchObject({ kind: 'critterpowers' })
  // the trailing words are no attack: no item
  expect(x.items.some(i => /gamemaster/.test(i.name))).toBe(false)
})

test('npc-combat-items: a spirit’s attacks are worked out at its Force', () => {
  const x = exportNpc(
    npc(
      'spirit',
      { attacks: 'Gust [DV (F)P, Attack Ratings (F x 2)/(F x 2) – 2/(F x 2) – 10/—/—] Engulf [(DV (F + 2)S + Fatigue I, Attack Ratings (F x 2) + 1/—/—/—/—]' },
      4,
    ),
    data,
    c,
  )
  // a band at 0 or less is none
  expect(by(x.items, 'Gust')).toMatchObject({ attrs: { skill: 'Exotic Weapons', dv: '(F)P' }, values: { dv: 4, stun: false, ar: [8, 6, null, null, null] } })
  expect(by(x.items, 'Engulf')).toMatchObject({ attrs: { skill: 'Close Combat' }, values: { dv: 6, stun: true, ar: [9, null, null, null, null] } })
})

test('npc-combat-items: an NPC’s runner export carries them and is valid; two of the same printed thing get their own uids', () => {
  const schema = new Ajv2020({ strict: false, validateFormats: false }).compile(JSON.parse(readFileSync('public/data/schema/sr6-export.schema.json', 'utf8')))
  const ch = blankSr6Npc('critter')
  ch.npc = npc('critter', { weapons: 'Bite [Close Combat, DV 4P, 9/—/—/—/—] Bite [Close Combat, DV 4P, 9/—/—/—/—]' })
  const f = exportSr6Runners(c, data, fixtureCreation(), [ch], SAMPLE_OPTS)
  expect(schema(f), JSON.stringify(schema.errors)).toBe(true)
  expect(f.runners![0].npc!.items.map(i => i.uid)).toEqual([
    'line:weapons:Bite [Close Combat, DV 4P, 9/—/—/—/—]',
    'line:weapons:Bite [Close Combat, DV 4P, 9/—/—/—/—]#2',
  ])
})
