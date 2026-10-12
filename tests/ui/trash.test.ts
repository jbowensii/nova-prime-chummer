import { afterEach, expect, test, vi } from 'vitest'
import { loadTrash, restored, runners } from '../../src/ui/Trash'

afterEach(() => vi.unstubAllGlobals())

test('the Trash page’s words: counts and what a restore did', () => {
  expect([runners(0), runners(1), runners(3)]).toEqual(['0 runners', '1 runner', '3 runners'])
  expect(restored('Ratchet', { name: 'Ratchet', copy: false }, 'your library')).toBe('Restored Ratchet to your library.')
  expect(restored('Ratchet', { name: 'Ratchet (restored copy)', copy: true }, 'Pat Player’s library')).toBe(
    'Restored Ratchet to Pat Player’s library as “Ratchet (restored copy)”: a runner with the same id is already there, so this is a copy with a new id.',
  )
})

test('loadTrash goes to the game’s trash: Anarchy’s by default, SR6’s under sr6/', async () => {
  const urls: string[] = []
  vi.stubGlobal('fetch', async (url: string) => {
    urls.push(url)
    return new Response(JSON.stringify({ user: 'pat', name: 'Pat', items: [] }))
  })
  await loadTrash()
  await loadTrash(undefined, true)
  await loadTrash(undefined, false, 'sr6')
  await loadTrash('pat', false, 'sr6')
  expect(urls).toEqual(['./api/trash', './api/npcs/trash', './api/sr6/trash', './api/sr6/trash?user=pat'])
})
