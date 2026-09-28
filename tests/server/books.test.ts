// @vitest-environment node
// Books API with a stub worker (tests/fixtures/stub-worker.mjs) in place of `python -m importer`.
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, test } from 'vitest'
// @ts-expect-error plain JS module
import { createServer } from '../../server/server.mjs'

const dir = mkdtempSync(join(tmpdir(), 'ca2-books-'))
const custom = join(dir, 'custom'), library = join(dir, 'library')
let base = ''
let srv: { close: () => void; listen: (p: number, cb: () => void) => void; address: () => { port: number } }
beforeAll(() => new Promise<void>(ok => {
  srv = createServer({ staticDir: 'public', charDir: join(dir, 'chars'), customDir: custom, libraryDir: library,
    python: [process.execPath, 'tests/fixtures/stub-worker.mjs'] })
  srv.listen(0, () => { base = `http://127.0.0.1:${srv.address().port}`; ok() })
}))
afterAll(() => srv.close())

type Book = { id: string; file: string; state: string; message: string; source?: string; counts: Record<string, number>; busy: boolean }
const list = async (): Promise<Book[]> => (await fetch(`${base}/api/books`)).json()
async function waitFor(id: string, state: string): Promise<Book | undefined> {
  for (let i = 0; i < 200; i++) {
    const b = (await list()).find(x => x.id === id)
    if (state === 'gone' ? !b : b?.state === state && !b.busy) return b
    await new Promise(r => setTimeout(r, 25))
  }
  throw new Error(`${id} never reached ${state}: ${JSON.stringify((await list()).find(x => x.id === id))}`)
}
const pdf = (marker = '', size = 1024) => Buffer.concat([Buffer.from(`%PDF-1.4 ${marker}\n`), Buffer.alloc(size)])
async function upload(body: Buffer, name = 'book.pdf', type = 'application/pdf') {
  return fetch(`${base}/api/books`, { method: 'POST', body, headers: { 'Content-Type': type, 'X-Filename': name } })
}
function raw(method: string, path: string, headers: Record<string, string | number> = {}): Promise<number> {
  return new Promise((ok, fail) => {
    const req = request(`${base}${path}`, { method, headers }, res => { res.resume(); ok(res.statusCode ?? 0) })
    req.on('error', fail)
    req.end()
  })
}

let first = ''
test('a 10 MB upload streams to the library and queues an import', async () => {
  const r = await upload(pdf('', 10 * 1024 * 1024), '..\\..\\evil/My Book.pdf')
  expect(r.status).toBe(202)
  first = (await r.json()).id
  expect(first).toMatch(/^[a-z0-9-]+$/)
  expect(readFileSync(join(library, first, 'original.pdf')).length).toBe(10 * 1024 * 1024 + 10)
  const b = await waitFor(first, 'done')
  expect(b).toMatchObject({ source: 'STUB', counts: { 'amps.xml': 1 } })
  expect(existsSync(join(custom, 'imported', 'stub', 'amps.xml'))).toBe(true)
})

test('the upload name is kept without its path', async () => {
  const r = await upload(pdf('needs-ai'), '../../etc/Some Book.pdf')
  const { id } = await r.json()
  await waitFor(id, 'needs-ai')
  expect(readFileSync(join(library, id, 'upload.xml'), 'utf8')).toContain('file="Some Book.pdf"')
})

test('the report is served as XML', async () => {
  const r = await fetch(`${base}/api/books/${first}/report`)
  expect(r.status).toBe(200)
  expect(r.headers.get('content-type')).toContain('xml')
  expect(await r.text()).toContain('source="STUB"')
})

test('uploads that are not PDFs or are too big are refused', async () => {
  expect((await upload(pdf(), 'x.pdf', 'text/plain')).status).toBe(415)
  expect((await upload(Buffer.from('<html>not a pdf</html>'))).status).toBe(415)
  expect(await raw('POST', '/api/books', { 'Content-Type': 'application/pdf', 'Content-Length': 501 * 1024 * 1024 })).toBe(413)
})

test('the Library is not reachable by any URL', async () => {
  for (const p of [`/custom/../library/${first}/original.pdf`, `/library/${first}/original.pdf`, `/custom/..%2Flibrary/${first}/original.pdf`,
    `/custom/%2e%2e/library/${first}/original.pdf`, '/library/.config/ai-keys.xml'])
    expect((await fetch(`${base}${p}`)).status, p).toBe(404)
  expect(await raw('GET', `/custom/../library/${first}/original.pdf`)).toBe(404)
  for (const p of ['/api/books/..%2F..%2Fcustom/report', '/api/books/.config/report', '/api/review/..%2Fx'])
    expect((await fetch(`${base}${p}`)).status, p).toBe(400)
  expect((await fetch(`${base}/api/books/nope/report`)).status).toBe(404)
})

