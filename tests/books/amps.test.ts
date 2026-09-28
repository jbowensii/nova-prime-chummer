import { test, expect } from 'vitest'
import { ampCtx, ampRating } from '../../src/engine/amps'
import { books, sample } from '../helpers'
import { describeBooks } from './_gate'

describeBooks('amp ratings (book samples)', () => {
  test("Lightning's amps rate 5, 6, 4, 2 = 17 (CRB p.85)", () => {
    const b = sample('lightning').build
    expect(b.amps.map(a => ampRating(books!, a, ampCtx(b, a)))).toEqual([5, 6, 4, 2])
  })
})
