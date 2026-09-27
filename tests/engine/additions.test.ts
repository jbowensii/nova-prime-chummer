// Weapons, vehicles, mental protection, technomancers, implant grades, book mods,
// lifestyles, reopening creation, and core-book citations.
import { test, expect } from 'vitest'
import { ampEssence, ampRating, applyMod } from '../../src/engine/amps'
import { appendEvent, finalize, makeEarn, reopen } from '../../src/engine/career'
import { derive, weaponDV } from '../../src/engine/derive'
import { blankCharacter } from '../../src/engine/file'
import { itemCost, price } from '../../src/engine/price'
import { validate } from '../../src/engine/validate'
import type { AmpEntry } from '../../src/model/types'
import { cat, sample } from '../helpers'

const amp = (uid: string, type: string, refs: string[], extra: Partial<AmpEntry> = {}): AmpEntry =>
  ({ uid, type, name: uid, narrative: '', effects: refs.map(ref => ({ ref })), ...extra })
const first = { isFirstQuality: true }
const codes = (ch: ReturnType<typeof blankCharacter>) => validate(cat, ch).map(v => v.code)

test('weapon damage: STR-based and fixed DVs', () => {
  expect(weaponDV('STR', 2)).toBe('2')
  expect(weaponDV('STR+2', 5)).toBe('7')
  expect(weaponDV('S+1', 5)).toBe('6')
  expect(weaponDV('5', 3, 1)).toBe('6')
  expect(weaponDV('Spe.', 3)).toBe('Spe.')
})

test('pregen weapons print the book DVs (CRB p.88, 104, 106)', () => {
  const dv = (id: string, name: string) => derive(cat, sample(id)).weapons.find(w => w.name === name)!.dv
  expect(dv('hercules', 'Unarmed')).toBe('2')
  expect(dv('hercules', 'Ares Light Fire')).toBe('4')
  expect(dv('drakk', 'Unarmed')).toBe('5')
  expect(dv('drakk', 'Sword')).toBe('7')
  expect(dv('drakk', 'Throwing knife')).toBe('6')
  expect(dv('white-rabbit', 'Unarmed')).toBe('3') // STR 2 + aluminum bone lacing DV +1
})

test('vehicle stats match the book (CRB p.96-101)', () => {
  const v = (id: string, name: string) => derive(cat, sample(id)).vehicles.find(x => x.name === name)!
  expect(v('charon', 'Eurocar Northstar 20')).toMatchObject({ pilot: 6, body: 7, handling: 1, speed: 4, armor: 1 })
  expect(v('charon', 'Cyberspace Design Quadrotor')).toMatchObject({ pilot: 6, body: 1, handling: 9, speed: 4, armor: 0, flying: true })
  expect(v('casper', 'Roto-drone')).toMatchObject({ body: 2, handling: 7, speed: 6 })
  expect(v('casper', 'Damaged MCT Gnat')).toMatchObject({ body: 0, handling: 10, speed: 1 })
  expect(v('casper', '2 Cyberspace Design Quadrotors').count).toBe(2)
  expect(v('charon', 'Eurocar Northstar 20').thresholds).toEqual([8, 15, 22]) // Body 7 + Armor 1; 2x; 3x
})

test('mental protection raises mental thresholds (Astral/Mystic Armor, CRB p.190)', () => {
  const ch = blankCharacter()
  ch.build.attributes.wil = 3
  expect(derive(cat, ch).thresholds.mental).toEqual([3, 6, 9])
  const mystic = cat.amps.get('mystic-armor')!
  expect(ampRating(cat, amp('m', 'adept', mystic.effects.map(e => e.ref)), first)).toBe(3)
  ch.build.amps = [amp('m', 'adept', ['armor-plus', 'mental-armor'])]
  const d = derive(cat, ch)
  expect(d.thresholds.mental).toEqual([4, 7, 10])
  expect(d.thresholds.physicalNone[0]).toBe(1 + 1)
})

