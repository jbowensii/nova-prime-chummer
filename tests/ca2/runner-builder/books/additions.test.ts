// Book-specific numbers: pregen weapon/vehicle stats, and Finalize on a real pregen.
import { test, expect } from 'vitest'
import { appendEvent, finalize, makeEarn, reopen } from '../../../../src/ca2/runner-builder/domain/career'
import { derive } from '../../../../src/ca2/runner-builder/domain/derive'
import { price } from '../../../../src/ca2/runner-builder/domain/price'
import { books, sample } from '../../../helpers'
import { describeBooks } from '../../catalog/_gate'

describeBooks('weapons, vehicles and finalize (book samples)', () => {
  test('pregen weapons print the book DVs (CRB p.88, 104, 106)', () => {
    const dv = (id: string, name: string) => derive(books!, sample(id)).weapons.find(w => w.name === name)!.dv
    expect(dv('hercules', 'Unarmed')).toBe('2')
    expect(dv('hercules', 'Ares Light Fire')).toBe('4')
    expect(dv('drakk', 'Unarmed')).toBe('5')
    expect(dv('drakk', 'Sword')).toBe('7')
    expect(dv('drakk', 'Throwing knife')).toBe('6')
    expect(dv('white-rabbit', 'Unarmed')).toBe('3') // STR 2 + aluminum bone lacing DV +1
  })

  test('vehicle stats match the book (CRB p.96-101)', () => {
    const v = (id: string, name: string) => derive(books!, sample(id)).vehicles.find(x => x.name === name)!
    expect(v('charon', 'Eurocar Northstar 2.0')).toMatchObject({ pilot: 6, body: 7, handling: 1, speed: 4, armor: 1 })
    expect(v('charon', 'Cyberspace Design Quadrotor')).toMatchObject({ pilot: 6, body: 1, handling: 9, speed: 4, armor: 0, flying: true })
    expect(v('casper', 'Roto-drone')).toMatchObject({ body: 2, handling: 7, speed: 6 })
    expect(v('casper', 'Damaged MCT Gnat')).toMatchObject({ body: 0, handling: 10, speed: 1 })
    expect(v('casper', 'Cyberspace Design Quadrotor').count).toBe(2)
    expect(v('charon', 'Eurocar Northstar 2.0').thresholds).toEqual([8, 15, 22]) // Body 7 + Armor 1; 2x; 3x
  })

  test('Finalize can be undone while no earnings are recorded', () => {
    const ch = finalize(books!, sample('lightning'))
    const back = reopen(books!, ch)
    expect(back.finalizedAt).toBeUndefined()
    expect(price(books!, back).remaining).toBe(0)
    expect(() => reopen(books!, appendEvent(ch, makeEarn(1000, 'run', '2086-01-01')))).toThrow(/ledger/)
  })
})
