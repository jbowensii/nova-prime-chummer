import { test, expect } from 'vitest'
import { price } from '../../src/engine/price'
import { books, sample } from '../helpers'
import { describeBooks } from './_gate'

describeBooks('pricing (book samples)', () => {
  test('Lightning prices to exactly 375,000 (CRB p.85)', () => {
    const b = price(books!, sample('lightning'))
    expect(b).toMatchObject({ attributes: 150000, skills: 90000, amps: 85000, gear: 15000, spells: 35000 })
    expect(b.total).toBe(375000)
    expect(b.remaining).toBe(0)
  })
})
