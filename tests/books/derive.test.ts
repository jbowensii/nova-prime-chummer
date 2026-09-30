import { test, expect } from 'vitest'
import { derive } from '../../src/engine/derive'
import { books, sample } from '../helpers'
import { describeBooks } from './_gate'

describeBooks('derive (book samples)', () => {
  test('Lightning: Edge 3 (elf), knowledge includes keywords and 4+ skills', () => {
    const d = derive(books!, sample('lightning'))
    expect(d.edge).toBe(3)
    expect(d.knowledge.map(k => k.name)).toEqual(expect.arrayContaining(['Cat shaman', 'Sorcery', 'Stealth', 'Perception']))
    expect(d.awakened).toMatchObject({ projection: true, sorcery: true, conjuring: true, adept: false })
  })
})
