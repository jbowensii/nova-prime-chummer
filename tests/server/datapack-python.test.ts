// @vitest-environment node
// Data packs with the real `python -m importer` (skipped when no Python with the importer's requirements is found):
// download the made-up core files as a pack, lose them, upload the pack, get them back.
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
// @ts-expect-error plain JS module
import { createServer } from '../../server/server.mjs'
// @ts-expect-error plain JS module
import { findPython } from '../../tools/python.mjs'

const python: string[] | null = findPython()
const FIXTURE = 'tests/fixtures/mini/custom/imported/core'
const dir = mkdtempSync(join(tmpdir(), 'ca2-pack-py-'))
const custom = join(dir, 'custom'), core = join(custom, 'imported', 'core')
let base = ''
let srv: { close: () => void; listen: (p: number, cb: () => void) => void; address: () => { port: number } }
const files = (d: string) => Object.fromEntries(readdirSync(d).sort().map(f => [f, readFileSync(join(d, f), 'utf8')]))

describe.skipIf(!python)('with the real importer', () => {
  beforeAll(() => new Promise<void>(ok => {
    cpSync(FIXTURE, core, { recursive: true })
    srv = createServer({ staticDir: 'public', charDir: join(dir, 'chars'), customDir: custom, libraryDir: join(dir, 'library'), python })
    srv.listen(0, () => { base = `http://127.0.0.1:${srv.address().port}`; ok() })
  }))
  afterAll(() => srv?.close())

  test('download a pack, lose the core files, upload it: they are back as they were', async () => {
    const { token } = await (await fetch(`${base}/api/datapack`, { method: 'POST' })).json()
    const zip = Buffer.from(await (await fetch(`${base}/api/datapack/${token}`)).arrayBuffer())
    expect(zip.subarray(0, 4).toString('latin1')).toBe('PK\x03\x04')
    rmSync(core, { recursive: true })
    const r = await fetch(`${base}/api/datapack/import`, { method: 'POST', body: zip })
    expect([r.status, (await r.json()).files]).toEqual([200, readdirSync(FIXTURE).sort()])
    expect(files(core)).toEqual(files(FIXTURE))
    await vi.waitFor(() => expect(readdirSync(join(dir, 'library', '.backups'))).toEqual([])) // the upload's temp zip is gone
  }, 60000)

  test('a pack with a name it can’t hold is refused with the check’s reason, and nothing changes', async () => {
    const { token } = await (await fetch(`${base}/api/datapack`, { method: 'POST' })).json()
    const zip = Buffer.from(await (await fetch(`${base}/api/datapack/${token}`)).arrayBuffer())
    // change a stored name (the central directory's copy) so the zip still reads but holds a file a pack can't
    const i = zip.lastIndexOf(Buffer.from('core/skills.xml'))
    zip.write('core/skilLs.xml', i, 'latin1')
    const r = await fetch(`${base}/api/datapack/import`, { method: 'POST', body: zip })
    expect(r.status).toBe(400)
    expect((await r.json()).error).toMatch(/can’t hold: core\/skilLs\.xml|isn’t a readable zip/)
    expect(files(core)).toEqual(files(FIXTURE))
    await vi.waitFor(() => expect(readdirSync(join(dir, 'library', '.backups'))).toEqual([]))
  }, 60000)
})
