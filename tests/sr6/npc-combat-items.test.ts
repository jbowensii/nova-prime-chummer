// npc-combat-items: an NPC's or critter's stat block lines as the items its Foundry sheet fights with (owner 2026-10-20:
// weapons, attacks, armor, gear and powers must be on the actor so it can roll). The lines copy the shapes the books print
// (a bracket per weapon, attacks with no bracket and no comma between them, Force formulas, `w/` accessories, a level's
// number); names and numbers are invented (book numbers stay out of tests). The live check is npc-combat-items-live.test.ts.
import { readFileSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020'
import { expect, test } from 'vitest'
import { sr6Data } from '../../src/sr6/catalog/domain/data'
import { exportNpc, exportSr6Runners } from '../../src/sr6/foundry/domain/export'
import { matchKey, nameRatio } from '../../src/sr6/catalog/domain/names'
import { blankSr6Npc, npcCorrections, npcThings, splitThings } from '../../src/sr6/runner-builder/domain/creation/npc'
import type { Sr6Npc } from '../../src/sr6/formats/domain/character'
import { fixtureCatalog, fixtureCreation } from './catalog/fixture'
import { SAMPLE_OPTS } from './runner-builder/samples'

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
  expect(gun.line).toEqual({
    part: 'weapons',
    printed: expect.stringContaining('Zap Gun ['),
    values: expect.objectContaining({ dv: 4 }),
    dv: '4P',
    match: { score: 1, how: 'exact' },
  })
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
  // armor the catalog has nothing like: the standard armor at its printed Defense
  expect(x.items.find(i => i.line.printed === 'Made-up longcoat (DR +2)')).toMatchObject({
    id: 'crb.padded-vest',
    kind: 'armor',
    worn: true,
    values: { defense: 2 },
    line: { match: { how: 'standard' } },
  })
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
  // (a graded augmentation: the grade is in the published schema)
  ch.npc = npc('critter', { weapons: 'Bite [Close Combat, DV 4P, 9/—/—/—/—] Bite [Close Combat, DV 4P, 9/—/—/—/—]', augmentations: 'Glow Eyes 1 (deltaware)' })
  const f = exportSr6Runners(c, data, fixtureCreation(), [ch], SAMPLE_OPTS)
  expect(schema(f), JSON.stringify(schema.errors)).toBe(true)
  expect(f.runners![0].npc!.items.find(i => i.grade)).toMatchObject({ id: 'crb.glow-eyes.1', grade: 'delta' })
  expect(f.runners![0].npc!.items.map(i => i.uid)).toEqual([
    'line:weapons:Bite [Close Combat, DV 4P, 9/—/—/—/—]',
    'line:weapons:Bite [Close Combat, DV 4P, 9/—/—/—/—]#2',
    'line:augmentations:Glow Eyes 1 (deltaware)',
  ])
})

// owner 2026-10-20: "If you can find a perfect match, great. If not, 85% match will do. Remember to add regular ammo for
// weapons and standard items for equipment." Invented entries of an invented book, ZZ.
const ZZ = 'xmlns:sr6="urn:chummer-sr6:data:1"'
const zz = fixtureCatalog(undefined, [
  {
    file: 'custom/sr6/imported/zz/weapons.xml',
    xml: `<sr6:data ${ZZ} kind="weapons" version="1">
  <weapon id="zz.thunderbus" source="ZZ" page="1" category="Heavy pistol" dv="3P" modes="SA" ar="9/9/7/—/—" ammo="15(c)" avail="2" cost="500" class="WEAPON_FIREARMS/PISTOLS_HEAVY"><name>Made-up Thunderbus Pistol</name></weapon>
  <weapon id="zz.smoke" source="ZZ" page="1" category="Grenade" dv="—" ar="—/—/—/—/—" avail="2" cost="40" class="AMMUNITION/GRENADES"><name>Smoke/thermal smoke</name></weapon>
  <weapon id="zz.stun" source="ZZ" page="1" category="Grenade" dv="10S" ar="—/—/—/—/—" avail="2" cost="30" class="AMMUNITION/GRENADES"><name>Stun</name></weapon>
  <weapon id="zz.carver" source="ZZ" page="1" category="Blade" dv="3P" ar="8/—/—/—/—" avail="1" cost="50" class="WEAPON_CLOSE_COMBAT/BLADES"><name>Made-up Carver</name></weapon>
</sr6:data>`,
  },
  {
    file: 'custom/sr6/imported/zz/gear.xml',
    xml: `<sr6:data ${ZZ} kind="gear" version="1">
  <gear id="zz.ammo-heavy" source="ZZ" page="2" category="Ammo by weapon type" avail="1" per="10 rounds" cost="10" class="AMMUNITION/AMMUNITION"><name>Heavy Pistol/SMG</name></gear>
  <gear id="zz.ammo-rifle" source="ZZ" page="2" category="Ammo by weapon type" avail="1" per="10 rounds" cost="20" class="AMMUNITION/AMMUNITION"><name>Rifles</name></gear>
</sr6:data>`,
  },
  {
    file: 'custom/sr6/imported/zz/electronics.xml',
    xml: `<sr6:data ${ZZ} kind="electronics" version="1">
  <device id="zz.fancy-link" source="ZZ" page="3" category="Commlink" rating="4" avail="4" cost="2000" class="ELECTRONICS/COMMLINK"><name>Made-up Fancy Link</name></device>
  <device id="zz.basic-link" source="ZZ" page="3" category="Commlink" rating="1" avail="1" cost="100" class="ELECTRONICS/COMMLINK"><name>Made-up Basic Link</name></device>
</sr6:data>`,
  },
])
const zzData = sr6Data(zz)
const zzItems = (kind: Sr6Npc['kind'], lines: Record<string, string>) =>
  exportNpc({ ...npc(kind, lines), from: { kind: 'npcs', id: 'zz.x', name: 'X', source: 'ZZ', page: 1 } }, zzData, zz).items

