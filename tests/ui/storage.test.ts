import { test, expect, vi } from 'vitest'
import { deleteCharacter, getCharacter, listCharacters, needsExportReminder, saveCharacter } from '../../src/ui/storage'
import { blankCharacter } from '../../src/engine/file'

const testChar = () => {
  const ch = blankCharacter()
  ch.identity.name = 'Fixture Runner'
  return ch
}

test('save, list, get, delete round-trip', () => {
  localStorage.clear()
  const ch = testChar()
  expect(saveCharacter(ch).ok).toBe(true)
  expect(listCharacters().map(c => c.id)).toEqual([ch.id])
  expect(getCharacter(ch.id)!.identity.name).toBe('Fixture Runner')
  deleteCharacter(ch.id)
  expect(listCharacters()).toEqual([])
})

test('export reminder: changed since export and export older than a week', () => {
  const ch = { ...testChar(), updatedAt: '2026-09-20T00:00:00Z', lastExportedAt: '2026-09-01T00:00:00Z' }
  expect(needsExportReminder(ch, Date.parse('2026-09-27T00:00:00Z'))).toBe(true)
  expect(needsExportReminder({ ...ch, lastExportedAt: '2026-09-21T00:00:00Z' }, Date.parse('2026-09-27T00:00:00Z'))).toBe(false)
})

test('a storage failure is reported, not thrown', () => {
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('QuotaExceeded')
  })
  expect(saveCharacter(testChar()).ok).toBe(false)
  spy.mockRestore()
})
