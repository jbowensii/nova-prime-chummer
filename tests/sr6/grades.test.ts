// Augmentation grades (src/sr6/engine/grades.ts): the creation settings' grades, else the catalog's (the made-up
// fixture: Rustyware, Clunkware for cyberware only, Dreamware with no cost), by key.
import { expect, test } from 'vitest'
import { apply, gradeFactor, gradeKey, gradeName, gradesFor, priced, type Op } from '../../src/sr6/engine'
import { blankSr6 } from '../../src/sr6/model/character'
import { buildOf, GLIM, made } from './fixture'

const cyber = () => made().data.entry('augmentations', 'crb.glow-eyes')!
const bio = () => made().data.entry('augmentations', 'crb.spring-tendons')!

test('a catalog grade’s key is its name without “ware” or “grade”', () => {
  expect(['Alphaware', 'Omega Grade', 'Exoware', 'Used', 'Rustyware'].map(gradeKey)).toEqual(['alpha', 'omega', 'exo', 'used', 'rusty'])
})

test('offered: the settings’ grades, then the catalog’s with both factors, for the types each is for', () => {
  const { data, cr } = made()
  expect(gradesFor(cr, data, cyber())).toEqual(['standard', 'alpha', 'rusty', 'clunk'])
  expect(gradesFor(cr, data, bio())).toEqual(['standard', 'alpha', 'rusty'])  // Clunkware is for cyberware only
  expect(gradesFor(cr, data, { ...cyber(), attrs: { type: 'geneware' } })).toEqual([])
  expect(gradeName(data, 'rusty')).toBe('Rustyware')
  expect(gradeName(data, 'alpha')).toBe('Alpha')
})

test('a setting replaces the catalog’s factor; the catalog fills what the settings leave unset', () => {
  const { data, cr } = made({ rules: { 'grade:rusty:cost': 0.3 } })
  expect([gradeFactor(cr, data, 'rusty', 'essence'), gradeFactor(cr, data, 'rusty', 'cost'), gradeFactor(cr, data, 'rusty', 'avail')]).toEqual([1.2, 0.3, -1])
  expect(gradeFactor(cr, data, 'nope', 'essence')).toBeUndefined()
})

test('a catalog grade prices a line and is refused where it doesn’t apply', () => {
  const { data, cr } = made()
  const ch = blankSr6('priority', 'r1', '2026-10-05T00:00:00Z')
  ch.build = buildOf('priority', { letters: 'CABDA', metatype: GLIM })
  const act = (op: Op) => apply(ch.build, op, data, cr)
  expect(act({ op: 'purchase', kind: 'augmentations', id: 'crb.glow-eyes', rating: 2, grade: 'rusty' })).toEqual({ ok: true })
  // Glow Eyes rating 2: 1,000¥, Essence 0.2, Availability 3
  expect(priced(ch.build.purchases[0], data, cr)).toMatchObject({ cost: 400, essence: 0.24, avail: 2 })
  expect(act({ op: 'purchase', kind: 'augmentations', id: 'crb.spring-tendons', rating: 1, grade: 'clunk' })).toEqual({ ok: false, reason: 'no-grade' })
  expect(act({ op: 'purchase', kind: 'augmentations', id: 'crb.glow-eyes', rating: 1, grade: 'dream' })).toEqual({ ok: false, reason: 'unknown-grade' })
})

test('programs and autosofts are bought at a rating and priced by their formula; they stack', () => {
  const soft = { id: 'crb.glide', kind: 'programs' as const, name: 'Glide', source: 'CRB', page: 201,
    attrs: { type: 'autosoft', rating: '1-6', avail: 'Rating', cost: 'Rating x 50' }, parts: [], text: '' }
  const { data, cr } = made({ data: d => { const old = d.entry; d.entry = (k, id) => (id === soft.id ? soft : old(k, id)) } })
  const ch = blankSr6('priority', 'r1', '2026-10-05T00:00:00Z')
  const act = (op: Op) => apply(ch.build, op, data, cr)
  expect(act({ op: 'purchase', kind: 'programs', id: soft.id, rating: 4 })).toEqual({ ok: true })
  expect(act({ op: 'purchase', kind: 'programs', id: soft.id, rating: 4 })).toEqual({ ok: true })
  expect(ch.build.purchases.map(x => [x.kind, x.rating, x.qty])).toEqual([['programs', 4, 2]])
  expect(priced(ch.build.purchases[0], data, cr)).toMatchObject({ cost: 400, avail: 4, ok: true })
  expect(act({ op: 'purchase', kind: 'programs', id: soft.id, rating: 7 })).toEqual({ ok: false, reason: 'rating-range' })
})
