// @vitest-environment node
// Books API with the real `python -m importer` (skipped when no Python with the importer's requirements is found),
// so the stub worker the other server tests and e2e use can't drift from the files the importer really writes.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
// @ts-expect-error plain JS module
import { createServer } from '../../server/server.mjs'
// @ts-expect-error plain JS module
import { findPython } from '../../tools/python.mjs'

const python: string[] | null = findPython()
const dir = mkdtempSync(join(tmpdir(), 'ca2-books-py-'))
const custom = join(dir, 'custom'), library = join(dir, 'library')
let base = ''
let srv: { close: () => void; listen: (p: number, cb: () => void) => void; address: () => { port: number } }

describe.skipIf(!python)('with the real importer', () => {
  beforeAll(() => new Promise<void>(ok => {
    srv = createServer({ staticDir: 'public', charDir: join(dir, 'chars'), customDir: custom, libraryDir: library, python })
    srv.listen(0, () => { base = `http://127.0.0.1:${srv.address().port}`; ok() })
  }))
  afterAll(() => srv?.close())

  const book = async (id: string) => ((await (await fetch(`${base}/api/books`)).json()) as { id: string; state: string; busy: boolean; file: string; source?: string }[]).find(b => b.id === id)
  async function settle(id: string) {
    for (let i = 0; i < 600; i++) {
      const b = await book(id)
      if (b && !b.busy && !['queued', 'converting', 'identifying'].includes(b.state)) return b
      await new Promise(r => setTimeout(r, 100))
    }
    throw new Error(`${id} never settled`)
  }

  test('a generated PDF is converted, identified and listed', async () => {
    const [cmd, ...pre] = python!
    const pdf = spawnSync(cmd, [...pre, '-c', 'import sys; from importer.tests.minipdf import two_page_pdf; sys.stdout.buffer.write(two_page_pdf())']).stdout
    const r = await fetch(`${base}/api/books`, { method: 'POST', body: pdf, headers: { 'Content-Type': 'application/pdf', 'X-Filename': 'Made Up.pdf' } })
    expect(r.status).toBe(202)
    const { id } = await r.json()
    const b = await settle(id)
    expect(b).toMatchObject({ state: 'needs-ai', file: 'Made Up.pdf' })
    expect(b.source).toBeUndefined()
    expect(readFileSync(join(library, id, 'book.md'), 'utf8')).toContain('Shadow Test')
    expect(await (await fetch(`${base}/api/books/${id}/report`)).text()).toContain('file="Made Up.pdf"')
    expect(await (await fetch(`${base}/api/books/${id}/ai?dryRun=1`, { method: 'POST' })).json()).toMatchObject({ provider: null })
    expect((await fetch(`${base}/api/books/${id}`, { method: 'DELETE' })).status).toBe(202)
    expect(await settle(id)).toMatchObject({ state: 'removed' })
  }, 90000)

  const settings = (rows: string) => `<ca2:aiproviders xmlns:ca2="urn:chummer-anarchy2:config:1" version="1" use="openai">${rows}</ca2:aiproviders>`
  const home = '<provider id="openai" enabled="true" baseUrl="https://api.openai.com/v1"/>'
  const keySet = async () => (await (await fetch(`${base}/api/ai-settings`)).text()).includes('<key provider="openai" set="true"/>')
  const saved = () => readFileSync(join(library, '.config', 'ai-providers.xml'), 'utf8')

  for (const [name, evil] of [
    ['a single-quoted address', `<provider id="openai" enabled="true" baseUrl='https://evil.example'/>`],
    ['the old address repeated in a comment', `<provider id="openai" enabled="true" baseUrl="https://evil.example"/><!-- ${home} -->`],
  ]) test(`a new address in ${name} never keeps the key`, async () => {
    expect((await fetch(`${base}/api/ai-settings`, { method: 'PUT', body: settings(home) })).status).toBe(200)
    expect((await fetch(`${base}/api/ai-keys`, { method: 'PUT', body: '<key provider="openai">sk-test-KEEPME1234</key>' })).status).toBe(204)
    expect(await keySet()).toBe(true)
    const r = await fetch(`${base}/api/ai-settings`, { method: 'PUT', body: settings(evil) })
    if (r.status === 200) {
      expect(await r.json()).toMatchObject({ cleared: ['openai'] })
      expect(await keySet()).toBe(false)
    } else {
      expect(r.status).toBe(400)
      expect(saved()).not.toContain('evil')
    }
  }, 30000)

  test('what the app never writes is refused with the reason', async () => {
    for (const body of [settings('<key provider="openai">k</key>'), settings(home + home), '<!DOCTYPE x [<!ENTITY a "b">]><x/>', '<aiproviders version="1"/>']) {
      const r = await fetch(`${base}/api/ai-settings`, { method: 'PUT', body })
      expect(r.status, body).toBe(400)
      expect((await r.json()).error).toBeTruthy()
    }
  }, 30000)
})
