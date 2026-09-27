import { test, expect } from 'vitest'
import {
  appendEvent, balance, currentBuild, finalize, makeAdvance, makeAmpAdd, makeAmpModify, makeBuy, makeEarn, makeSell, voidEvent,
} from '../../src/engine/career'
import type { AmpEntry } from '../../src/model/types'
import { cat, sample } from '../helpers'

const start = () => finalize(cat, sample('lightning'))

test('finalized Lightning starts at balance 0; earnings add', () => {
  let ch = start()
  expect(balance(cat, ch)).toBe(0)
  ch = appendEvent(ch, makeEarn(50000, 'Renraku extraction', '2086-03-01'))
  expect(balance(cat, ch)).toBe(50000)
})

test('advancing Stealth 5 -> 6 costs 5,000; voiding it restores both balance and rating', () => {
  let ch = appendEvent(start(), makeEarn(50000, 'run', '2086-03-01'))
  const adv = makeAdvance(cat, ch, 'skills.stealth', 6)
  expect(adv).toMatchObject({ type: 'advance', from: 5, to: 6, cost: 5000 })
  ch = appendEvent(ch, adv)
  expect(balance(cat, ch)).toBe(45000)
  expect(currentBuild(ch).skills.find(s => s.id === 'stealth')!.rating).toBe(6)
  ch = voidEvent(ch, adv.id, 'misclick')
  expect(balance(cat, ch)).toBe(50000)
  expect(currentBuild(ch).skills.find(s => s.id === 'stealth')!.rating).toBe(5)
  expect(() => voidEvent(ch, adv.id, 'again')).toThrow(/already voided/)
})

test('attribute advance uses the last-point surcharge (elf CHA 4 -> 5 = 20,000)', () => {
  expect(makeAdvance(cat, start(), 'attributes.cha', 5)).toMatchObject({ cost: 20000 })
})

test('amp upgrade costs the rating difference (smartlink spec -> skill = 15,000)', () => {
  let ch = appendEvent(start(), makeEarn(100000, 'run', '2086-03-01'))
  const smart: AmpEntry = { uid: 'smart', type: 'cyberware', name: 'Smartlink', narrative: '', effects: [{ ref: 'rr-spec', param: 'ranged-weapons.pistols' }] }
  const add = makeAmpAdd(cat, ch, smart)
  expect(add).toMatchObject({ cost: 15000 })
  ch = appendEvent(ch, add)
  const mod = makeAmpModify(cat, ch, { ...smart, effects: [{ ref: 'rr-skill', param: 'ranged-weapons' }] })
  expect(mod).toMatchObject({ cost: 15000 })
  ch = appendEvent(ch, mod)
  expect(balance(cat, ch)).toBe(70000)
  expect(currentBuild(ch).amps.find(a => a.uid === 'smart')!.effects[0].ref).toBe('rr-skill')
})

test('buying costs its price; selling removes the item at no cost', () => {
  let ch = appendEvent(start(), makeEarn(10000, 'run', '2086-03-01'))
  const buy = makeBuy(cat, { uid: 'sg', kind: 'weapon', name: 'Sniper rifle', specialist: true })
  expect(buy).toMatchObject({ cost: 5000 })
  ch = appendEvent(ch, buy)
  ch = appendEvent(ch, makeSell('it-knife'))
  expect(balance(cat, ch)).toBe(5000)
  const items = currentBuild(ch).items.map(i => i.uid)
  expect(items).toContain('sg')
  expect(items).not.toContain('it-knife')
})