test('technomancer: Emerged costs 35,000; persona FW = WIL, Attack = CHA (Conversion Guide p.8)', () => {
  const ch = blankCharacter()
  ch.build.attributes = { str: 2, agi: 2, wil: 4, log: 4, cha: 3 }
  ch.build.amps = [amp('e', 'emerged', [])]
  ch.build.skills = [{ id: 'tasking', rating: 3, specs: ['tasking.compiling'] }, { id: 'cracking', rating: 2, specs: [] }]
  ch.build.items = [{ uid: 'cf', catalogId: 'cf-editor', kind: 'complex-form', name: 'Editor' }]
  expect(ampRating(cat, ch.build.amps[0], first) * cat.pricing.ampPoint).toBe(35000)
  expect(itemCost(cat.pricing, ch.build.items[0])).toBe(5000)
  const d = derive(cat, ch)
  expect(d).toMatchObject({ emerged: true, firewall: 4, attack: 3 })
  expect(d.thresholds.matrix).toEqual([4, 7, 10])
  expect(d.pools.find(p => p.spec === 'tasking.compiling')!.dp).toBe(3 + 2 + 4)
  const c = codes(ch)
  expect(c).not.toContain('skill.requiresEmerged')
  expect(c).not.toContain('skill.requiresDeck')
  ch.build.amps.push(amp('a', 'awakened', ['awk-sorcery']))
  expect(codes(ch)).toContain('amp.emergedAwakened')
  ch.build.amps = []
  expect(codes(ch)).toEqual(expect.arrayContaining(['skill.requiresEmerged', 'skill.requiresDeck', 'complexForm.noEmerged']))
})

test('implant grades change Essence (DHSA p.29)', () => {
  expect(ampEssence(cat, amp('d', 'cyberware', ['grade-delta']))).toBe(0.5)
  expect(ampEssence(cat, amp('o', 'cyberware', ['grade-omega']))).toBe(1.5)
  expect(ampEssence(cat, amp('c', 'bioware', ['grade-cultivated']))).toBe(0.25)
  expect(ampRating(cat, amp('d', 'cyberware', ['grade-delta']), first)).toBe(2)
})

test('book mods add their printed rating, and their effects need no GM approval', () => {
  const deck = amp('k', 'cyberdeck', [])
  const filter = cat.amps.get('mod-biofeedback-filter')!
  expect(filter.mod).toBe(true)
  const withFilter = applyMod(deck, filter)
  expect(ampRating(cat, withFilter, first) - ampRating(cat, deck, first)).toBe(filter.printedRating)
  const removed = [...cat.amps.values()].find(t => t.mod && t.effects.some(e => e.ref === 'negative'))!
  const ch = blankCharacter()
  ch.build.amps = [applyMod(amp('v', 'vehicle', [], { vehicle: 'sedan' }), removed)]
  expect(codes(ch)).not.toContain('amp.negative')
})

test('lifestyles load with their per-run adjustments (CRB p.165)', () => {
  expect([...cat.lifestyles.values()].map(l => [l.id, l.perRun])).toEqual([['squatter', 1000], ['low', 0], ['middle', -1000], ['high', -2500]])
})

test('Finalize can be undone while the ledger is empty', () => {
  const ch = finalize(cat, sample('lightning'))
  const back = reopen(ch)
  expect(back.finalizedAt).toBeUndefined()
  expect(price(cat, back).remaining).toBe(0)
  expect(() => reopen(appendEvent(ch, makeEarn(1000, 'run', '2086-01-01')))).toThrow(/ledger/)
})

test('core-book entries cite the core-book page', () => {
  expect(cat.amps.get('ares-predator-iv-heavy-pistol')).toMatchObject({ source: 'CRB', page: 144 })
  expect(cat.amps.get('astral-armor')).toMatchObject({ source: 'CRB', page: 191 })
  expect(cat.amps.get('cat-mentor-spirit-mystery-secret')).toMatchObject({ source: 'CRB', page: 174 })
  expect(cat.items.get('spell-heal')).toMatchObject({ source: 'CRB', page: 184 })
})
