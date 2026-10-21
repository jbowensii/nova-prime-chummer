// Grades: the pickers' options and the reasons a grade cannot go on a line (src/sr6/runner-builder/domain/creation/grades.ts).
import { expect, test } from 'vitest'
import { gradeKnown, gradeOptions, gradeProblem, gradesFor } from '../../../src/sr6/runner-builder/domain/creation/grades'
import { made } from '../catalog/fixture'

const cyber = () => made().data.entry('augmentations', 'crb.glow-eyes')!
const bio = () => made().data.entry('augmentations', 'crb.spring-tendons')!

test('a grade is known once its Essence factor is set, or the catalog gives both factors', () => {
  const { data, cr } = made()
  expect(gradeKnown(cr, data, 'alpha')).toBe(true) // a setting
  expect(gradeKnown(cr, data, 'rusty')).toBe(true) // a catalog grade with both factors
  expect(gradeKnown(cr, data, 'dream')).toBe(false) // no cost printed
  expect(gradeKnown(cr, data, 'nothing')).toBe(false)
})

test('the picker offers a custom line every grade; an augmentation those its type takes first, the rest after', () => {
  const { data, cr } = made()
  const all = gradesFor(cr, data)
  expect(gradeOptions(cr, data)).toEqual(all)
  expect(gradeOptions(cr, data, cyber())).toEqual(['standard', 'alpha', 'rusty', 'clunk'])
  // Clunkware is cyberware only: for bioware it comes after the grades the type takes
  expect(gradeOptions(cr, data, bio())).toEqual(['standard', 'alpha', 'rusty', 'clunk'])
  expect(gradesFor(cr, data, bio())).toEqual(['standard', 'alpha', 'rusty'])
  // a type no grade covers: every grade is still listed, none first
  expect(gradeOptions(cr, data, { ...cyber(), attrs: { type: 'geneware' } })).toEqual(all)
})

test('anything but an augmentation has no grade options', () => {
  const { data, cr } = made()
  const nonAug = { ...cyber(), kind: 'weapons' as const }
  expect(gradeOptions(cr, data, nonAug)).toEqual([])
})

test('why a grade cannot go on a line: unknown, or the line is no augmentation; a custom line may take any known grade', () => {
  const { data, cr } = made()
  expect(gradeProblem(cr, data, 'dream', cyber())).toBe('unknown-grade')
  expect(gradeProblem(cr, data, 'alpha')).toBeNull()
  expect(gradeProblem(cr, data, 'alpha', cyber())).toBeNull()
  expect(gradeProblem(cr, data, 'alpha', { ...cyber(), kind: 'weapons' })).toBe('no-grade')
  // a type the grade is not for may still take it (Review flags it)
  expect(gradeProblem(cr, data, 'clunk', bio())).toBeNull()
})
