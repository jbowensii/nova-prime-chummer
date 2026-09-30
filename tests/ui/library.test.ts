import { afterEach, expect, test, vi } from 'vitest'
import { characterToXml } from '../../src/engine/charxml'
import { blankCharacter } from '../../src/engine/file'
import type { Character } from '../../src/model/types'
import { arrange, initial, sortKey } from '../../src/ui/Library'
import { rootAttr, serverRepo, type Stored } from '../../src/ui/repo'

const runner = (streetName: string, name = '', updatedAt = '2026-09-01T00:00:00Z'): Character => {
  const ch = blankCharacter()
  ch.id = `id-${streetName || name || 'none'}`
  ch.identity = { ...ch.identity, streetName, name }
  ch.updatedAt = updatedAt
  return ch
}
const names = (rows: Stored[]) => rows.map(s => s.ch.identity.streetName || s.ch.identity.name || '(unnamed)')

test('A–Z by street name, else real name; accents, case and apostrophes ignored; unnamed last', () => {
  const rows = [runner('Wild Jane'), runner('', ''), runner("Father O'Neil"), runner('', 'émile'), runner('zed'), runner('"Doc"'), runner('Ace')]
    .map(ch => ({ ch }))
  expect(names(arrange(rows, 'az', ''))).toEqual(['Ace', '"Doc"', 'émile', "Father O'Neil", 'Wild Jane', 'zed', '(unnamed)'])
  expect(names(arrange(rows, 'za', ''))).toEqual(['zed', 'Wild Jane', "Father O'Neil", 'émile', '"Doc"', 'Ace', '(unnamed)'])
  expect(sortKey(runner("Father O'Neil"))).toBe('father oneil')
})

test('recently edited first; search matches street name or real name', () => {
  const rows = [runner('Old', 'Anna', '2026-01-01T00:00:00Z'), runner('New', '', '2026-09-28T00:00:00Z'), runner('Mid', 'Neil', '2026-05-01T00:00:00Z')]
    .map(ch => ({ ch }))
  expect(names(arrange(rows, 'recent', ''))).toEqual(['New', 'Mid', 'Old'])
  expect(names(arrange(rows, 'az', 'ne'))).toEqual(['Mid', 'New'])
  expect(names(arrange(rows, 'az', 'ANNA'))).toEqual(['Old'])
})

test('the initial: first letter, a whole emoji, "?" for none', () => {
  expect(initial(runner("father O'Neil"))).toBe('F')
  expect(initial(runner('', ' 🐉 Wyrm'))).toBe('🐉')
  expect(initial(runner(''))).toBe('?')
})

afterEach(() => vi.unstubAllGlobals())

test('the server list keeps files it can’t read (with why); opening one runner reads only its own file', async () => {
  const good = characterToXml(runner("Father O'Neil"))
  const bad = characterToXml(runner('Broken')).replace('<build', `<notes>a${String.fromCharCode(2)}b</notes><build`)
  expect(rootAttr(good, 'streetName')).toBe("Father O'Neil")
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify([
    { file: 'broken.xml', rev: 3, xml: bad, owner: 'ada' }, { file: 'runner.xml', rev: 139, xml: good, owner: 'ada' }])))
  const repo = serverRepo('/')
  const all = await repo.listAll()
  expect(all.stored.map(s => s.ch.identity.streetName)).toEqual(["Father O'Neil"])
  expect(all.unreadable).toMatchObject([{ file: 'broken.xml', rev: 3, name: 'Broken', owner: 'ada' }])
  expect(all.unreadable[0].error).toMatch(/Line \d+, column \d+, in <notes>: character U\+0002 isn’t allowed in XML/)
  expect((await repo.get('id-Father O\'Neil'))?.rev).toBe(139)
  await expect(repo.get('id-Broken')).rejects.toThrow(/U\+0002/)
  expect(await repo.get('nobody')).toBeUndefined()
})
