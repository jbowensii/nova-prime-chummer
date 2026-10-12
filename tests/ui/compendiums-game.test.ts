// The compendium store per game (src/ui/compendiumStore.ts, src/sr6/ui/compendiumStore.ts): Anarchy's calls stay on
// /api/compendiums, SR6's go to /api/sr6/compendiums with the SR6 file; each game's rows read only its own files.
// Made-up compendiums; fetch is mocked.
import { afterEach, expect, test, vi } from 'vitest'
import { compendiumXml } from '../../src/engine'
import { sr6CompendiumXml } from '../../src/sr6/engine/compendium'
import type { Sr6Compendium } from '../../src/sr6/model/types'
import { listSr6Compendiums, parseSr6Rows, saveSr6Compendium } from '../../src/sr6/ui/compendiumStore'
import { deleteCompendium, listCompendiums, listShared, parseRows } from '../../src/ui/compendiumStore'

const kit: Sr6Compendium = {
  id: 'aaaaaaaaaaaa',
  name: 'Street Kit',
  source: 'STREET',
  sharing: 'private',
  updatedAt: '',
  npcs: [],
  entries: [{ id: 'street.zap-stick', kind: 'weapons', name: 'Zap Stick', source: 'STREET', page: 1, attrs: { dv: '3S' }, parts: [], text: '' }],
}
const ca2Xml = compendiumXml({
  id: 'bbbbbbbbbbbb',
  name: 'Anarchy Kit',
  source: 'STREET',
  sharing: 'private',
  updatedAt: '',
  amps: [],
  items: [],
  vehicles: [],
  npcs: [],
})
const row = (id: string, xml: string) => ({ id, file: `${id}.xml`, rev: 2, xml, owner: 'gil', ownerName: 'Gil' })
const answer = (status: number, body?: unknown) =>
  vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
const urls = (f: ReturnType<typeof answer>) => f.mock.calls.map(c => (c as unknown as [string])[0])
afterEach(() => vi.unstubAllGlobals())

test('list: SR6 asks /api/sr6/compendiums, the default (Anarchy) /api/compendiums; a 403 is none', async () => {
  const f = answer(200, [])
  vi.stubGlobal('fetch', f)
  await listSr6Compendiums()
  await listCompendiums('./', 'sr6')
  await listCompendiums()
  expect(urls(f)).toEqual(['./api/sr6/compendiums', './api/sr6/compendiums', './api/compendiums'])
  vi.stubGlobal('fetch', answer(403, { error: 'forbidden' }))
  expect(await listSr6Compendiums()).toEqual([])
})

test('players list the shared ones: /api/compendiums/shared and /api/sr6/compendiums/shared', async () => {
  const f = answer(200, [])
  vi.stubGlobal('fetch', f)
  await listShared()
  await listShared('./', 'sr6')
  expect(urls(f)).toEqual(['./api/compendiums/shared', './api/sr6/compendiums/shared'])
})

test('save: SR6 PUTs its own file to /api/sr6/compendiums/<id> with If-Match; a 409 conflict has the stored rev', async () => {
  const f = answer(200, { rev: 3, file: 'aaaaaaaaaaaa.xml', updatedAt: 'x' })
  vi.stubGlobal('fetch', f)
  expect(await saveSr6Compendium(kit, 2)).toEqual({ ok: true, rev: 3, file: 'aaaaaaaaaaaa.xml' })
  const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
  expect([url, init.method, (init.headers as Record<string, string>)['If-Match']]).toEqual(['./api/sr6/compendiums/aaaaaaaaaaaa', 'PUT', '2'])
  expect(String(init.body)).toBe(sr6CompendiumXml(kit))
  expect(String(init.body)).toContain('<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="compendium"')
  vi.stubGlobal('fetch', answer(409, { error: 'conflict', rev: 5, file: 'aaaaaaaaaaaa.xml', updatedAt: 'y' }))
  expect(await saveSr6Compendium(kit, 2)).toEqual({ ok: false, conflict: { rev: 5, file: 'aaaaaaaaaaaa.xml', updatedAt: 'y' } })
})

test('delete: the game picks the route', async () => {
  const f = answer(204)
  vi.stubGlobal('fetch', f)
  await deleteCompendium('aaaaaaaaaaaa', 'sr6')
  await deleteCompendium('bbbbbbbbbbbb')
  expect(urls(f)).toEqual(['./api/sr6/compendiums/aaaaaaaaaaaa', './api/compendiums/bbbbbbbbbbbb'])
})

test('rows: each game reads only its own files; the other game’s goes in bad', () => {
  const rows = [row('aaaaaaaaaaaa', sr6CompendiumXml(kit)), row('bbbbbbbbbbbb', ca2Xml)]
  const sr6 = parseSr6Rows(rows)
  expect(sr6.comps.map(x => [x.id, x.rev, x.owner, x.ownerName, x.entries.length])).toEqual([['aaaaaaaaaaaa', 2, 'gil', 'Gil', 1]])
  expect(sr6.bad.map(b => [b.row.id, b.error])).toEqual([['bbbbbbbbbbbb', 'This is a Shadowrun Anarchy compendium. Open it on the Anarchy side.']])
  const ca2 = parseRows(rows)
  expect(ca2.comps.map(x => x.id)).toEqual(['bbbbbbbbbbbb'])
  expect(ca2.bad.map(b => b.row.id)).toEqual(['aaaaaaaaaaaa'])
})
