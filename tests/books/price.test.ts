import { test, expect } from 'vitest'
import { price } from '../../src/engine/price'
import { books, sample } from '../helpers'
import { describeBooks } from './_gate'

describeBooks('pricing (book samples)', () => {
  test('Lightning prices to exactly the runner level’s budget', () => {
    const b = price(books!, sample('lightning'))
    expect(b.total).toBe(books!.levels.get('runner')!.nuyen)
    expect(b.remaining).toBe(0)
  })
})
