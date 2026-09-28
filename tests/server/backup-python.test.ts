// @vitest-environment node
// Backup and restore with the real `python -m importer` (skipped when no Python with the importer's requirements is
// found): a full backup → change → restore round trip on temp folders.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
// @ts-expect-error plain JS module
import { createServer } from '../../server/server.mjs'
// @ts-expect-error plain JS module
import { findPython } from '../../tools/python.mjs'

const python: string[] | null = findPython()
const dir = mkdtempSync(join(tmpdir(), 'ca2-backup-py-'))
const chars = join(dir, 'chars'), custom = join(dir, 'custom'), library = join(dir, 'library')
let base = ''
let srv: { close: () => void; listen: (p: number, cb: () => void) => void; address: () => { port: number } }

const runner = (street: string) =>
  `<?xml version="1.0"?><ca2:character xmlns:ca2="urn:chummer-anarchy2:character:1" formatVersion="1" id="r1" streetName="${street}" metatype="ork" level="runner" updatedAt="2026-09-27"><build/></ca2:character>`
const putRunner = (street: string) => fetch(`${base}/api/characters/r1?force=1`, { method: 'PUT', body: runner(street) })
const runners = () => readdirSync(chars).filter(f => f.endsWith('.xml')).map(f => readFileSync(join(chars, f), 'utf8')).join()

describe.skipIf(!python)('with the real importer', () => {
  beforeAll(() => new Promise<void>(ok => {
    mkdirSync(join(custom, 'edits'), { recursive: true })
    writeFileSync(join(custom, 'edits', 'note.xml'), '<note>house rule</note>')
    srv = createServer({ staticDir: 'public', charDir: chars, customDir: custom, libraryDir: library, python })
    srv.listen(0, () => { base = `http://127.0.0.1:${srv.address().port}`; ok() })
  }))
  afterAll(() => srv?.close())

  test('backup, change, restore: everything comes back and a safety backup is kept', async () => {
    await putRunner('Before') // then a book mid-job, as a backup taken during an import has
    mkdirSync(join(library, 'abc-1'), { recursive: true })
    writeFileSync(join(library, 'abc-1', 'status.xml'), '<status state="extracting" updated="2026-09-28T00:00:00Z"></status>')
    const { token: dl } = await (await fetch(`${base}/api/backup`, { method: 'POST' })).json()
    const zip = Buffer.from(await (await fetch(`${base}/api/backup/${dl}`)).arrayBuffer())
    expect(zip.subarray(0, 4).toString('latin1')).toBe('PK\x03\x04')

    await putRunner('After')
    writeFileSync(join(custom, 'edits', 'note.xml'), '<note>changed</note>')
    writeFileSync(join(custom, 'extra.xml'), '<extra/>')

    const p = await fetch(`${base}/api/restore?preview=1`, { method: 'POST', body: zip })
    expect(p.status).toBe(200)
    const { token, manifest } = await p.json()
    expect(manifest).toMatchObject({ app: JSON.parse(readFileSync('package.json', 'utf8')).version, keys: false,
      folders: { characters: { files: 1 }, custom: { files: 1 }, library: { files: 1 } } })
    expect(Date.parse(manifest.created)).toBeGreaterThan(Date.now() - 600000)

    const r = await fetch(`${base}/api/restore/${token}`, { method: 'POST' })
    expect([r.status, await r.json()]).toEqual([200, { ok: true }])
    expect(runners()).toContain('streetName="Before"')
    expect(readFileSync(join(custom, 'edits', 'note.xml'), 'utf8')).toBe('<note>house rule</note>')
    expect(existsSync(join(custom, 'extra.xml'))).toBe(false)
    // the restored book was mid-job when backed up: the sweep after the restore marks it interrupted
    expect(readFileSync(join(library, 'abc-1', 'status.xml'), 'utf8')).toContain('state="failed"')
    expect(readdirSync(join(library, '.backups'))).toEqual([expect.stringMatching(/^\d{8}T\d{6}_\d{6}Z\.zip$/)])
  }, 120000)

  test('a zip that isn’t a backup is refused with the check’s reason', async () => {
    const [cmd, ...pre] = python!
    const { spawnSync } = await import('node:child_process')
    const out = join(dir, 'other.zip')
    spawnSync(cmd, [...pre, '-c', `import zipfile; zipfile.ZipFile(r"${out}", "w").writestr("hello.txt", "hi")`])
    const r = await fetch(`${base}/api/restore?preview=1`, { method: 'POST', body: readFileSync(out) })
    expect(r.status).toBe(400)
    expect((await r.json()).error).toMatch(/outside characters\/, custom\/ and library\//)
  }, 60000)
})
