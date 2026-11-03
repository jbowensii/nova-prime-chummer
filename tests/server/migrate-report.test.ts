// @vitest-environment node
// The migrator's dry-run report in plain words, and its "is the server still running" check. Made-up plan, no disk.
import { createServer } from 'node:net'
import { expect, test } from 'vitest'
// @ts-expect-error plain JS module
import { describe, listening } from '../../server/migrate.mjs'

const plan = {
  dataPath: '/data',
  roots: { charDir: '/old/characters', customDir: '/old/custom' },
  renames: [{ from: 'sr6', to: 'sr6-2' }],
  entries: [
    { sha256: 'abc', size: 12, src: '/old/a.xml', dst: '/data/a.xml' },
    { sha256: 'def', size: 3, src: '/old/u.json', dst: '/data/u.json', rewrite: 'owner' },
  ],
  skipped: ['/old/tmp'],
  unresolved: [{ path: '/old/odd', why: 'unknown folder' }],
  refused: ['the server is running'],
}

test('the dry-run report names each move, the renamed account, what stays behind and why it was refused', () => {
  const text = describe(plan)
  expect(text).toContain('Migration into /data')
  expect(text).toContain('the account "sr6" shares characters/sr6/')
  expect(text).toContain('abc  12  /old/a.xml -> /data/a.xml')
  expect(text).toContain('[rewrites the name in owner]')
  expect(text).toContain('UNRESOLVED (stays where it is): /old/odd (unknown folder)')
  expect(text).toContain('2 files to move, 1 scratch files left in the old folders, 1 unresolved.')
  expect(text).toContain('(not while anything is unresolved)')
  expect(text).toContain('REFUSED: the server is running')
})

test('a clean plan says nothing is blocking the move of the old folders', () => {
  const text = describe({ ...plan, renames: [], unresolved: [], refused: [] })
  expect(text).not.toContain('NOTICE')
  expect(text).not.toContain('not while anything is unresolved')
})

test('listening is true while something holds the port and false once it is free', async () => {
  const s = createServer()
  await new Promise<void>(ok => s.listen(0, '127.0.0.1', ok))
  const port = (s.address() as { port: number }).port
  expect(await listening(port)).toBe(true)
  await new Promise(ok => s.close(ok))
  expect(await listening(port)).toBe(false)
})
