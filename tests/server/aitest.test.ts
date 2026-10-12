// @vitest-environment node
// The AI settings' Test button (POST /api/ai-test?provider=) with the stub worker; importer/tests/test_ai.py tests the
// real providers against fake HTTP servers.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { createServer } from './_signin'

vi.setConfig({ testTimeout: 30000 })
const dir = mkdtempSync(join(tmpdir(), 'ca2-aitest-')),
  log = join(dir, 'stub.log')
let base = ''
let srv: { close: () => void; stopJobs: () => void; listen: (p: number, cb: () => void) => void; address: () => { port: number } }
beforeAll(
  () =>
    new Promise<void>(ok => {
      vi.stubEnv('STUB_LOG', log)
      writeFileSync(log, '')
      srv = createServer({
        staticDir: 'public',
        charDir: join(dir, 'chars'),
        customDir: join(dir, 'custom'),
        libraryDir: join(dir, 'library'),
        python: [process.execPath, 'tests/fixtures/stub-worker.mjs'],
      })
      srv.listen(0, () => {
        base = `http://127.0.0.1:${srv.address().port}`
        ok()
      })
    }),
)
afterAll(() => {
  srv.stopJobs()
  srv.close()
})

const test_ = (p: string) => fetch(`${base}/api/ai-test?provider=${p}`, { method: 'POST' })
const key = (p: string, k: string) => fetch(`${base}/api/ai-keys`, { method: 'PUT', body: `<key provider="${p}">${k}</key>` })

test('a test asks the saved provider and answers with its model, a short text reply and the time', async () => {
  expect(
    (
      await fetch(`${base}/api/ai-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/xml' },
        body:
          '<ca2:aiproviders xmlns:ca2="urn:chummer-anarchy2:config:1" version="1"><provider id="openai" enabled="true" baseUrl="http://127.0.0.1:1/v1" model="made-up-1"/>' +
          '<provider id="anythingllm" enabled="true" baseUrl="http://127.0.0.1:1" workspace="shadowrun"/></ca2:aiproviders>',
      })
    ).status,
  ).toBe(200)
  expect((await key('openai', 'sk-test-GOODKEY1234')).status).toBe(204)
  const r = await test_('openai')
  const body = await r.json()
  expect(r.status).toBe(200)
  expect(body).toEqual({ ok: true, model: 'made-up-1', reply: `OK ${'!'.repeat(197)}`, ms: 1234 }) // control characters out, 200 at most
  expect(JSON.stringify(body)).not.toContain('GOODKEY')
  expect(await (await test_('anythingllm')).json()).toMatchObject({ ok: true, model: 'workspace shadowrun' })
  expect(readFileSync(log, 'utf8')).toContain(`test-ai openai ${join(dir, 'custom')}`) // the provider id is all the request gives
})

test('failures come back plainly and never with the key', async () => {
  for (const p of ['', 'evil', '..%2F..']) expect((await test_(p)).status, p).toBe(400)
  let r = await test_('gemini')
  expect([r.status, await r.json()]).toEqual([502, { error: 'save this provider’s settings first' }])
  expect((await key('openai', 'sk-bad-LEAKME4242')).status).toBe(204)
  r = await test_('openai')
  const text = await r.text()
  expect(r.status).toBe(502)
  expect(text).toContain('the provider didn’t accept the API key (HTTP 401) [key]')
  expect(text).not.toContain('LEAKME')
})

test('one test at a time, and at most 10 a minute', async () => {
  expect((await key('openai', 'sk-slow-KEY12345')).status).toBe(204)
  const first = test_('openai')
  await new Promise(r => setTimeout(r, 300))
  const busy = await test_('anythingllm')
  expect([busy.status, (await busy.json()).error]).toEqual([429, 'a connection test is already running; wait for it'])
  expect((await first).status).toBe(200)
  // 5 tests so far this minute (the refusals above don't count; the 400s never got that far)
  const codes = []
  for (let i = 0; i < 6; i++) codes.push((await test_('anythingllm')).status)
  expect(codes).toEqual([200, 200, 200, 200, 200, 429])
  const r = await test_('anythingllm')
  expect(Number(r.headers.get('Retry-After'))).toBeGreaterThan(0)
})
