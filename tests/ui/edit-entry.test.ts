// The catalog entry editor (src/ui/EditEntry.tsx): an entry's Edit button opens the form on the server (none in the
// browser-only build), a changed name and description go to the edits layer and the catalog reloads; a new entry under a
// new house-rule source makes the source first, a bad source id is refused inline; an amp is added through the Amp
// Builder. Made-up catalog entries.
import { createElement } from 'react'
import { expect, test, vi } from 'vitest'
import { CatalogEdits, EntryForm } from '../../src/ui/EditEntry'
import { EditButton } from '../../src/features/catalog-edits/editTrigger'
import { ca2Codec } from '../../src/engine/charxml'
import { serverRepo } from '../../src/features/runner-store/repo'
import { RepoContext } from '../../src/core/ui-kit/repoContext'
import { cat } from '../helpers'
import { button, change, click, field, hasButton, mount, pageText, stubFetch } from './dom'

const dialog = () => document.querySelector('dialog[open]')!

test('in the browser-only build an entry has no Edit button', async () => {
  stubFetch()
  await mount(
    createElement(CatalogEdits, { c: cat, reload: async () => {} }, createElement(EditButton, { kind: 'items', id: 'test.nano-tape', name: 'Nano Tape' })),
  )
  expect(hasButton('Edit Nano Tape')).toBe(false)
})

test('on the server, Edit opens the form; the change goes to the edits layer and the catalog reloads', async () => {
  const calls = stubFetch([[/\/api\/edits\//, () => new Response(null, { status: 204 })]])
  const reload = vi.fn(async () => {})
  await mount(
    createElement(
      RepoContext.Provider,
      { value: serverRepo(ca2Codec) },
      createElement(CatalogEdits, { c: cat, reload }, createElement(EditButton, { kind: 'items', id: 'test.nano-tape', name: 'Nano Tape' })),
    ),
  )
  await click(button('Edit Nano Tape'))
  expect(dialog().textContent).toMatch(/Edit Nano Tape/)
  await change(field('Name', dialog()), 'Nano Tape Plus')
  await change(field('Description', dialog()), 'A made-up roll of sticky tape.')
  await click(button('Save changes'))
  const put = calls.find(x => x.init?.method === 'PUT')!
  expect(put.url).toMatch(/\/api\/edits\/items\/test\.nano-tape$/)
  expect(String(put.init!.body)).toMatch(/Nano Tape Plus[\s\S]*<description>A made-up roll of sticky tape\.<\/description>/)
  expect(reload).toHaveBeenCalled()
  expect(document.querySelector('dialog[open]')).toBeNull()
})

test('a new weapon under a new house-rule source: a bad id is refused, then the source is made before the entry', async () => {
  const calls = stubFetch([[/\/api\/edits\/sources$/, () => ({ ok: true })]])
  const saved: { e: unknown; desc: string }[] = []
  const done = vi.fn(async () => {})
  await mount(createElement(EntryForm, { c: cat, kind: 'items', save: async (e, desc) => void saved.push({ e, desc }), onDone: done, onCancel: () => {} }))
  await change(field('House-rule source'), '+')
  await change(field('TABLE'), '9x')
  expect(pageText()).toMatch(/A source id starts with a letter/)
  await change(field('TABLE'), 'MUH')
  await change(field('Our table’s house rules'), 'Made-up house rules')
  await change(field('Name'), 'Made-up zip gun')
  await change(field('Kind'), 'weapon')
  await change(field('Damage (DV)'), '5')
  await click(button('Add item'))
  expect(calls.find(x => /edits\/sources$/.test(x.url))?.init?.body).toBe(JSON.stringify({ id: 'MUH', name: 'Made-up house rules' }))
  expect(saved[0].e).toMatchObject({ id: 'muh.made-up-zip-gun', kind: 'weapon', name: 'Made-up zip gun', dv: '5', source: 'MUH' })
  expect(done).toHaveBeenCalledWith('Added Made-up zip gun.')
})

test('a new amp is built in the Amp Builder and saved to the catalog with its rating', async () => {
  stubFetch()
  const saved: Record<string, unknown>[] = []
  await mount(
    createElement(EntryForm, {
      c: cat,
      kind: 'amps',
      sources: [...cat.sources.values()].filter(s => s.id === 'TEST'),
      save: async e => void saved.push(e as Record<string, unknown>),
      onDone: async () => {},
      onCancel: () => {},
    }),
  )
  await change(field('Amp type'), 'quality')
  await change(field('Name'), 'Made-up Grit')
  const fx = field<HTMLSelectElement>('Add an effect')
  await change(fx, [...fx.options].find(o => o.value && !o.disabled)!.value)
  await click(button('Save to the compendium'))
  expect(saved[0]).toMatchObject({ type: 'quality', name: 'Made-up Grit', source: 'TEST', id: 'test.made-up-grit' })
  expect(saved[0].printedRating).toBeGreaterThan(1)
})
