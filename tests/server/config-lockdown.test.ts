// @vitest-environment node
// Phase 1 server foundations: resolveConfig precedence, CLI host bind, the gated local lockdown, shutdown handles.
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { createServer as netServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, expect, test } from 'vitest'
// @ts-expect-error plain JS module
import { resolveConfig } from '../../server/config.mjs'
import { createServer } from './_signin'

const dir = mkdtempSync(join(tmpdir(), 'cfg-'))
const file = join(dir, 'options.json')
writeFileSync(file, JSON.stringify({ port: 3, python: 'from-file', publicUrl: 'http://file', dataPath: '/dp' }))

test('resolveConfig: flag > env > file > default', () => {
  const c = ['--config', file]
  expect(resolveConfig([...c, '--port', '1'], { PORT: '2' }).port).toBe(1)
  expect(resolveConfig(c, { PORT: '2' }).port).toBe(2)
  expect(resolveConfig(c, {}).port).toBe(3)
  expect(resolveConfig([], {}).port).toBe(80)
  expect(resolveConfig([...c, '--python=flagpy'], { PYTHON: 'envpy' }).python).toBe('flagpy')
  expect(resolveConfig(c, { PYTHON: 'envpy' }).python).toBe('envpy')
  expect(resolveConfig(c, {}).python).toBe('from-file')
  expect(() => resolveConfig(['--config', join(dir, 'none.json')], {})).toThrow(/cannot read config/)
})

test('resolveConfig: dataPath derives the folders; an explicit dir env still wins; env-only matches the old defaults', () => {
  const c = resolveConfig(['--config', file], { CUSTOM_DIR: '/x/custom' })
  expect([c.charDir, c.customDir, c.libraryDir].map(p => p.split('\\').join('/'))).toEqual(['/dp/characters', '/x/custom', '/dp/library'])
  const d = resolveConfig([], {})
  expect([d.charDir, d.customDir, d.libraryDir, d.host, d.trustProxy, d.publicUrl]).toEqual([
    '/data/characters',
    '/data/custom',
    '/data/library',
    undefined,
    '',
    '',
  ])
})

test('resolveConfig: python/staticDir defaults, last flag wins, invalid port and a null config fall back', () => {
  const d = resolveConfig([], {})
  expect(d.python).toBe('python3')
  expect(d.staticDir.split('\\').join('/')).toMatch(/dist$/)
  expect(resolveConfig(['--port', '1', '--port', '2'], {}).port).toBe(2) // last occurrence wins
  expect(resolveConfig([], { PORT: 'abc' }).port).toBe(80) // non-numeric -> default, not NaN
  const nf = join(dir, 'null.json')
  writeFileSync(nf, 'null')
  expect(resolveConfig(['--config', nf], {}).port).toBe(80) // a null config is ignored, not a crash
})

const free = () =>
  new Promise<number>(ok => {
    const s = netServer().listen(0, '127.0.0.1', () => {
      const p = (s.address() as { port: number }).port
      s.close(() => ok(p))
    })
  })

test('CLI passes host to listen', async () => {
  const port = await free()
  const p = spawn(process.execPath, [
    'server/server.mjs',
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--static-dir',
    'public',
    '--data-path',
    join(dir, 'c'),
    '--custom-dir',
    join(dir, 'u'),
    '--library-dir',
    join(dir, 'l'),
  ])
  try {
    const line: string = await new Promise((ok, no) => {
      p.stdout.on('data', d => String(d).includes('nova-prime-chummer on') && ok(String(d)))
      p.on('error', no)
      setTimeout(() => no(new Error('no start')), 15000)
    })
    expect(line).toContain(`127.0.0.1:${port}`)
    expect((await fetch(`http://127.0.0.1:${port}/`)).status).toBeLessThan(500)
  } finally {
    p.kill()
  }
}, 20000)

type Srv = { close: () => void; stopJobs: () => void; listen: (p: number, cb: () => void) => void; address: () => { port: number } }
const open = (opts: object) =>
  new Promise<{ srv: Srv; base: string; port: number }>(ok => {
    const srv: Srv = createServer({ staticDir: 'public', charDir: join(dir, 'chars'), customDir: join(dir, 'custom'), ...opts })
    srv.listen(0, () => {
      const port = srv.address().port
      ok({ srv, base: `http://127.0.0.1:${port}`, port })
    })
  })
const servers: Srv[] = []
afterAll(() => servers.forEach(s => s.close()))

test('lockdown off: no Host or secret is checked', async () => {
  const { srv, base } = await open({})
  servers.push(srv)
  expect((await fetch(`${base}/api/status`)).status).not.toBe(403)
  expect(typeof srv.stopJobs).toBe('function')
  expect(typeof srv.close).toBe('function')
})

test('lockdown on: allowed Host passes; secret via header or cookie', async () => {
  const { request } = await import('node:http')
  const { srv, port } = await open({ allowedHosts: ['app.local'], localSecret: 's3cret' })
  servers.push(srv)
  const get = (path: string, headers: Record<string, string>) =>
    new Promise<number>(ok => {
      request({ port, host: '127.0.0.1', path, headers }, r => {
        r.resume()
        ok(r.statusCode ?? 0)
      }).end()
    })
  expect(await get('/', { host: 'evil.test' })).toBe(403)
  expect(await get('/', { host: 'APP.local' })).not.toBe(403) // page needs no secret
  expect(await get('/api/status', { host: 'app.local' })).toBe(403)
  expect(await get('/api/status', { host: 'app.local', 'x-local-secret': 'wrong' })).toBe(403)
  expect(await get('/api/status', { host: 'app.local', 'x-local-secret': 's3cret' })).not.toBe(403)
  expect(await get('/api/status', { host: 'app.local', cookie: 'a=b; local_secret=s3cret' })).not.toBe(403)
  expect(await get('http://app.local/api/status', { host: 'app.local' })).toBe(403) // absolute-form target can't skip the secret gate
})
