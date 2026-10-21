// The importer writes sample runners as character XML (importer/statblock.py character_xml). This is its
// output for the made-up "Test Face" stat block (importer/tests/test_statblock.py keeps it in sync):
// the app's reader must take it, and the engine must give the numbers the recipe marked "ok".
import { readFileSync } from 'node:fs'
import { test, expect } from 'vitest'
import { ampCtx, ampRating } from '../../../src/ca2/runner-builder/domain/amps'
import { characterToXml, xmlToCharacter } from '../../../src/ca2/formats/domain/charxml'
import { derive } from '../../../src/ca2/runner-builder/domain/derive'
import { validate } from '../../../src/ca2/runner-builder/domain/validate'
import type { Character } from '../../../src/ca2/formats/domain/types'
import { cat } from '../../helpers'

const golden = readFileSync('tests/fixtures/mini/custom/imported/pregens/samples/pregens.test-face.xml', 'utf8')
const r = xmlToCharacter(golden)

test('the importer’s sample XML reads as a character', () => {
  expect(r.ok).toBe(true)
  if (!r.ok) return
  const ch = r.character
  expect([ch.id, ch.origin, ch.identity.streetName, ch.identity.metatype]).toEqual(['pregens.test-face', 'PREGENS', 'Test Face', 'elf'])
  expect(ch.build.attributes).toEqual({ str: 2, agi: 3, wil: 3, log: 3, cha: 4 })
  expect(ch.build.skills.find(s => s.id === 'electronics')?.specs).toEqual(['custom:Mystery trick'])
  // its printed limitation is the Negative effect the printed rating took off (CRB p.61): the book's own, as printed, so no
  // GM approval (owner, 2026-10-11); no override;
  // the free starting gear is the app's (it takes the printed Fake SIN and Commlink)
  expect(ch.build.amps.find(a => a.name === 'Big Grin')?.effects).toEqual([
    { ref: 'rr-skill', param: 'influence' },
    { ref: 'negative', value: 1, note: 'RR 1 on Influence tests (first meeting only).' },
  ])
  expect(validate(cat, ch).filter(v => v.code === 'amp.negative')).toEqual([])
  expect(ch.build.items.find(i => i.name === 'Padded coat and hat')).toMatchObject({ armor: 1, over: 'it-1' })
  expect(ch.overrides).toEqual([])
  expect(ch.build.amps.map(a => a.snapshot?.printedRating)).toEqual([4, 9, 4, 6, 0])
  expect(ch.narrative.dispositions).toEqual(['Smiles a lot, and then some more.', 'Never early.'])
  // the app's writer gives the same bytes, but for the app's own marking of the printed Fake SIN and Commlink as the free
  // starting gear when it reads the runner: both writers stay pinned to this file
  expect(characterToXml(ch)).toBe(
    golden.replace('name="Fake SIN"/>', 'name="Fake SIN" starting="fake-sin"/>').replace('name="Commlink"/>', 'name="Commlink" starting="commlink"/>'),
  )
})

test('the engine gives the numbers the recipe computed', () => {
  if (!r.ok) throw new Error(r.reason)
  const ch = r.character
  const d = derive(cat, ch)
  const dp = (skill: string, spec: string | null, attr: string) => d.pools.find(p => p.skill === skill && (p.spec ?? null) === spec && p.attr === attr)?.dp
  expect([
    dp('athletics', 'athletics.ranged-defense', 'wil'),
    dp('influence', 'influence.bluff', 'log'),
    dp('electronics', 'custom:Mystery trick', 'wil'),
  ]).toEqual([8, 10, 6])
  expect([d.thresholds.physicalNone[0], d.thresholds.physicalMain[0], d.thresholds.physicalAlt[0], d.thresholds.mental[0], d.essence]).toEqual([2, 4, 5, 3, 5])
  // printed 4, 9, 4, 6, 0: as printed, the rules rate some otherwise (the recipe reports them, Review notes them)
  const got = ch.build.amps.map(a => ampRating(cat, a, ampCtx(ch.build, a)))
  expect(
    validate(cat, ch)
      .filter(v => v.code === 'amp.printedRating')
      .map(v => v.path),
  ).toEqual(ch.build.amps.filter((a, i) => a.snapshot?.printedRating !== got[i]).map(a => `amps.${a.uid}`))
})

// An NPC (a critter: no metatype, an npc block): the importer's writer (importer/tests/test_statblock.py) and the app's
// give the same bytes for tests/fixtures/npc-critter.json, and the app reads them back to it.
test('both writers give the same bytes for an NPC', () => {
  const npc = JSON.parse(readFileSync('tests/fixtures/npc-critter.json', 'utf8')) as Character
  const xml = readFileSync('tests/fixtures/npc-critter.xml', 'utf8')
  expect(characterToXml(npc)).toBe(xml)
  const back = xmlToCharacter(xml)
  expect(back.ok && [back.character.npc, back.character.identity.metatype]).toEqual([npc.npc, ''])
})

// a portrait and a separate token: the same bytes as importer/tests/test_statblock.py writes, read back as they were
test('both writers give the same bytes for a portrait and a token', () => {
  const npc = JSON.parse(readFileSync('tests/fixtures/npc-critter.json', 'utf8')) as Character
  npc.identity = { ...npc.identity, portrait: 'data:image/jpeg;base64,/9j/P', token: 'data:image/png;base64,iVBO' }
  const xml = characterToXml(npc)
  expect(xml).toContain('\n  <portrait>data:image/jpeg;base64,/9j/P</portrait><token>data:image/png;base64,iVBO</token>\n  <background>')
  const back = xmlToCharacter(xml)
  expect(back.ok && [back.character.identity.portrait, back.character.identity.token]).toEqual([npc.identity.portrait, npc.identity.token])
})
