// Runners finalized before 0.5.5 (ledger events on a baseline), against Lightning, a book pregen finalized exactly on
// budget: settled the 0.5.5 way, their balance and build stay what the old ledger said.
import { test, expect } from 'vitest'
import {
  appendEvent, balance, currentBuild, finalize, makeAdvance, makeAmpAdd, makeAmpModify, makeBuy, makeEarn, makeSell, voidEvent,
} from '../../src/engine/career'
import type { AmpEntry } from '../../src/model/types'
import { books, legacy, sample } from '../helpers'
import { describeBooks } from './_gate'

const start = () => legacy(finalize(books!, sample('lightning')))

describeBooks('pre-0.5.5 career (book samples)', () => {
  test('finalized Lightning starts at balance 0; earnings add', () => {
    let ch = start()
    expect(balance(books!, ch)).toBe(0)
    ch = appendEvent(ch, makeEarn(50000, 'Renraku extraction', '2086-03-01'))
    expect(balance(books!, ch)).toBe(50000)
  })

  test('advancing Stealth 5 -> 6 costs a high skill point; voiding it restores both balance and rating', () => {
    let ch = appendEvent(start(), makeEarn(50000, 'run', '2086-03-01'))
    const adv = makeAdvance(books!, ch, 'skills.stealth', 6)
    expect(adv).toMatchObject({ type: 'advance', from: 5, to: 6, cost: books!.pricing.skillHigh })
    ch = appendEvent(ch, adv)
    expect(balance(books!, ch)).toBe(50000 - books!.pricing.skillHigh)
    expect(currentBuild(ch).skills.find(s => s.id === 'stealth')!.rating).toBe(6)
    ch = voidEvent(ch, adv.id, 'misclick')
    expect(balance(books!, ch)).toBe(50000)
    expect(currentBuild(ch).skills.find(s => s.id === 'stealth')!.rating).toBe(5)
    expect(() => voidEvent(ch, adv.id, 'again')).toThrow(/already voided/)
  })

  test('attribute advance uses the last-point surcharge (elf CHA 4 -> 5)', () => {
    expect(makeAdvance(books!, start(), 'attributes.cha', 5)).toMatchObject({ cost: books!.pricing.attrLastPoint })
  })

  test('amp upgrade costs the rating difference (smartlink spec -> skill)', () => {
    const P = books!.pricing, rate = (ref: string) => books!.ampEffects.get(ref)!.rating
    const base = books!.ampTypes.get('cyberware')!.base
    let ch = appendEvent(start(), makeEarn(100000, 'run', '2086-03-01'))
    const smart: AmpEntry = { uid: 'smart', type: 'cyberware', name: 'Smartlink', narrative: '', effects: [{ ref: 'rr-spec', param: 'ranged-weapons.pistols' }] }
    const add = makeAmpAdd(books!, ch, smart)
    expect(add).toMatchObject({ cost: (base + rate('rr-spec')) * P.ampPoint })
    ch = appendEvent(ch, add)
    const mod = makeAmpModify(books!, ch, { ...smart, effects: [{ ref: 'rr-skill', param: 'ranged-weapons' }] })
    expect(mod).toMatchObject({ cost: (rate('rr-skill') - rate('rr-spec')) * P.ampPoint })
    ch = appendEvent(ch, mod)
    expect(balance(books!, ch)).toBe(100000 - add.cost - mod.cost)
    expect(currentBuild(ch).amps.find(a => a.uid === 'smart')!.effects[0].ref).toBe('rr-skill')
  })

  test('buying costs its price; selling removes the item at no cost', () => {
    let ch = appendEvent(start(), makeEarn(10000, 'run', '2086-03-01'))
    const buy = makeBuy(books!, { uid: 'sg', kind: 'weapon', name: 'Sniper rifle', specialist: true })
    expect(buy).toMatchObject({ cost: books!.pricing.weaponSpecialist })
    ch = appendEvent(ch, buy)
    ch = appendEvent(ch, makeSell('it-knife'))
    expect(balance(books!, ch)).toBe(10000 - books!.pricing.weaponSpecialist)
    const items = currentBuild(ch).items.map(i => i.uid)
    expect(items).toContain('sg')
    expect(items).not.toContain('it-knife')
  })
})
