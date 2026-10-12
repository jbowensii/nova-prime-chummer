// Prices going the other way and the reasons an effect cannot go on an amp (src/engine/price.ts, src/engine/amps.ts):
// lowering refunds what raising cost, a package that does not exist has no guide, and each reason an effect is blocked.
import { expect, test } from 'vitest'
import { effectBlocked, effectNeeds, overCap } from '../../src/engine/amps'
import { attrCost, packageGuide, skillCost } from '../../src/engine/price'
import type { AmpEntry } from '../../src/model/types'
import { cat } from '../helpers'

const P = cat.pricing
const amp = (type: string, effects: AmpEntry['effects'], more: Partial<AmpEntry> = {}): AmpEntry => ({ uid: 'a', type, name: 'Odd', narrative: '', effects, ...more })
const eff = (id: string) => cat.ampEffects.get(id)!

test('lowering an attribute or skill refunds exactly what raising it cost', () => {
  expect(attrCost(P, 3, 2, 5)).toBe(-attrCost(P, 2, 3, 5))
  expect(attrCost(P, 5, 2, 5)).toBe(-attrCost(P, 2, 5, 5))
  expect(attrCost(P, 2, 2, 5)).toBe(0)
  expect(skillCost(P, 4, 1)).toBe(-skillCost(P, 1, 4))
  expect(skillCost(P, 9, 0)).toBe(-skillCost(P, 0, 9))
})

test('the point that reaches the maximum costs the last-point price', () => {
  expect(attrCost(P, 4, 5, 5)).toBe(P.attrLastPoint)
  expect(attrCost(P, 3, 4, 5)).toBe(P.attrPoint)
})

test('a package guide for an id that is not there is nothing', () => {
  expect(packageGuide(cat, 'no-such-package')).toBeUndefined()
  const g = packageGuide(cat, 'ganger-balanced')!
  expect(g.attributes).toBe(10 * P.attrPoint + 1 * (P.attrLastPoint - P.attrPoint))
})

test('why an effect cannot go on an amp: its type, its maximum, one per level, the deck’s Firewall, a vehicle’s Body, an effect it excludes', () => {
  expect(effectBlocked(cat, amp('contact', []), eff('armor-plus'))).toBe('not available for Contact'.replace('Contact', cat.ampTypes.get('contact')?.name ?? 'contact'))
  expect(effectBlocked(cat, amp('mystery', []), eff('armor-plus'))).toBe('not available for mystery')
  expect(effectBlocked(cat, amp('cyberware', [{ ref: 'armor-plus' }, { ref: 'armor-plus' }]), eff('armor-plus'))).toBe('max 2 per amp')
  expect(effectBlocked(cat, amp('cyberware', [{ ref: 'init-1' }]), eff('init-realm'))).toBeUndefined()
  expect(effectBlocked(cat, amp('cyberware', [{ ref: 'init-1' }, { ref: 'init-realm' }]), eff('init-realm'))).toBe('one per initiative level held')
  const loose = { ...cat, ampEffects: new Map(cat.ampEffects).set('firewall-plus', { ...eff('firewall-plus'), max: undefined }) }
  const wall = (n: number) => amp('cyberdeck', Array.from({ length: n }, () => ({ ref: 'firewall-plus' })))
  expect(effectBlocked(loose, wall(4), loose.ampEffects.get('firewall-plus')!)).toBe('Firewall 5 at most')
  expect(effectBlocked(loose, wall(3), loose.ampEffects.get('firewall-plus')!)).toBeUndefined()
  expect(effectBlocked(cat, wall(4), eff('firewall-plus'))).toBe('max 4 per amp')
  const sky = amp('vehicle', [{ ref: 'vehicle-armor' }], { chassis: { id: 'x', name: 'X', pilot: 1, body: 1, handling: 1, speed: 1, armor: 0, mount: 'none', source: 'TEST', page: 1 } })
  expect(effectBlocked(cat, sky, eff('vehicle-armor'))).toBe('Armor at most the vehicle\'s Body (1)')
  const xml = { ...cat, ampEffects: new Map(cat.ampEffects).set('odd-x', { ...eff('armor-plus'), id: 'odd-x', excludes: 'armor-plus', max: undefined }) }
  expect(effectBlocked(xml, amp('cyberware', [{ ref: 'armor-plus' }]), xml.ampEffects.get('odd-x')!)).toBe(`not with ${eff('armor-plus').name}`)
  expect(effectBlocked(xml, amp('cyberware', [{ ref: 'armor-plus' }]), { ...xml.ampEffects.get('odd-x')!, excludes: 'gone-effect' })).toBeUndefined()
})

test('an effect that needs another says so, with its name or its id; one it has is no need', () => {
  expect(effectNeeds(cat, amp('cyberware', []), eff('init-2'))).toBe(`requires ${eff('init-1').name}`)
  expect(effectNeeds(cat, amp('cyberware', [{ ref: 'init-1' }]), eff('init-2'))).toBeUndefined()
  expect(effectNeeds(cat, amp('cyberware', []), { ...eff('init-2'), requires: 'unlisted' })).toBe('requires unlisted')
  expect(effectNeeds(cat, amp('cyberware', []), eff('armor-plus'))).toBeUndefined()
})

test('an amp over its caps names the first one broken: an effect’s maximum, Firewall, a vehicle’s Armor above Body', () => {
  expect(overCap(cat, amp('cyberware', [{ ref: 'armor-plus' }, { ref: 'armor-plus' }, { ref: 'armor-plus' }]))).toBe(`${eff('armor-plus').name}: max 2 per amp`)
  const wall = (n: number) => amp('cyberdeck', Array.from({ length: n }, () => ({ ref: 'firewall-plus' })))
  expect(overCap(cat, wall(5))).toBe(`${eff('firewall-plus').name}: max 4 per amp`)
  const loose = { ...cat, ampEffects: new Map(cat.ampEffects).set('firewall-plus', { ...eff('firewall-plus'), max: undefined }) }
  expect(overCap(loose, wall(5))).toBe('Firewall 5 at most')
  expect(overCap(loose, wall(4))).toBeUndefined()
  expect(overCap(cat, amp('cyberware', []))).toBeUndefined()
})
