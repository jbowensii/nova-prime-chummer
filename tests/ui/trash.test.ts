import { expect, test } from 'vitest'
import { restored, runners } from '../../src/ui/Trash'

test('the Trash page’s words: counts and what a restore did', () => {
  expect([runners(0), runners(1), runners(3)]).toEqual(['0 runners', '1 runner', '3 runners'])
  expect(restored('Ratchet', { name: 'Ratchet', copy: false }, 'your library')).toBe('Restored Ratchet to your library.')
  expect(restored('Ratchet', { name: 'Ratchet (restored copy)', copy: true }, 'Pat Player’s library'))
    .toBe('Restored Ratchet to Pat Player’s library as “Ratchet (restored copy)”: a runner with the same id is already there, so this is a copy with a new id.')
})
