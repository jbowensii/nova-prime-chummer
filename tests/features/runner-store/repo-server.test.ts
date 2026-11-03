// The runner repo against a server that says no: a failed list, a save that conflicts or is refused, a delete that is
// refused; picking server or browser storage; and the one-time move of browser runners to the server.
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Codec } from '../../../src/core/shared/types'
import { detectRepo, migrateBrowserToServer, npcRepoFor, serverRepo } from '../../../src/features/runner-store/repo'
import { browserRepo, type Repo } from '../../../src/core/ui-kit/repoContext'
import { blankCharacter } from '../../../src/ca2/formats/domain/file'

interface Toy {
  id: string
}
const toy: Codec<Toy> = { tag: 'toy:doc', toXml: d => `<toy:doc id="${d.id}"/>`, fromXml: () => ({ ok: true, character: { id: 'x' } }) }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

beforeEach(() => localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

test('a list the server refuses says what it answered', async () => {
  vi.stubGlobal('fetch', async () => json({}, 503))
  await expect(serverRepo(toy).list()).rejects.toThrow('the server answered 503')
})

test('a save reports a conflict, a refusal, a bad answer and an unreachable server', async () => {
  const repo = serverRepo(toy, './', 'npcs')
  vi.stubGlobal('fetch', async () => json({ rev: 9, file: 'a.xml' }, 409))
  expect(await repo.save({ id: 'a' }, 3)).toEqual({ ok: false, conflict: { rev: 9, file: 'a.xml', updatedAt: undefined } })
  vi.stubGlobal('fetch', async () => json({ error: 'not yours' }, 403))
  expect(await repo.save({ id: 'a' }, 3)).toEqual({ ok: false, error: 'not yours' })
  vi.stubGlobal('fetch', async () => new Response('<html>', { status: 500 }))
  expect(await repo.save({ id: 'a' }, null as unknown as number)).toEqual({ ok: false, error: 'the server answered 500' })
  vi.stubGlobal('fetch', async () => Promise.reject(new Error('down')))
  expect(await repo.save({ id: 'a' }, 3)).toEqual({ ok: false, error: 'Couldn’t reach the server: down' })
})

test('a forced save with a file name puts both on the request', async () => {
  let url = ''
  vi.stubGlobal('fetch', async (u: string) => ((url = u), json({ rev: 1, file: 'n.xml' })))
  await serverRepo(toy).save({ id: 'a b' }, 1, { force: true, filename: 'n.xml' })
  expect(url).toBe('./api/characters/a%20b?force=1&filename=n.xml')
})

test('a delete the server refuses rejects with its reason', async () => {
  const repo = serverRepo(toy)
  vi.stubGlobal('fetch', async () => json({}, 200))
  await expect(repo.remove('a')).resolves.toBeUndefined()
  vi.stubGlobal('fetch', async () => json({ error: 'it is in a campaign' }, 409))
  await expect(repo.remove('a')).rejects.toThrow('it is in a campaign')
  vi.stubGlobal('fetch', async () => new Response('x', { status: 500 }))
  await expect(repo.remove('a')).rejects.toThrow('the server answered 500')
  vi.stubGlobal('fetch', async () => Promise.reject(new Error('down')))
  await expect(repo.remove('a')).rejects.toThrow()
})

test('the server repo is used only when the page says storage is on the server', async () => {
  vi.stubGlobal('fetch', async () => json({ storage: 'server' }))
  expect((await detectRepo(toy as never)).mode).toBe('server')
  vi.stubGlobal('fetch', async () => json({ storage: 'browser' }))
  expect(await detectRepo(toy as never)).toBe(browserRepo)
  vi.stubGlobal('fetch', async () => Promise.reject(new Error('no server')))
  expect(await detectRepo(toy as never)).toBe(browserRepo)
})

test('the NPC area is the server’s npcs when runners are on the server, else the browser’s own', () => {
  expect(npcRepoFor({ mode: 'server' } as Repo, toy as never).mode).toBe('server')
  expect(npcRepoFor(browserRepo, toy as never).mode).not.toBe('server')
})

test('browser runners move to the server once; ones already there are just dropped; a failed upload keeps its runner', async () => {
  const a = { ...blankCharacter(), id: 'a' },
    b = { ...blankCharacter(), id: 'b' },
    c = { ...blankCharacter(), id: 'c' }
  for (const ch of [a, b, c]) browserRepo.save(ch, undefined)
  const saved: string[] = []
  const server = {
    mode: 'server',
    list: async () => [{ ch: { id: 'a' } }],
    save: async (ch: { id: string }) => (ch.id === 'c' ? { ok: false } : (saved.push(ch.id), { ok: true })),
  } as unknown as Repo
  expect(await migrateBrowserToServer(server)).toBe(1)
  expect(saved).toEqual(['b'])
  expect((await browserRepo.list()).map(s => s.ch.id)).toEqual(['c'])
  localStorage.clear()
  expect(await migrateBrowserToServer(server)).toBe(0)
})
