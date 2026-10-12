// @vitest-environment node
// Edits API with the stub worker (tests/fixtures/stub-worker.mjs); books-python.test.ts runs the real importer.
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { createServer } from './_signin'

vi.setConfig({ testTimeout: 30000 })

const dir = mkdtempSync(join(tmpdir(), 'ca2-edits-'))
const custom = join(dir, 'custom')
let base = ''
let srv: { close: () => void; listen: (p: number, cb: () => void) => void; address: () => { port: number } }
beforeAll(
  () =>
    new Promise<void>(ok => {
      srv = createServer({
        staticDir: 'public',
        charDir: join(dir, 'chars'),
        customDir: custom,
        libraryDir: join(dir, 'library'),
        python: [process.execPath, 'tests/fixtures/stub-worker.mjs'],
      })
      srv.listen(0, () => {
        base = `http://127.0.0.1:${srv.address().port}`
        ok()
      })
    }),
)
afterAll(() => srv.close())

const item = (id: string, name: string, desc = '') =>
  `<edit><item id="${id}" kind="gear" source="CRB" page="1"><name>${name}</name><text></text></item><description>${desc}</description></edit>`
const put = (kind: string, id: string, body: string) => fetch(`${base}/api/edits/${kind}/${encodeURIComponent(id)}`, { method: 'PUT', body })
const read = (f: string) => readFileSync(join(custom, 'edits', f), 'utf8')

test('an edit is saved, listed and removed', async () => {
  expect((await put('items', 'short-weapon', item('short-weapon', 'Shiv', 'A sharp thing.'))).status).toBe(204)
  expect(read('edits.xml')).toContain('<name>Shiv</name>')
  expect(read('texts.xml')).toContain('<text of="items" id="short-weapon">A sharp thing.</text>')
  expect(await (await fetch(`${base}/api/edits`)).json()).toEqual([{ kind: 'items', id: 'short-weapon' }])
  const r = await fetch(`${base}/api/edits/items/short-weapon`, { method: 'DELETE' })
  expect(await r.json()).toEqual({ removed: true })
  expect(read('edits.xml')).not.toContain('Shiv')
  expect(read('texts.xml')).not.toContain('A sharp thing')
  expect(await (await fetch(`${base}/api/edits/items/short-weapon`, { method: 'DELETE' })).json()).toEqual({ removed: false })
})

test('a refused edit is a 400 with the importer’s reason', async () => {
  const r = await put('items', 'short-weapon', item('short-weapon', ''))
  expect([r.status, await r.json()]).toEqual([400, { error: 'no id or name' }])
})

test('kind, id and body are checked before the importer runs', async () => {
  for (const [kind, id, body] of [
    ['spells', 'x', item('x', 'X')],
    ['items', 'Bad Id', item('Bad Id', 'X')],
    ['items', '.hidden', item('.hidden', 'X')],
    ['items', 'x', '<!DOCTYPE x [<!ENTITY a "b">]><edit/>'],
    ['items', 'x', '<item id="x"/>'],
  ])
    expect((await put(kind, id, body)).status, `${kind} ${id} ${body}`).toBe(400)
  expect((await put('items', 'x', item('x', 'X', 'y'.repeat(1100 * 1024)))).status).toBe(413)
  expect((await fetch(`${base}/api/edits/items/x`, { method: 'POST' })).status).toBe(405)
})

test('edits run one at a time: parallel saves all land', async () => {
  const ids = ['a1', 'a2', 'a3', 'a4', 'a5']
  const rs = await Promise.all(ids.map(id => put('items', `table.${id}`, item(`table.${id}`, id.toUpperCase()))))
  expect(rs.map(r => r.status)).toEqual(ids.map(() => 204))
  for (const id of ids) expect(read('edits.xml')).toContain(`<name>${id.toUpperCase()}</name>`)
})

test('house-rule sources: checked, created, duplicates refused', async () => {
  const post = (b: unknown, type = 'application/json') =>
    fetch(`${base}/api/edits/sources`, { method: 'POST', body: JSON.stringify(b), headers: { 'Content-Type': type } })
  expect((await post({ id: 'TABLE', name: 'x' }, 'text/plain')).status).toBe(415)
  expect((await post({ id: 'table', name: 'x' })).status).toBe(400)
  expect((await post({ id: 'TABLE' })).status).toBe(400)
  expect((await fetch(`${base}/api/edits/sources`, { method: 'POST', body: 'nope', headers: { 'Content-Type': 'application/json' } })).status).toBe(400)
  expect((await post({ id: 'TABLE', name: '-Our table' })).status).toBe(204)
  expect(read('sources.xml')).toContain('<source id="TABLE" publisher="" canon="false"><name>-Our table</name></source>')
  const r = await post({ id: 'TABLE', name: 'Again' })
  expect([r.status, (await r.json()).error]).toEqual([400, 'the source id TABLE is already used; pick another'])
})
