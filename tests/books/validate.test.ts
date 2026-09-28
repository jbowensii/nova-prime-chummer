import { test, expect } from 'vitest'
import { validate } from '../../src/engine/validate'
import { books, sample } from '../helpers'
import { describeBooks } from './_gate'

describeBooks('validation (book samples)', () => {
  test('Lightning has no errors', () => {
    expect(validate(books!, sample('lightning')).filter(v => v.severity === 'error')).toEqual([])
  })
})
