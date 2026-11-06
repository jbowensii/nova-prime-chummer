import { readFileSync } from 'node:fs'
import { test, expect } from 'vitest'
import { ampCtx, ampRating, effectRating } from '../../../../src/ca2/runner-builder/domain/amps'
import { bookFile, books, sample } from '../../../helpers'
import { describeBooks } from '../../catalog/_gate'

describeBooks('amp ratings (book samples)', () => {
  test("Lightning's amps rate 5, 6, 4, 2 = 17 (CRB p.85)", () => {
    const b = sample('lightning').build
    expect(b.amps.map(a => ampRating(books!, a, ampCtx(b, a)))).toEqual([5, 6, 4, 2])
  })

  test('catalog amps reproduce their printed rating unless the private discrepancy list has them', () => {
    const listed = new Set([...readFileSync(bookFile('book-discrepancies.md'), 'utf8').matchAll(/^\| ([a-z0-9-]+) \| (?:CRB|DHSA) p\./gm)].map(m => m[1]))
    const first = { isFirstQuality: true }
    // a mod has no base rating of its own: it adds its effects to an existing amp
    const bad = [...books!.amps.values()].filter(
      t =>
        !listed.has(t.id.replace(/^(crb|dhsa)\./, '')) &&
        (t.mod
          ? t.effects.reduce((n, e) => n + effectRating(books!, e), 0)
          : ampRating(books!, { uid: t.id, type: t.type, name: t.name, narrative: '', effects: t.effects }, first)) !== t.printedRating,
    )
    expect(bad.map(t => t.id)).toEqual([])
  })
})
