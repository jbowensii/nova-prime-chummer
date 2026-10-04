import { afterEach, expect, test, vi } from 'vitest'
import { rootAttr, serverRepo, type Codec } from '../../src/ui/repo'

// a toy game: <toy:doc id=".." name=".."/>; "bad" in the file makes it unreadable
interface Toy { id: string; name: string }
const toy: Codec<Toy> = {
  tag: 'toy:doc',
  toXml: d => `<toy:doc xmlns:toy="urn:toy" id="${d.id}" name="${d.name}"/>`,
  fromXml: xml => xml.includes('bad') ? { ok: false, reason: 'bad toy' }
    : { ok: true, character: { id: rootAttr(xml, 'id', 'toy:doc')!, name: rootAttr(xml, 'name', 'toy:doc')! } },
}

afterEach(() => vi.unstubAllGlobals())

test('rootAttr reads the given root tag, and only that one', () => {
  const xml = '<toy:doc id="a&amp;b" name="Zip"/>'
  expect(rootAttr(xml, 'id', 'toy:doc')).toBe('a&b')
  expect(rootAttr(xml, 'id')).toBeUndefined() // default tag is ca2:character
  expect(rootAttr('<ca2:character id="x">', 'id')).toBe('x')
})

test('serverRepo with a codec: lists, gets by the codec’s root id, saves its XML with If-Match', async () => {
  const calls: { url: string; init?: RequestInit }[] = []
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    if (init?.method === 'PUT') return new Response(JSON.stringify({ rev: 8, file: 'zip.xml' }))
    return new Response(JSON.stringify([
      { file: 'zip.xml', rev: 7, xml: toy.toXml({ id: 'z1', name: 'Zip' }), owner: 'pat' },
      { file: 'bad.xml', rev: 2, xml: '<toy:doc id="b1" name="Broke" bad="1"/>' }]))
  })
  const repo = serverRepo<Toy>('/', 'toy/characters', toy)
  const all = await repo.listAll()
  expect(all.stored).toEqual([{ ch: { id: 'z1', name: 'Zip' }, rev: 7, file: 'zip.xml', owner: 'pat', ownerName: undefined }])
  expect(all.unreadable).toMatchObject([{ file: 'bad.xml', error: 'bad toy', name: 'Broke' }])
  expect(calls[0].url).toBe('/api/toy/characters')
  expect((await repo.get('z1'))?.rev).toBe(7)
  await expect(repo.get('b1')).rejects.toThrow('bad toy')
  expect(await repo.get('nobody')).toBeUndefined()
  expect(await repo.save({ id: 'z1', name: 'Zap' }, 7)).toEqual({ ok: true, rev: 8, file: 'zip.xml' })
  const put = calls.at(-1)!
  expect(put.url).toBe('/api/toy/characters/z1')
  expect(put.init?.body).toBe(toy.toXml({ id: 'z1', name: 'Zap' }))
  expect((put.init?.headers as Record<string, string>)['If-Match']).toBe('7')
})
