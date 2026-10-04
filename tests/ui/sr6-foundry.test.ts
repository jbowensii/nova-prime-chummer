// The SR6 Export for Foundry helpers (src/sr6/ui/Foundry.tsx): file names on the local date, the export options.
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { sr6BooksFileName, sr6CompendiumFileName, sr6ExportOpts, sr6RunnersFileName } from '../../src/sr6/ui/Foundry'

test('file names: the local date, .sr6foundry.json', () => {
  const d = new Date(2026, 9, 4, 23, 30)
  expect(sr6RunnersFileName(d)).toBe('runners-2026-10-04.sr6foundry.json')
  expect(sr6BooksFileName(d)).toBe('books-2026-10-04.sr6foundry.json')
  expect(sr6CompendiumFileName('STREET', d)).toBe('compendium-STREET-2026-10-04.sr6foundry.json')
})

test('options: descriptions as asked, an ISO now, the app’s version', () => {
  const o = sr6ExportOpts(false)
  expect(o.descriptions).toBe(false)
  expect(new Date(o.now).toISOString()).toBe(o.now)
  expect(o.appVersion).toBe(JSON.parse(readFileSync('package.json', 'utf8')).version)
  expect(sr6ExportOpts(true).descriptions).toBe(true)
})
