// Weapons, mental protection, technomancers, implant grades, mods, lifestyles, and citations.
// Book-specific numbers (pregen weapons/vehicles, Finalize on a real pregen) live in tests/ca2/runner-builder/books/additions.test.ts.
import { test, expect } from 'vitest'
import { ampEssence, ampRating, applyMod } from '../../../../src/ca2/runner-builder/domain/amps'
import { derive, weaponDV } from '../../../../src/ca2/runner-builder/domain/derive'
import { blankCharacter } from '../../../../src/ca2/formats/domain/file'
import { itemCost } from '../../../../src/ca2/runner-builder/domain/price'
import { validate } from '../../../../src/ca2/runner-builder/domain/validate'
import type { AmpEntry } from '../../../../src/ca2/formats/domain/types'
import { cat } from '../../../helpers'

const amp = (uid: string, type: string, refs: string[], extra: Partial<AmpEntry> = {}): AmpEntry => ({
  uid,
  type,
  name: uid,
  narrative: '',
  effects: refs.map(ref => ({ ref })),
  ...extra,
})
const first = { isFirstQuality: true }
const codes = (ch: ReturnType<typeof blankCharacter>) => validate(cat, ch).map(v => v.code)

test('weapon damage: STR-based and fixed DVs', () => {
  expect(weaponDV('STR', 2)).toBe('2')
  expect(weaponDV('STR+2', 5)).toBe('7')
  expect(weaponDV('S+1', 5)).toBe('6')
  expect(weaponDV('5', 3, 1)).toBe('6')
  expect(weaponDV('Spe.', 3)).toBe('Spe.')
})

test('mental protection raises mental thresholds', () => {
  const ch = blankCharacter()
  ch.build.attributes.wil = 3
  expect(derive(cat, ch).thresholds.mental).toEqual([3, 6, 9])
  expect(ampRating(cat, amp('m', 'adept', ['armor-plus', 'mental-armor']), first)).toBe(2 + 2 + 3) // made-up base and ratings
  ch.build.amps = [amp('m', 'adept', ['armor-plus', 'mental-armor'])]
  const d = derive(cat, ch)
  expect(d.thresholds.mental).toEqual([4, 7, 10])
  expect(d.thresholds.physicalNone[0]).toBe(1 + 1)
})

test('technomancer (a book adds Tasking and Emerged; made-up base 6): Emerged costs 36,000, a complex form the book’s price; persona FW = WIL, Attack = CHA', () => {
  const ch = blankCharacter()
  ch.build.attributes = { str: 2, agi: 2, wil: 4, log: 4, cha: 3 }
  ch.build.amps = [amp('e', 'emerged', [])]
  ch.build.skills = [
    { id: 'tasking', rating: 3, specs: ['tasking.compiling'] },
    { id: 'cracking', rating: 2, specs: [] },
  ]
  ch.build.items = [{ uid: 'cf', kind: 'complex-form', name: 'Editor' }]
  expect(ampRating(cat, ch.build.amps[0], first) * cat.pricing.ampPoint).toBe(36000)
  expect(itemCost(cat.pricing, ch.build.items[0])).toBe(7250) // the book’s <prices> over the core's 6,500
  const d = derive(cat, ch)
  // hot-sim VR as if with a DNI (CG p.8): no DNI needed for Cracking
  expect(d).toMatchObject({ emerged: true, firewall: 4, attack: 3, vr: 'hot' })
  expect(d.thresholds.matrix).toEqual([4, 7, 10])
  expect(d.pools.find(p => p.spec === 'tasking.compiling')!.dp).toBe(3 + 2 + 3) // the made-up spec uses CHA
  const c = codes(ch)
  expect(c).not.toContain('skill.requiresEmerged')
  expect(c).not.toContain('skill.requiresDeck')
  expect(c).not.toContain('skill.requiresDni')
  ch.build.amps.push(amp('a', 'awakened', ['awk-sorcery']))
  expect(codes(ch)).toContain('amp.emergedAwakened')
  ch.build.amps = []
  expect(codes(ch)).toEqual(expect.arrayContaining(['skill.requiresEmerged', 'skill.requiresDeck', 'complexForm.noEmerged']))
})

test('implant grades a book adds change Essence', () => {
  expect(ampEssence(cat, amp('d', 'cyberware', ['grade-delta']))).toBe(1)
  expect(ampEssence(cat, amp('o', 'cyberware', ['grade-omega']))).toBe(2)
  expect(ampEssence(cat, amp('c', 'bioware', ['grade-cultivated']))).toBe(0.125)
  expect(ampRating(cat, amp('d', 'cyberware', ['grade-delta']), first)).toBe(2 + 2)
})

test('mods add their printed rating, and their effects need no GM approval', () => {
  const deck = amp('k', 'cyberdeck', [])
  const filter = cat.amps.get('test.static-shroud')!
  expect(filter.mod).toBe(true)
  const withFilter = applyMod(deck, filter)
  expect(ampRating(cat, withFilter, first) - ampRating(cat, deck, first)).toBe(filter.printedRating)
  const removed = [...cat.amps.values()].find(t => t.mod && t.effects.some(e => e.ref === 'negative'))!
  const ch = blankCharacter()
  ch.build.amps = [applyMod(amp('v', 'vehicle', [], { vehicle: 'sedan' }), removed)]
  expect(codes(ch)).not.toContain('amp.negative')
})

test('lifestyles load with their per-run adjustments', () => {
  expect([...cat.lifestyles.values()].map(l => [l.id, l.perRun])).toEqual([
    ['squatter', 1500],
    ['low', 0],
    ['middle', -1500],
    ['high', -3000],
  ])
})

test('catalog entries cite their source and page', () => {
  expect(cat.amps.get('test.rush')).toMatchObject({ source: 'TEST', page: 8 })
  expect(cat.amps.get('testc.rush')).toMatchObject({ source: 'TESTC', page: 8 })
})
