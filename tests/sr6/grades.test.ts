// Augmentation grades (src/sr6/engine/grades.ts): the creation settings' grades, else the catalog's (the made-up
// fixture: Rustyware, Clunkware for cyberware only, Dreamware with no cost), by key.
import { expect, test } from 'vitest'
import { apply, type Op } from '../../src/sr6/engine/actions'
import { priced } from '../../src/sr6/engine/budgets'
import { gradeFactor, gradeFits, gradeKey, gradeName, gradesFor } from '../../src/sr6/engine/grades'
import { validateSr6 } from '../../src/sr6/engine/rules'
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

test('a catalog grade prices a line; where it doesn’t apply it is taken, an error cited to the grade', () => {
  const { data, cr } = made()
  const ch = blankSr6('priority', 'r1', '2026-10-05T00:00:00Z')
  ch.build = buildOf('priority', { letters: 'CABDA', metatype: GLIM })
  const act = (op: Op) => apply(ch.build, op, data, cr)
  expect(act({ op: 'purchase', kind: 'augmentations', id: 'crb.glow-eyes', rating: 2, grade: 'rusty' })).toEqual({ ok: true })
  // Glow Eyes rating 2: 1,000¥, Essence 0.2, Availability 3
  expect(priced(ch.build.purchases[0], data, cr)).toMatchObject({ cost: 400, essence: 0.24, avail: 2 })
  expect(act({ op: 'purchase', kind: 'augmentations', id: 'crb.spring-tendons', rating: 1, grade: 'clunk' })).toEqual({ ok: true })
  const v = validateSr6(data, cr, ch).filter(x => x.code === 'gear.grade')
  expect(v.map(x => [x.severity, x.path, x.source, x.page])).toEqual([['error', `augmentations.${ch.build.purchases[1].uid}`,
    data.entry('grades', data.grades.clunk.id)!.source, data.grades.clunk.page]])
  ch.overrides = [{ code: 'gear.grade', path: v[0].path, note: 'GM ok' }]
  expect(validateSr6(data, cr, ch).find(x => x.code === 'gear.grade')?.approved).toBe(true)
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

test('a grade a later book redefines gives way to the new one; a line already in it still fits', () => {
  const { data, cr } = made({ data: d => { d.grades.rusty.replaces = 'clunk' } })
  expect(gradesFor(cr, data, cyber())).toEqual(['standard', 'alpha', 'rusty'])  // Clunkware gone, Rustyware offered
  expect(gradeFits(cr, data, cyber(), 'clunk')).toBe(true)
  expect(gradeFits(cr, data, cyber(), 'dream')).toBe(false)
})

test('an implant’s add-ons have its grade (CRB p. 282): priced at it, changed with it, never their own', () => {
  const ch = blankSr6('priority', 'r1', '2026-10-05T00:00:00Z')
  ch.build = buildOf('priority', { letters: 'CABDA', metatype: GLIM })
  const run = (rules: Record<string, boolean> = {}) => {
    const { data, cr } = made({ rules })
    return { data, cr, act: (op: Op) => apply(ch.build, op, data, cr) }
  }
  const { data, cr, act } = run()
  expect(act({ op: 'purchase', kind: 'augmentations', id: 'crb.limb-synthetic', grade: 'alpha' })).toEqual({ ok: true })
  const limb = ch.build.purchases[0]
  expect(act({ op: 'accessory', host: limb.uid, kind: 'augmentations', id: 'crb.plating', rating: 3 })).toEqual({ ok: true })
  expect(act({ op: 'accessory', host: limb.uid, kind: 'augmentations', id: 'crb.glare-filter' })).toEqual({ ok: true })
  // alpha ×1.5 cost, ×0.7 Essence: the limb 9,000 → 13,500, its plating 3,000 → 4,500, the filter 800 → 1,200; the
  // add-ons in its Capacity cost no Essence (capacityAccessoryEssence off)
  expect(priced(limb, data, cr)).toMatchObject({ cost: 19200, essence: 0.7 })
  const on = run({ capacityAccessoryEssence: true })  // (the setting on: the filter's 0.1 × 0.7 too)
  expect(priced(limb, on.data, on.cr).essence).toBe(0.77)
  const plating = limb.accessories[0]
  expect(act({ op: 'rate', uid: plating.uid, grade: 'rusty' })).toEqual({ ok: false, reason: 'grade-follows-host' })
  // a file giving one another grade: read at the implant's, noted
  plating.grade = 'rusty'
  expect(priced(limb, data, cr).cost).toBe(19200)
  const note = validateSr6(data, cr, ch).find(x => x.code === 'gear.accessoryGrade')!
  expect(note).toMatchObject({ severity: 'warning', source: 'CRB', page: 282, path: `augmentations.${limb.uid}` })
  expect(note.message).toMatch(/Plating .* so it’s Alpha, not the file’s Rustyware\.$/)
  // the implant's grade changed: its add-ons with it, the file's own grade dropped
  expect(act({ op: 'rate', uid: limb.uid, grade: null })).toEqual({ ok: true })
  expect(plating.grade).toBeUndefined()
  expect(priced(limb, data, cr)).toMatchObject({ cost: 9000 + 3000 + 800, essence: 1 })
  expect(validateSr6(data, cr, ch).some(x => x.code === 'gear.accessoryGrade')).toBe(false)
})
