// The importer writes sample runners as character XML (importer/statblock.py character_xml). This is its
// output for the made-up "Test Face" stat block (importer/tests/test_statblock.py keeps it in sync):
// the app's reader must take it, and the engine must give the numbers the recipe marked "ok".
import { readFileSync } from 'node:fs'
import { test, expect } from 'vitest'
import { ampCtx, ampRating } from '../../src/engine/amps'
import { xmlToCharacter } from '../../src/engine/charxml'
import { derive } from '../../src/engine/derive'
import { cat } from '../helpers'

const r = xmlToCharacter(readFileSync('tests/fixtures/mini/custom/imported/pregens/samples/pregens.test-face.xml', 'utf8'))

test('the importer’s sample XML reads as a character', () => {
  expect(r.ok).toBe(true)
  if (!r.ok) return
  const ch = r.character
  expect([ch.id, ch.origin, ch.identity.streetName, ch.identity.metatype]).toEqual(['pregens.test-face', 'PREGENS', 'Test Face', 'elf'])
  expect(ch.build.attributes).toEqual({ str: 2, agi: 3, wil: 3, log: 3, cha: 4 })
  expect(ch.build.skills.find(s => s.id === 'electronics')?.specs).toEqual(['custom:Mystery trick'])
  expect(ch.build.amps.find(a => a.name === 'Big Grin')?.effects).toEqual([{ ref: 'rr-skill', param: 'influence' }, { ref: 'negative', value: 1, note: 'book drawback' }])
  expect(ch.narrative.dispositions).toEqual(['Smiles a lot, and then some more.', 'Never early.'])
})

test('the engine gives the numbers the recipe computed', () => {
  if (!r.ok) throw new Error(r.reason)
  const ch = r.character
  const d = derive(cat, ch)
  const dp = (skill: string, spec: string | null, attr: string) => d.pools.find(p => p.skill === skill && (p.spec ?? null) === spec && p.attr === attr)?.dp
  expect([dp('athletics', 'athletics.ranged-defense', 'agi'), dp('influence', 'influence.bluff', 'cha'), dp('electronics', 'custom:Mystery trick', 'log')]).toEqual([8, 11, 6])
  expect([d.thresholds.physicalNone[0], d.thresholds.physicalMain[0], d.thresholds.physicalAlt[0], d.thresholds.mental[0], d.essence]).toEqual([2, 4, 5, 3, 5.5])
  // printed 4, 5, 2, 3, 0: the contact's RR costs 2 in the rules (the recipe reports it)
  expect(ch.build.amps.map(a => ampRating(cat, a, ampCtx(ch.build, a)))).toEqual([4, 5, 2, 3, 2])
})
