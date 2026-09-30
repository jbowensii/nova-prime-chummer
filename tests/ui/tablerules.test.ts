import { afterEach, expect, test, vi } from 'vitest'
import { loadTableRules } from '../../src/ui/TableRules'

const reply = (body: string, type: string, status = 200) => vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status, headers: { 'content-type': type } })))
afterEach(() => vi.unstubAllGlobals())

test('an HTML answer with status 200 means nothing saved, even strict', async () => {
  reply('<!doctype html><html></html>', 'text/html')
  expect(await loadTableRules({ strict: true })).toEqual([])
})
test('a saved XML file is read', async () => {
  reply('<tablerules><rule id="x" on="true"/></tablerules>', 'application/xml')
  expect(await loadTableRules({ strict: true })).toEqual([{ id: 'x', on: true }])
})
test('strict still throws on a server error, a network failure and a wrong XML document', async () => {
  reply('', 'text/plain', 500)
  await expect(loadTableRules({ strict: true })).rejects.toThrow(/500/)
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('down') }))
  await expect(loadTableRules({ strict: true })).rejects.toThrow(/network/)
  reply('<other/>', 'text/xml')
  await expect(loadTableRules({ strict: true })).rejects.toThrow(/table rules document/)
})
