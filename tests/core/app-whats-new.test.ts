import { expect, test } from 'vitest'
import { newestSection, shouldShowOnce } from '../../src/core/app/changelog'

const md = '# Release notes\n\n## [0.45.0](u) (2026-11-02)\n\n- new thing\n\n## 0.44.1 — old\n\n- old thing\n'

test('newestSection returns only the first ## section', () => {
  expect(newestSection(md)).toBe('## [0.45.0](u) (2026-11-02)\n\n- new thing')
  expect(newestSection('no headings')).toBe('')
  expect(newestSection('## only\n- x')).toBe('## only\n- x')
})

test('shouldShowOnce: quiet on first run, shows once per upgrade', () => {
  const m = new Map<string, string>()
  const st = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
  expect(shouldShowOnce('1', st)).toBe(false)
  expect(shouldShowOnce('1', st)).toBe(false)
  expect(shouldShowOnce('2', st)).toBe(true)
  expect(shouldShowOnce('2', st)).toBe(false)
  expect(
    shouldShowOnce('3', {
      getItem: () => {
        throw new Error('x')
      },
      setItem: () => {},
    }),
  ).toBe(false)
})
