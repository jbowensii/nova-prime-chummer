import { afterEach, expect, test, vi } from 'vitest'
import { compendiumXml } from '../../src/engine'
import type { Compendium } from '../../src/model/types'
import { deleteCompendium, listCompendiums, readable, saveCompendium } from '../../src/ui/compendiums'

// made-up compendiums; fetch is mocked
const comp = (id: string, source: string): Compendium =>
  ({ id, name: `Made-up ${source}`, source, sharing: 'private', updatedAt: '', amps: [], items: [], vehicles: [], npcs: [] })
const row = (id: string, source: string, owner: string, ownerName: string) =>
  ({ id, file: `${id}.xml`, rev: 2, xml: compendiumXml(comp(id, source)), owner, ownerName })
const answer = (status: number, body?: unknown) => vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body),
  { status, headers: { 'Content-Type': 'application/json' } }))
afterEach(() => vi.unstubAllGlobals())

test('the list maps to overlay files in owner/id order', async () => {
  vi.stubGlobal('fetch', answer(200, [row('bbbbbbbbbbbb', 'TWO', 'zed', 'Zed GM'), row('aaaaaaaaaaaa', 'ONE', 'eve', 'Eve GM'), row('cccccccccccc', 'THREE', 'eve', 'Eve GM')]))
  const rows = await listCompendiums()
  expect(readable(rows).map(f => [f.file, f.overlay, f.publisher])).toEqual([
    ['compendiums/eve/aaaaaaaaaaaa.xml', true, 'Eve GM'],
    ['compendiums/eve/cccccccccccc.xml', true, 'Eve GM'],
    ['compendiums/zed/bbbbbbbbbbbb.xml', true, 'Zed GM'],
  ])
  expect(readable(rows)[0].xml).toContain('source="ONE"')
})

test('a 403 (a player) yields no files and no error', async () => {
  vi.stubGlobal('fetch', answer(403, { error: 'forbidden' }))
  expect(readable(await listCompendiums())).toEqual([])
})

test('another failure rejects with the reason', async () => {
  vi.stubGlobal('fetch', answer(500, { error: 'disk full' }))
  await expect(listCompendiums()).rejects.toThrow('disk full')
})

test('save: If-Match, the new rev; a 409 is a conflict with the stored rev; a taken source is an error', async () => {
  const f = answer(200, { rev: 3, file: 'aaaaaaaaaaaa.xml', updatedAt: 'x' })
  vi.stubGlobal('fetch', f)
  expect(await saveCompendium(comp('aaaaaaaaaaaa', 'ONE'), 2)).toEqual({ ok: true, rev: 3, file: 'aaaaaaaaaaaa.xml' })
  const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).toBe('./api/compendiums/aaaaaaaaaaaa')
  expect(init.method).toBe('PUT')
  expect((init.headers as Record<string, string>)['If-Match']).toBe('2')
  expect(String(init.body)).toContain('kind="compendium"')

  vi.stubGlobal('fetch', answer(409, { error: 'conflict', rev: 5, file: 'aaaaaaaaaaaa.xml', updatedAt: 'y' }))
  expect(await saveCompendium(comp('aaaaaaaaaaaa', 'ONE'), 2)).toEqual({ ok: false, conflict: { rev: 5, file: 'aaaaaaaaaaaa.xml', updatedAt: 'y' } })
  vi.stubGlobal('fetch', answer(409, { error: 'The source id ONE is taken.' }))
  expect(await saveCompendium(comp('aaaaaaaaaaaa', 'ONE'))).toEqual({ ok: false, error: 'The source id ONE is taken.' })
})

test('delete: 204 resolves, a refusal rejects with the reason', async () => {
  vi.stubGlobal('fetch', answer(204))
  await expect(deleteCompendium('aaaaaaaaaaaa')).resolves.toBeUndefined()
  vi.stubGlobal('fetch', answer(403, { error: 'not yours' }))
  await expect(deleteCompendium('aaaaaaaaaaaa')).rejects.toThrow('not yours')
})