test('a failed worker is reported with its stderr, keys redacted', async () => {
  const { id } = await (await upload(pdf('crash'))).json()
  const b = await waitFor(id, 'failed')
  expect(b!.message).toContain('boom')
  expect(b!.message).not.toContain('SECRETSTUBKEY')
})

test('AI settings: keys are write-only', async () => {
  let x = await (await fetch(`${base}/api/ai-settings`)).text()
  expect(x).toContain('<key provider="anthropic" set="false"/>')
  const providers = '<?xml version="1.0"?>\n<ca2:aiproviders xmlns:ca2="urn:chummer-anarchy2:config:1" version="1" use="anthropic"><provider id="anthropic" enabled="true"/></ca2:aiproviders>'
  expect((await fetch(`${base}/api/ai-settings`, { method: 'PUT', body: providers })).status).toBe(204)
  expect((await fetch(`${base}/api/ai-settings`, { method: 'PUT', body: providers.replace('</ca2', '<key provider="anthropic">k</key></ca2') })).status).toBe(400)
  const keys = '<ca2:aikeys xmlns:ca2="urn:chummer-anarchy2:config:1" version="1"><key provider="anthropic">sk-ant-TOPSECRET999</key><key provider="bogus">x</key></ca2:aikeys>'
  expect((await fetch(`${base}/api/ai-keys`, { method: 'PUT', body: keys })).status).toBe(204)
  expect(readFileSync(join(library, '.config', 'ai-keys.xml'), 'utf8')).toContain('sk-ant-TOPSECRET999')
  expect(readFileSync(join(library, '.config', 'ai-providers.xml'), 'utf8')).not.toContain('TOPSECRET')
  x = await (await fetch(`${base}/api/ai-settings`)).text()
  expect(x).toContain('<provider id="anthropic" enabled="true"/>')
  expect(x).toContain('<key provider="anthropic" set="true"/>')
  expect(x).not.toContain('TOPSECRET')
  expect(x).not.toContain('bogus')
})

test('AI proposals: dry run, propose, review, apply', async () => {
  const { id } = await (await upload(pdf('needs-ai'))).json()
  await waitFor(id, 'needs-ai')
  expect(await (await fetch(`${base}/api/books/${first}/ai`, { method: 'POST' })).status).toBe(409) // a recipe import
  expect(await (await fetch(`${base}/api/books/${id}/ai?dryRun=1`, { method: 'POST' })).json()).toEqual({ parts: 4, provider: 'anthropic' })
  expect((await fetch(`${base}/api/books/${id}/ai`, { method: 'POST' })).status).toBe(202)
  await waitFor(id, 'review')
  const review = await (await fetch(`${base}/api/review/${id}`)).text()
  expect(review).toContain('<proposal id="amp.a"')
  const accepted = review.replace('state="pending"', 'state="accepted"')
  expect((await fetch(`${base}/api/review/${id}`, { method: 'PUT', body: accepted })).status).toBe(204)
  expect(readFileSync(join(library, id, 'review.xml'), 'utf8')).toContain('state="accepted"')
  expect((await fetch(`${base}/api/review/${id}`, { method: 'PUT', body: '<!DOCTYPE x [<!ENTITY a "b">]><review/>' })).status).toBe(400)
  expect((await fetch(`${base}/api/review/${id}?apply=1&source=../x&name=A&canon=false`, { method: 'PUT', body: accepted })).status).toBe(400)
  const r = await fetch(`${base}/api/review/${id}?apply=1&source=MYBOOK&name=My%20Book&canon=false`, { method: 'PUT', body: accepted })
  expect(r.status).toBe(202)
  expect(await waitFor(id, 'done')).toMatchObject({ source: 'MYBOOK' })
  expect(existsSync(join(custom, 'imported', 'mybook', 'amps.xml'))).toBe(true)
})

test('re-import clears and rebuilds; delete removes outputs, and with files=1 the book', async () => {
  expect((await fetch(`${base}/api/books/${first}/reimport`, { method: 'POST' })).status).toBe(202)
  await waitFor(first, 'done')
  expect((await fetch(`${base}/api/books/${first}`, { method: 'DELETE' })).status).toBe(202)
  await waitFor(first, 'removed')
  expect(existsSync(join(custom, 'imported', 'stub'))).toBe(false)
  expect(existsSync(join(library, first, 'original.pdf'))).toBe(true)
  expect((await fetch(`${base}/api/books/${first}?files=1`, { method: 'DELETE' })).status).toBe(202)
  await waitFor(first, 'gone')
  expect(existsSync(join(library, first))).toBe(false)
})
