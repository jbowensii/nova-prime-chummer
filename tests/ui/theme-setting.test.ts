import { afterEach, expect, test, vi } from 'vitest'
import { applySettings, DEFAULTS, loadSettings, resolveTheme } from '../../src/ui/settings'

const device = (dark: boolean) => vi.stubGlobal('matchMedia', () => ({ matches: dark, addEventListener: () => {} }))
afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})

test('a new browser follows the device; a saved light or dark stays', () => {
  expect(DEFAULTS.theme).toBe('system')
  device(true)
  expect(loadSettings().theme).toBe('system')
  expect(resolveTheme(loadSettings().theme)).toBe('dark')
  device(false)
  expect(resolveTheme(loadSettings().theme)).toBe('light')
  localStorage.setItem('ca2.settings.v1', JSON.stringify({ theme: 'light' }))
  device(true)
  expect(resolveTheme(loadSettings().theme)).toBe('light')
  localStorage.setItem('ca2.settings.v1', JSON.stringify({ theme: 'dark' }))
  device(false)
  expect(resolveTheme(loadSettings().theme)).toBe('dark')
})

test('the page always gets light or dark, never "system"', () => {
  device(true)
  applySettings({ ...DEFAULTS, theme: 'system' })
  expect(document.documentElement.dataset.theme).toBe('dark')
  device(false)
  applySettings({ ...DEFAULTS, theme: 'system' })
  expect(document.documentElement.dataset.theme).toBe('light')
})