test('npc-combat-items: a name at least 75% alike links, its score kept (owner: "75% guesses are fine"); below it, a power stays as printed', () => {
  const x = zzItems('grunt', {
    weapons: 'Made-up Thunderbuss Pistol [Heavy Pistol, DV 4P, SA, 10/9/7/—/—, 12(c)] Made-up Wonder Pistol [Heavy Pistol, DV 2P, SA, 8/7/—/—/—]',
  })
  // (matchKeys: made up thunderbuss pistol ~ made up thunderbu pistol)
  expect(by(x, 'Made-up Thunderbus Pistol')).toMatchObject({
    id: 'zz.thunderbus',
    values: { dv: 4, ar: [10, 9, 7, null, null] },
    line: { match: { score: 0.96, how: 'fuzzy' } },
  })
  // made up wonder pistol ~ made up thunderbu pistol: refused at 85%, a guess at 75%
  const guess = x.filter(i => i.id === 'zz.thunderbus')[1]
  expect(guess.line).toMatchObject({ printed: expect.stringContaining('Made-up Wonder Pistol'), match: { how: 'fuzzy' } })
  expect(guess.line.match!.score).toBeGreaterThanOrEqual(0.75)
  expect(guess.line.match!.score).toBeLessThan(0.85)
  // powers: glider ~ glimmer 0.769 links; glitter ~ glimmer 0.714 stays a printed power, no catalog link
  const p = exportNpc(npc('critter', { powers: 'Glider, Glitter' }), data, c).items
  expect(p.map(i => [i.name, i.id, i.line.match])).toEqual([
    ['Glimmer', 'crb.glimmer', { score: 0.769, how: 'fuzzy' }],
    ['Glitter', undefined, undefined],
  ])
})

test('npc-combat-items: a spells line: its catalog spells by name or a 75% guess, others kept as printed spells', () => {
  const x = exportNpc(npc('grunt', { spells: 'Glow Ward, Mend Glows, Made-up Hex' }), data, c).items
  expect(x.map(i => [i.line.printed, i.kind, i.id, i.line.match?.how])).toEqual([
    ['Glow Ward', 'spells', 'crb.glow-ward', 'exact'],
    ['Mend Glows', 'spells', 'crb.mend-glow', 'fuzzy'], // (a plural: alike by its match key)
    ['Made-up Hex', 'spells', undefined, undefined],
  ])
  expect(x[0].uid).toBe('line:spells:Glow Ward')
})

test('npc-combat-items: when in doubt, a grenade is its type’s (owner: "use standard ammo, grenades, etc.")', () => {
  const x = zzItems('grunt', { gear: 'smoke grenade, 2 x stun grenades, grenade' })
  expect(x.map(i => [i.line.printed, i.id, i.qty, i.line.match?.how])).toEqual([
    // smoke grenade: of the grenades, the one with "smoke"
    ['smoke grenade', 'zz.smoke', 1, 'standard'],
    ['2 x stun grenades', 'zz.stun', 2, 'fuzzy'],
    // a bare "grenade": the grenades' standard (cheapest) one
    ['grenade', 'zz.stun', 1, 'standard'],
  ])
})

test('npc-combat-items: the corrections, one line each, for the notes (worked out afresh: never stored)', () => {
  const ch = blankSr6Npc('grunt')
  ch.npc = {
    ...npc('grunt', {
      weapons:
        'Made-up Thunderbuss Pistol [Heavy Pistol, DV 4P, SA, 10/9/7/—/—, 12(c)], Made-up Stick [Club, DV 3S, 7/—/—/—/—], Made-up Zap [Cybercombat, DV 2, AR 8]',
      gear: 'smoke grenade, commlink',
    }),
    from: { kind: 'npcs', id: 'zz.x', name: 'X', source: 'ZZ', page: 1 },
  }
  const corrections = [
    'Made-up Thunderbuss Pistol → Made-up Thunderbus Pistol (fuzzy, 0.96)',
    'Added: Heavy Pistol/SMG (regular ammo) ×12 for Made-up Thunderbus Pistol',
    'Kept, not rollable: Made-up Zap [Cybercombat, DV 2, AR 8]',
    'smoke grenade → Smoke/thermal smoke (standard item)',
    'commlink → Made-up Basic Link (standard item)',
    'Not in the catalog, built from the stat block: Made-up Stick',
  ]
  expect(npcCorrections(npcThings(ch.npc, zz))).toEqual(corrections)
  const f = exportSr6Runners(zz, zzData, fixtureCreation(), [ch, ch], SAMPLE_OPTS)
  // each export works them out again: never appended twice
  expect(f.runners!.map(r => r.npc!.corrections)).toEqual([corrections, corrections])
  expect(ch.identity.notes).toBe('')
})

