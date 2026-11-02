// PageLink and the Settings "Linked rulebooks" list; the PDF never leaves the browser (no fetch).
import { createElement } from 'react'
import { expect, test, vi } from 'vitest'

const links = vi.hoisted(() => ({ list: [{ src: 'SR6', file: 'sr6-core.pdf' }], unlink: undefined as unknown }))
vi.mock('../../src/core/ui-kit/pdfLinks', async orig => ({
  ...(await orig<object>()),
  linkedBooks: async () => links.list,
  unlink: async (s: string) => void (links.list = links.list.filter(b => b.src !== s)),
}))

import { PageLink } from '../../src/core/ui-kit/PageLink'
import { LinkedBooks } from '../../src/core/ui-kit/LinkedBooks'
import { lifeModuleText } from '../../src/sr6/runner-builder/ui/EntryRef'
import type { Sr6Entry } from '../../src/sr6/formats/domain/types'
import { click, mount, pageText, settle } from './dom'

const win = window as unknown as Record<string, unknown>

test('PageLink: plain text without the file picker, a link with it', async () => {
  delete win.showOpenFilePicker
  await mount(createElement(PageLink, { source: 'SR6', page: 12 }))
  expect(document.querySelector('a')).toBeNull()
  expect(pageText()).toContain('SR6 p.12')
  win.showOpenFilePicker = vi.fn()
  await mount(createElement(PageLink, { source: 'SR6', page: 12 }))
  expect(document.querySelector('a')?.textContent).toBe('SR6 p.12')
  delete win.showOpenFilePicker
})

test('Linked rulebooks lists a linked book and Unlink removes it, with no network call', async () => {
  const fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)
  win.showOpenFilePicker = vi.fn()
  await mount(createElement(LinkedBooks))
  await settle()
  expect(pageText()).toContain('sr6-core.pdf')
  await click(document.querySelector('button[aria-label="Unlink SR6"]')!)
  await settle()
  expect(pageText()).not.toContain('sr6-core.pdf')
  expect(fetchSpy).not.toHaveBeenCalled()
  delete win.showOpenFilePicker
})

test('a life module with no printed text describes what it grants', () => {
  const e = {
    kind: 'lifemodules',
    attrs: { stage: 'adult', skillPoints: '3', nuyen: '7000', contactTypes: 'street medical', requires: 'awakened' },
    parts: [{ tag: 'choice', attrs: { points: '1', options: 'bod str' }, text: '' }],
  } as unknown as Sr6Entry
  const t = lifeModuleText(e)
  expect(t).toContain('3 skill points, 7000¥')
  expect(t).toContain('Contacts: street, medical')
  expect(t).toContain('Requires: awakened')
  expect(t).toContain('bod, str')
})
