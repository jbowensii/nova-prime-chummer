// The SR6 Export for Foundry helpers (src/sr6/foundry/ui/Foundry.tsx): file names on the local date, the export options.
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { runnersStem } from '../../../src/features/foundry-kit/foundryKit'
import { sr6BooksFileName, sr6CompendiumFileName, sr6ExportOpts, sr6RunnersFileName } from '../../../src/sr6/foundry/ui/Foundry'

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

test('a lone runner’s file is named for it; several are counted', () => {
  const r = (streetName: string, name = '') => ({ identity: { streetName, name } })
  expect(runnersStem([r('Corner Goon')])).toBe('Corner-Goon')
  expect(runnersStem([r('', 'Zoé Smith')])).toBe('Zoe-Smith')
  expect(runnersStem([r('???')])).toBe('runner')
  expect(runnersStem([r('A'), r('B')])).toBe('runners-2')
  expect(sr6RunnersFileName(new Date(2026, 9, 4), 'Corner-Goon')).toBe('Corner-Goon-2026-10-04.sr6foundry.json')
})
