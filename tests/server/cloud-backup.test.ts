// @vitest-environment node
// Cloud backup through the API against a local fake S3 (stub worker for the zip): not set up, a backup goes up, it is listed,
// the newest is restored, and a bad name or an empty bucket is refused.
import { mkdtempSync, writeFileSync } from 'node:fs'
import { createServer as http, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { createServer } from './_signin'

vi.setConfig({ testTimeout: 30000 })
const dir = mkdtempSync(join(tmpdir(), 'cloud-'))
const store = new Map<string, Buffer>()
let s3: Server, app: ReturnType<typeof createServer>, base: string, bare: ReturnType<typeof createServer>, bareBase: string

const listen = (s: { listen: (p: number, cb: () => void) => void; address: () => unknown }) =>
  new Promise<string>(ok => s.listen(0, () => ok(`http://127.0.0.1:${(s.address() as { port: number }).port}`)))

beforeAll(async () => {
  s3 = http((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => {
      const key = decodeURIComponent(new URL(req.url!, 'http://x').pathname.replace(/^\/bkt\/?/, ''))
      if (req.method === 'PUT') store.set(key, Buffer.concat(chunks))
      if (req.method === 'GET' && !key)
        return void res.end(
          `<ListBucketResult>${[...store].map(([k, v]) => `<Contents><Key>${k}</Key><LastModified>2026-01-01T00:00:00.000Z</LastModified><Size>${v.length}</Size></Contents>`).join('')}<IsTruncated>false</IsTruncated></ListBucketResult>`,
        )
      res.end(req.method === 'GET' ? store.get(key) : '')
    })
  })
  await new Promise<void>(ok => s3.listen(0, '127.0.0.1', ok))
  const cfg = join(dir, 's3.json')
  writeFileSync(
    cfg,
    JSON.stringify({
      endpoint: `http://127.0.0.1:${(s3.address() as { port: number }).port}`,
      region: 'r1',
      bucket: 'bkt',
      accessKeyId: 'AK',
      secretAccessKey: 'SK',
    }),
  )
  const python = [process.execPath, 'tests/fixtures/stub-worker.mjs']
  app = createServer({ staticDir: 'public', dataPath: join(dir, 'data'), python, cliArgs: ['--aws-config', cfg] })
  bare = createServer({ staticDir: 'public', dataPath: join(dir, 'bare'), python })
  base = await listen(app)
  bareBase = await listen(bare)
})
afterAll(() => {
  app.close()
  bare.close()
  s3.close()
})

test('without an S3 settings file the cloud backup says it is not set up', async () => {
  const r = await fetch(`${bareBase}/api/cloud-backup`, { method: 'POST' })
  expect(r.status).toBe(400)
  expect((await r.json()).error).toMatch(/isn’t set up/)
})

test('an empty bucket has nothing to restore, and a name that is not a backup is refused', async () => {
  const none = await fetch(`${base}/api/cloud-backup/restore`, { method: 'POST', body: '{}' })
  expect([none.status, (await none.json()).error]).toEqual([400, 'there are no cloud backups'])
  const bad = await fetch(`${base}/api/cloud-backup/restore`, { method: 'POST', body: JSON.stringify({ key: '../etc/passwd' }) })
  expect([bad.status, (await bad.json()).error]).toEqual([400, 'not a cloud backup name'])
})

test('a cloud backup goes up, is listed newest first, and the newest restores', async () => {
  const made = await (await fetch(`${base}/api/cloud-backup`, { method: 'POST' })).json()
  expect(made.key).toMatch(/^backups\/[\w.-]+\.zip$/)
  expect(made.bytes).toBeGreaterThan(0)
  expect(store.has(made.key)).toBe(true)
  const listed = await (await fetch(`${base}/api/cloud-backup`)).json()
  expect(listed.backups.map((b: { key: string }) => b.key)).toEqual([made.key])
  const back = await fetch(`${base}/api/cloud-backup/restore`, { method: 'POST', body: '{}' })
  expect([back.status, await back.json()]).toEqual([200, { ok: true }])
})

test('cloud backup needs the Config/Data/Library layout', async () => {
  const old = createServer({
    staticDir: 'public',
    charDir: join(dir, 'oc'),
    customDir: join(dir, 'ocu'),
    libraryDir: join(dir, 'ol'),
    python: [process.execPath, 'tests/fixtures/stub-worker.mjs'],
  })
  const at = await listen(old)
  try {
    for (const [path, init] of [
      ['cloud-backup', { method: 'POST' }],
      ['cloud-backup/restore', { method: 'POST', body: '{}' }],
    ] as const) {
      const r = await fetch(`${at}/api/${path}`, init)
      expect([r.status, (await r.json()).error]).toEqual([400, expect.stringContaining('Config/Data/Library layout')])
    }
  } finally {
    old.close()
  }
})
