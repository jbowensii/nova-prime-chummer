// 0.5.5 rules fixes and owner decisions (.extract/report/rules-validation.md): made-up catalog and runners only.
import { test, expect } from 'vitest'
import { ampRating, effectBlocked, isSinner } from '../../src/engine/amps'
import { derive, vehicleStats } from '../../src/engine/derive'
import { blankCharacter } from '../../src/engine/file'
import { price } from '../../src/engine/price'
import { validate } from '../../src/engine/validate'
import type { AmpEntry, Character } from '../../src/model/types'
import { cat } from '../helpers'

const amp = (uid: string, type: string, refs: (string | [string, string])[], extra: Partial<AmpEntry> = {}): AmpEntry =>
  ({ uid, type, name: `Made-up ${uid}`, narrative: '', effects: refs.map(r => (Array.isArray(r) ? { ref: r[0], param: r[1] } : { ref: r })), ...extra })
const runner = (...amps: AmpEntry[]): Character => {
  const ch = blankCharacter()
  ch.build.attributes = { str: 2, agi: 2, wil: 2, log: 2, cha: 2 }
  ch.build.amps = amps
  return ch
}
const codes = (ch: Character) => validate(cat, ch).map(v => v.code)

test('extra wound boxes on a cyberdeck or a vehicle are the device’s, not the runner’s (p.62)', () => {
  const d = derive(cat, runner(amp('deck', 'cyberdeck', ['wound-serious']), amp('car', 'vehicle', ['wound-light'], { vehicle: 'sedan' })))
  expect(d.monitor).toEqual({ light: 2, serious: 1, incap: 1 })
  expect(d.deckMonitor).toEqual({ light: 2, serious: 2 })
  expect(d.vehicles[0].monitor).toEqual({ light: 3, serious: 1 })
  expect(derive(cat, runner(amp('ware', 'bioware', ['wound-serious']))).monitor.serious).toBe(2)
})

test('"one realm" reductions: one per initiative level held (p.61)', () => {
  const one = amp('w', 'cyberware', ['init-1', ['init-realm', 'physical']])
  expect(effectBlocked(cat, one, cat.ampEffects.get('init-realm')!)).toMatch(/initiative level/)
  const two = amp('w', 'cyberware', ['init-1', ['init-realm', 'physical'], ['init-realm', 'physical']])
  expect(codes(runner(two))).toContain('amp.initRealm')
  expect(codes(runner(one))).not.toContain('amp.initRealm')
})

test('an amp never rates below 0 without the GM: no creation credit (p.61)', () => {
  const low = amp('q', 'quality', [])
  low.effects = [{ ref: 'negative', value: 4 }]
  const ch = runner(low)
  expect(ampRating(cat, low, { isFirstQuality: true })).toBe(0) // made-up quality base 1, drawback -4
  expect(price(cat, ch).amps).toBe(0)
  expect(codes(ch)).toContain('amp.negativeRating')
  ch.overrides = [{ code: 'amp.negativeRating', path: 'amps.q', note: 'GM: fine' }]
  expect(price(cat, ch).amps).toBe(-3 * cat.pricing.ampPoint)
  expect(validate(cat, ch).find(v => v.code === 'amp.negativeRating')?.approved).toBe(true)
})

test('a cyberdeck’s Firewall is 5 at most (p.210-211)', () => {
  const deck = amp('deck', 'cyberdeck', ['firewall-plus', 'firewall-plus', 'firewall-plus', 'firewall-plus', 'firewall-plus'])
  expect(derive(cat, runner(deck)).firewall).toBe(5)
  expect(codes(runner(deck))).toContain('amp.firewallMax')
  expect(effectBlocked(cat, { ...deck, effects: deck.effects.slice(0, 4) }, cat.ampEffects.get('firewall-plus')!)).toBeTruthy() // Firewall 5 reached
  expect(effectBlocked(cat, { ...deck, effects: deck.effects.slice(0, 3) }, cat.ampEffects.get('firewall-plus')!)).toBeUndefined()
})

test('Armor +1 and damage +1 stack across amps only up to the effect’s max (p.61)', () => {
  // made-up maxima: armor-plus 2, dv-plus 3
  const ch = runner(amp('a', 'quality', ['armor-plus', 'armor-plus']), amp('b', 'cyberware', ['armor-plus', 'dv-plus', 'dv-plus']), amp('c', 'adept', ['dv-plus', 'dv-plus']))
  ch.build.items.push({ uid: 'vest', kind: 'armor', name: 'Made-up vest', armor: 3 })
  ch.build.mainArmor = 'vest'
  const d = derive(cat, ch)
  expect(d.armor).toMatchObject({ none: 2, main: 5 })
  expect(d.weapons[0].dv).toBe('5') // STR 2 + 3
  expect(validate(cat, ch).filter(v => v.code === 'amp.stackMax').map(v => v.severity)).toEqual(['warning', 'warning'])
})

test('flying doubles the base Speed only; Speed upgrades add after', () => {
  const s = (refs: string[]) => vehicleStats(cat, amp('v', 'vehicle', refs, { vehicle: 'medium-drone' }))!.speed
  // made-up medium drone: speed 4, flying speed 7
  expect([s([]), s(['speed-plus']), s(['flying']), s(['flying', 'speed-plus'])]).toEqual([4, 5, 7, 8])
  expect(vehicleStats(cat, amp('v', 'vehicle', ['flying', 'speed-plus'], { vehicle: 'sedan' }))!.speed).toBe(7) // no flying speed: 3 x 2 + 1
})

test('RR cap at creation: the total on one Test (Attribute + Skill + specialization), with a clear message', () => {
  // made-up Pro: RR 3 on an Attribute, 2 on a Skill Test, 3 on a specialization Test
  const ch = runner(amp('q', 'quality', [['rr-attr', 'agi']]), amp('w', 'cyberware', [['rr-skill', 'stealth'], ['rr-skill', 'stealth'], ['rr-spec', 'stealth.palming']]))
  ch.build.skills = [{ id: 'stealth', rating: 3, specs: ['stealth.palming'] }]
  const rr = validate(cat, ch).filter(v => v.code === 'rr.cap')
  expect(rr.map(v => v.severity)).toEqual(['error', 'error'])
  expect(rr[0].message).toMatch(/^RR 3 on Stealth \+ AGI Tests \(Stealth 2 \+ AGI 1\); Pro allows 2 on one Test/)
  expect(rr[1].message).toMatch(/^RR 4 on Stealth \(.+\) \+ AGI Tests \(Stealth 2 \+ .+ 1 \+ AGI 1\); Pro allows 3/)
  expect(rr.every(v => /stacking included/.test(v.message) && v.page === 85)).toBe(true)
  ch.finalizedAt = '2086-01-01T00:00:00Z'
  ch.carry = 0
  expect(validate(cat, ch).filter(v => v.code === 'rr.cap' && v.severity === 'error')).toEqual([])
})

test('SINner house rule: always 0¥, never the first Quality, checkbox or by hand', () => {
  const lucky = amp('lucky', 'quality', [])
  const byHand = { ...amp('sin', 'quality', ['armor-plus']), name: 'SINner' }
  expect(isSinner(byHand)).toBe(true)
  const withSin = runner(byHand, lucky)
  const without = runner(lucky)
  expect(price(cat, withSin).amps).toBe(price(cat, without).amps) // Lucky keeps the first-Quality price
  expect(ampRating(cat, byHand, { isFirstQuality: true })).toBe(0)
})