test('npc-combat-items: a pistol gets one full load of its regular ammo; a blade and a natural attack get none', () => {
  const x = zzItems('grunt', {
    weapons:
      'Made-up Thunderbus Pistol [Heavy Pistol, DV 3P, SA, 9/9/7/—/—, 12(c)] Made-up Thunderbus Pistol, Made-up Carver [Blade, DV 3P, 8/—/—/—/—], Bite [Close Combat, DV 2P, 6/—/—/—/—]',
  })
  // the printed clip, else the catalog's
  expect(x.filter(i => i.line.match?.how === 'ammo').map(i => [i.uid, i.id, i.qty])).toEqual([
    ['line:weapons:Made-up Thunderbus Pistol [Heavy Pistol, DV 3P, SA, 9/9/7/—/—, 12(c)]:ammo', 'zz.ammo-heavy', 12],
    ['line:weapons:Made-up Thunderbus Pistol:ammo', 'zz.ammo-heavy', 15],
  ])
  expect(x.filter(i => i.kind === 'weapons').map(i => i.name)).toEqual(['Made-up Thunderbus Pistol', 'Made-up Thunderbus Pistol', 'Made-up Carver', 'Bite'])
})

test('npc-combat-items: a generic “commlink” is the category’s standard item (lowest rating, then cheapest), noted as such', () => {
  const x = zzItems('grunt', { gear: 'commlink, Made-up Fancy Link' })
  expect(x.map(i => [i.name, i.id, i.line.match])).toEqual([
    ['Made-up Basic Link', 'zz.basic-link', { score: 1, how: 'standard' }],
    ['Made-up Fancy Link', 'zz.fancy-link', { score: 1, how: 'exact' }],
  ])
})

test('npc-combat-items: a bare Force formula DV (`DV F/2P`) reads at the Force; without one it stays text', () => {
  const lines = { attacks: 'Made-up Swipe [DV F/2P, (F x 2)/—/—/—/—] Made-up Lash [DV F + 1S, 8/—/—/—/—]' }
  const spirit = exportNpc(npc('spirit', lines, 4), data, c).items
  expect(by(spirit, 'Made-up Swipe')).toMatchObject({ kind: 'weapons', attrs: { dv: 'F/2P' }, values: { dv: 2, stun: false, ar: [8, null, null, null, null] } })
  expect(by(spirit, 'Made-up Lash').values).toMatchObject({ dv: 5, stun: true })
  // a critter has no Force: the DV stays text (a weapon still, the GM sets its damage)
  const critter = exportNpc(npc('critter', lines), data, c).items
  expect(by(critter, 'Made-up Swipe')).toMatchObject({ kind: 'weapons', attrs: { dv: 'F/2P' } })
  expect(by(critter, 'Made-up Swipe').values).not.toHaveProperty('dv')
})

test('npc-combat-items: an attack it can’t roll is kept as a note item with its line (never dropped); a bare name stays in the notes', () => {
  const x = exportNpc(npc('critter', { attacks: 'Made-up Zap [Cybercombat, DV 2, AR 8] Made-up Gas [DV GZ 6S, DV Close 4S] Made-up Wave' }), data, c).items
  expect(x.map(i => [i.name, i.kind, i.line.unread])).toEqual([
    ['Made-up Zap', 'gear', true],
    ['Made-up Gas', 'gear', true],
  ])
  expect(by(x, 'Made-up Zap').line.printed).toBe('Made-up Zap [Cybercombat, DV 2, AR 8]')
})

test('npc-combat-items: nameRatio is the importer’s difflib ratio', () => {
  // python: difflib.SequenceMatcher(None, a, b).ratio()
  expect(nameRatio('ares predator vi', 'ares predatr vi')).toBeCloseTo(0.9677, 4)
  expect(nameRatio('colt manhunter', 'colt man hunter')).toBeCloseTo(0.9655, 4)
  expect(nameRatio('bite', 'kite')).toBe(0.75)
  expect(nameRatio('synthleather jacket', 'synth leather jacket')).toBeCloseTo(0.9744, 4)
  expect(matchKey('Throwing Knives (5)')).toBe('throwing knive')
  expect(matchKey('Fists')).toBe(matchKey('fist'))
  expect(matchKey('Erika Elite commlink [Rating 4]')).toBe('erika elite commlink')
})
