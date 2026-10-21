import { test, expect } from 'vitest'
import { ATTRS } from '../../../src/ca2/formats/domain/types'

test('jsdom provides DOMParser; shared types load', () => {
  expect(typeof new DOMParser().parseFromString).toBe('function')
  expect(ATTRS.length).toBe(5)
})
