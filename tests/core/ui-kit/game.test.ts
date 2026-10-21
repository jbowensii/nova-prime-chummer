import { afterEach, expect, test, vi } from 'vitest'
import { GAME_KEY, gameOf, homeOf, storedGame, storeGame } from '../../../src/core/ui-kit/game'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

test('the game comes from the route: #/sr6… is SR6, everything else Anarchy', () => {
  expect(gameOf([])).toBe('ca2')
  expect(gameOf(['c', 'x'])).toBe('ca2')
  expect(gameOf(['books'])).toBe('ca2')
  expect(gameOf(['sr6'])).toBe('sr6')
  expect(gameOf(['sr6', 'books'])).toBe('sr6')
  expect(homeOf('ca2')).toBe('#/')
  expect(homeOf('sr6')).toBe('#/sr6')
})

test('the stored game round-trips, and junk reads as nothing', () => {
  expect(storedGame()).toBeNull()
  storeGame('sr6')
  expect(localStorage.getItem(GAME_KEY)).toBe('sr6')
  expect(storedGame()).toBe('sr6')
  storeGame('ca2')
  expect(storedGame()).toBe('ca2')
  localStorage.setItem(GAME_KEY, 'sr5')
  expect(storedGame()).toBeNull()
})

test('storage that throws reads as nothing and never throws', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('SecurityError')
  })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('QuotaExceeded')
  })
  expect(storedGame()).toBeNull()
  expect(() => storeGame('sr6')).not.toThrow()
})
