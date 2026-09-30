import { test, expect } from 'vitest'
import { validate } from '../../src/engine/validate'
import { books, sample } from '../helpers'
import { describeBooks } from './_gate'

// A book sample is the book as printed: its file explains and approves nothing, so whatever the book prints against the
// rules shows on Review, unapproved (the owner's to look into).
describeBooks('validation (book samples)', () => {
  test('Lightning, as printed: no override, no drawback note, nothing approved', () => {
    const ch = sample('lightning')
    expect(ch.overrides).toEqual([])
    expect(ch.build.amps.flatMap(a => a.effects).filter(e => e.note === 'book drawback')).toEqual([])
    expect(validate(books!, ch).filter(v => v.approved)).toEqual([])
  })
})
