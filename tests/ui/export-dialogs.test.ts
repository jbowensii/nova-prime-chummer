// The Foundry export dialogs (src/ui/Foundry.tsx): the runner list's (tick runners, a whole campaign, All and None; opening
// again starts from nothing ticked) and Game data's book export (tick books, descriptions on or off; the books' samples
// and NPCs come along, one that can't be read is named). Made-up runners and the made-up catalog.
import { createElement } from 'react'
import { expect, test, vi } from 'vitest'
import { blankCharacter } from '../../src/engine/file'
import type { Campaign } from '../../src/ui/campaignsStore'
import { ExportBooksPanel, ExportRunnersDialog } from '../../src/ui/Foundry'
import { cat } from '../helpers'
import { button, change, click, field, mount, pageText, stubFetch } from './dom'

const runner = (id: string, streetName: string, campaign?: string) => ({
  ...blankCharacter(),
  id,
  campaign,
  identity: { ...blankCharacter().identity, streetName },
})
const RUNNERS = [runner('a', 'Made-up Ace', 'k1'), runner('b', 'Made-up Bee'), runner('c', 'Made-up Cog', 'k1')]
const CAMPS = [{ id: 'k1', name: 'Made-up Run' }] as Campaign[]

test('runners: a campaign ticks its runners, a box adds one, None clears; Download hands over the ticked ones', async () => {
  const got: string[][] = []
  const dialog = (open: boolean) =>
    createElement(ExportRunnersDialog<(typeof RUNNERS)[number]>, {
      runners: RUNNERS,
      campaigns: CAMPS,
      open,
      onClose: () => {},
      download: picked => got.push(picked.map(r => r.id)),
    })
  stubFetch()
  const m = await mount(dialog(true))
  expect(button('Download 0 runners').disabled).toBe(true)
  await change(field('Tick a campaign'), 'k1')
  expect(button('Download 2 runners').disabled).toBe(false)
  await change(field('Made-up Bee'), true)
  await click(button('None'))
  expect(button('Download 0 runners').disabled).toBe(true)
  await click(button('All'))
  await change(field('Made-up Ace'), false)
  await click(button('Download 2 runners'))
  expect(got).toEqual([['b', 'c']])

  await m.rerender(dialog(false))
  await m.rerender(dialog(true))
  expect(button('Download 0 runners')).toBeTruthy() // opening again starts from nothing ticked
})

test('books: the ticked books, with or without descriptions, and their samples; an unreadable sample is named', async () => {
  const files: Blob[] = []
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: (b: Blob) => (files.push(b), 'blob:made-up'), revokeObjectURL: () => {} }))
  stubFetch([
    [/custom\/imported\/samples\.xml$/, () => '<samples><sample href="test/gone.xml" name="Made-up Gone" source="TEST"/></samples>'],
    [/custom\/imported\/npcs\.xml$/, () => '<npcs/>'],
  ])
  await mount(createElement(ExportBooksPanel, { c: cat }))
  expect([...cat.sources.keys()]).toContain('TEST')
  await click(button('None'))
  expect(button('Download book data').disabled).toBe(true)
  await change(field(/^TEST\b/), true)
  await change(field(/^Include book descriptions/), false)
  await click(button('Download book data'))
  expect(files).toHaveLength(1)
  const out = JSON.parse(await files[0].text()) as { books: { source: { id: string } }[] }
  expect(out.books.map(b => b.source.id)).toEqual(['TEST'])
  expect(JSON.stringify(out)).not.toMatch(/"description"/) // descriptions off
  expect(pageText()).toMatch(/Downloaded without these sample characters and NPCs:.*Made-up Gone \(TEST\): couldn’t be fetched\./)
})
