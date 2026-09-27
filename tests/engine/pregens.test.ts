// The engine must reproduce every number the book prints for its pregens (CRB p.88-111):
// amp ratings, dice pools, wound thresholds and Essence. A printed amp rating the rules
// can't reproduce must be listed in docs/book-discrepancies.md (Pregens table).
import { readFileSync } from 'node:fs'
import { describe, test, expect } from 'vitest'
import { ampCtx, ampRating } from '../../src/engine/amps'
import { derive } from '../../src/engine/derive'
import { price } from '../../src/engine/price'
import { validate } from '../../src/engine/validate'
import { cat, sample } from '../helpers'

type Printed = Record<string, { page: number; essence: number; thresholds: Record<string, number>;
  amps: Record<string, number>; pools: { skill: string; spec: string | null; attr: string; dp: number }[] }>
const printed: Printed = JSON.parse(readFileSync('tests/fixtures/pregens-printed.json', 'utf8'))
const listed = new Set([...readFileSync('docs/book-discrepancies.md', 'utf8')
  .matchAll(/^\| ([a-z-]+) \| (amp-\d+) \|/gm)].map(m => `${m[1]}/${m[2]}`))

describe.each(Object.keys(printed))('%s', id => {
  const ch = sample(id)
  const p = printed[id]
  const d = derive(cat, ch)

  test('every catalog reference resolves', () => {
    expect(validate(cat, ch).filter(v => v.code === 'ref.unknown')).toEqual([])
  })

  test(`amp ratings match CRB p.${p.page}`, () => {
    const b = ch.build
    const wrong = b.amps.filter(a => !listed.has(`${id}/${a.uid}`) && ampRating(cat, a, ampCtx(b, a)) !== p.amps[a.uid])
      .map(a => `${a.name}: printed ${p.amps[a.uid]}, computed ${ampRating(cat, a, ampCtx(b, a))}`)
    expect(wrong).toEqual([])
  })

  test('dice pools match', () => {
    const wrong = p.pools.filter(x => !d.pools.some(q => q.skill === x.skill && (q.spec ?? null) === x.spec && q.attr === x.attr && q.dp === x.dp))
      .map(x => `${x.spec ?? x.skill}@${x.attr}: printed ${x.dp}, computed ${d.pools.find(q => q.skill === x.skill && (q.spec ?? null) === x.spec && q.attr === x.attr)?.dp}`)
    expect(wrong).toEqual([])
  })

  test('thresholds and Essence match', () => {
    for (const [k, v] of Object.entries(p.thresholds))
      expect((d.thresholds as Record<string, number[] | undefined>)[k]?.[0], k).toBe(v)
    expect(d.essence).toBe(p.essence)
  })

  test('price is reported (the book does not say pregens are exactly on budget)', () => {
    const b = price(cat, ch)
    expect(b.total).toBeGreaterThan(0)
    console.info(`${id}: ${b.total.toLocaleString('en-US')} of ${b.budget.toLocaleString('en-US')}`)
  })
})
