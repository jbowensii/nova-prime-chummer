import { test, expect } from 'vitest'
import { ATTRS } from '../../src/model/types'

test('jsdom provides DOMParser; shared types load', () => {
  expect(typeof new DOMParser().parseFromString).toBe('function')
  expect(ATTRS.length).toBe(5)
})
