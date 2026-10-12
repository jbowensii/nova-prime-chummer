// @vitest-environment node
// The Trash page's routes (server.mjs /api/trash): each account's own trash, the admin's ?user=, strict file names,
// restore (as a copy when the id is taken), deleting one for good, emptying.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, test } from 'vitest'
// @ts-expect-error plain JS module
import { createServer, restoredCopy } from '../../server/server.mjs'
// @ts-expect-error plain JS module
import { usersFile } from '../../server/auth.mjs'

const PW = { ada: 'ada-password-1', eve: 'eve-password-1', pat: 'pat-password-1', kim: 'kim-password-1' }
type Who = keyof typeof PW
const dir = mkdtempSync(join(tmpdir(), 'ca2-trash-')),
  chars = join(dir, 'chars')
const jar = {} as Record<Who, string>
let base = ''
let srv: { close: () => void; listen: (p: number, cb: () => void) => void; address: () => { port: number } }

beforeAll(async () => {
  mkdirSync(join(dir, 'library', '.config'), { recursive: true })
  writeFileSync(
    join(dir, 'library', '.config', 'users.xml'),
    await usersFile([
      { username: 'ada', password: PW.ada, name: 'Ada Admin' },
      { username: 'eve', password: PW.eve, role: 'editor' },
      { username: 'pat', password: PW.pat, role: 'player', name: 'Pat Player' },
      { username: 'kim', password: PW.kim, role: 'player' },
    ]),
  )
  srv = createServer({ staticDir: 'public', charDir: chars, customDir: join(dir, 'custom'), libraryDir: join(dir, 'library') })
  await new Promise<void>(ok => srv.listen(0, ok))
  base = `http://127.0.0.1:${srv.address().port}`
  for (const who of Object.keys(PW) as Who[]) {
    const r = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ username: who, password: PW[who] }),
      headers: { 'Content-Type': 'application/json', Origin: base },
    })
    jar[who] = r.headers
      .getSetCookie()
      .find(c => /session=/.test(c))!
      .split(';')[0]
  }
})
afterAll(() => srv.close())

const call = (who: Who, method: string, path: string, body?: string) => fetch(`${base}${path}`, { method, body, headers: { Origin: base, Cookie: jar[who] } })
const runner = (id: string, street: string) =>
  `<?xml version="1.0"?><ca2:character xmlns:ca2="urn:chummer-anarchy2:character:1" formatVersion="1" id="${id}" streetName="${street}" metatype="ork" level="runner" updatedAt="2026-09-27"><build/></ca2:character>`
const list = async (who: Who, q = '') => (await call(who, 'GET', `/api/trash${q}`)).json()
const files = (user: string) =>
  readdirSync(join(chars, user))
    .filter(f => f.endsWith('.xml'))
    .sort()

test('delete → trash → restore, back under its own id', async () => {
  const made = await call('pat', 'PUT', '/api/characters/p1', runner('p1', 'Ratchet &amp; Co'))
  expect(made.status).toBe(201)
  const { file } = await made.json()
  expect((await call('pat', 'DELETE', '/api/characters/p1')).status).toBe(204)
  const t = await list('pat')
  expect(t).toMatchObject({ user: 'pat', name: 'Pat Player', items: [{ id: 'p1', name: 'Ratchet & Co' }] })
  expect(t.items[0].file).toBe(`${file.slice(0, -4)}-${t.items[0].file.match(/-(\d{13})\.xml$/)![1]}.xml`)
  expect(Date.now() - Date.parse(t.items[0].deletedAt)).toBeLessThan(60000)
  const r = await call('pat', 'POST', `/api/trash/${t.items[0].file}/restore`)
  expect(await r.json()).toEqual({ file, id: 'p1', name: 'Ratchet & Co', copy: false })
  expect(files('pat')).toEqual([file])
  expect((await list('pat')).items).toEqual([])
})

test('restoring a runner whose id is taken makes a copy with a new id and a clear name', async () => {
  expect((await call('pat', 'DELETE', '/api/characters/p1')).status).toBe(204)
  expect((await call('pat', 'PUT', '/api/characters/p1', runner('p1', 'Ratchet &amp; Co'))).status).toBe(201) // the same id again
  const [item] = (await list('pat')).items
  const out = await (await call('pat', 'POST', `/api/trash/${item.file}/restore`)).json()
  expect(out).toMatchObject({ file: expect.stringMatching(/-2\.xml$/), name: 'Ratchet & Co (restored copy)', copy: true })
  expect(out.id).not.toBe('p1')
  const xml = readFileSync(join(chars, 'pat', out.file), 'utf8')
  expect(xml).toContain(`id="${out.id}"`)
  expect(xml).toContain('rev="1"')
  expect(readdirSync(join(chars, 'pat')).filter(f => f.endsWith('.tmp'))).toEqual([])
  // another account holding the id counts too
  expect((await call('kim', 'PUT', '/api/characters/k1', runner('k1', 'Kim'))).status).toBe(201)
  mkdirSync(join(chars, 'pat', '.trash'), { recursive: true })
  writeFileSync(join(chars, 'pat', '.trash', 'Stolen-1700000000000.xml'), runner('k1', 'Stolen'))
  expect(await (await call('pat', 'POST', '/api/trash/Stolen-1700000000000.xml/restore')).json()).toMatchObject({ name: 'Stolen (restored copy)', copy: true })
  expect(files('kim')).toEqual(['Kim.xml'])
})

test('restoredCopy keeps the XML well formed: one id, one street name, escaped', () => {
  const x = restoredCopy(
    '<ca2:character xmlns:ca2="urn:chummer-anarchy2:character:1" name="A &amp; B" streetName="" id="old" rev="7"><build/></ca2:character>',
    'new',
  )
  expect(x).toBe(
    '<ca2:character id="new" streetName="A &amp; B (restored copy)" xmlns:ca2="urn:chummer-anarchy2:character:1" name="A &amp; B" rev="1"><build/></ca2:character>',
  )
  expect(restoredCopy('<ca2:character xmlns:ca2="urn:chummer-anarchy2:character:1"/>', 'n')).toContain('id="n" streetName="Unnamed runner (restored copy)"')
})

test('deleting one for good, and emptying the trash', async () => {
  for (const id of ['e1', 'e2', 'e3']) {
    await call('pat', 'PUT', `/api/characters/${id}`, runner(id, `Temp ${id}`))
    expect((await call('pat', 'DELETE', `/api/characters/${id}`)).status).toBe(204)
  }
  const { items } = await list('pat')
  expect(items).toHaveLength(3)
  expect((await call('pat', 'DELETE', `/api/trash/${items[0].file}`)).status).toBe(204)
  expect((await call('pat', 'DELETE', `/api/trash/${items[0].file}`)).status).toBe(404)
  writeFileSync(join(chars, 'pat', '.trash', 'notes.txt'), 'not a runner') // only *.xml goes
  expect(await (await call('pat', 'DELETE', '/api/trash')).json()).toEqual({ deleted: 2 })
  expect(readdirSync(join(chars, 'pat', '.trash'))).toEqual(['notes.txt'])
  expect(await (await call('pat', 'DELETE', '/api/trash')).json()).toEqual({ deleted: 0 })
})

test('players and editors see only their own trash; the admin sees and empties anyone’s', async () => {
  await call('kim', 'DELETE', '/api/characters/k1')
  for (const who of ['pat', 'eve'] as const) {
    expect((await call(who, 'GET', '/api/trash?user=kim')).status).toBe(403)
    expect((await call(who, 'DELETE', '/api/trash?user=kim')).status).toBe(403)
    expect((await call(who, 'POST', `/api/trash/${(await list('kim')).items[0].file}/restore?user=kim`)).status).toBe(403)
  }
  expect((await list('eve')).items).toEqual([]) // no folder yet: an empty trash
  expect((await call('ada', 'GET', '/api/trash?user=nobody')).status).toBe(404)
  const t = await list('ada', '?user=kim')
  expect(t).toMatchObject({ user: 'kim', items: [{ id: 'k1', name: 'Kim' }] })
  expect(await (await call('ada', 'DELETE', '/api/trash?user=kim')).json()).toEqual({ deleted: 1 })
  expect((await list('kim')).items).toEqual([])
  expect((await fetch(`${base}/api/trash`)).status).toBe(401)
})

test('file names are checked strictly: no traversal, only *.xml in that account’s .trash', async () => {
  writeFileSync(join(chars, 'kim', 'Kim-secret.xml'), runner('ks', 'Secret'))
  mkdirSync(join(chars, 'pat', '.trash'), { recursive: true })
  writeFileSync(join(chars, 'pat', '.trash', '.hidden.xml'), runner('h1', 'Hidden'))
  for (const f of [
    '..%2F..%2Fkim%2FKim-secret.xml',
    '..%5C..%5Ckim%5CKim-secret.xml',
    '..',
    '.hidden.xml',
    'a..xml',
    'notes.txt',
    'Kim-secret',
    '%2E%2E',
    'a%00.xml',
    'x'.repeat(200) + '.xml',
    '%E0%A4%A.xml',
  ])
    for (const [method, path] of [
      ['POST', `/api/trash/${f}/restore`],
      ['DELETE', `/api/trash/${f}`],
    ])
      expect((await call('pat', method, path)).status, `${method} ${f}`).toBeGreaterThanOrEqual(400)
  expect((await call('pat', 'POST', '/api/trash/..%2F..%2Fkim%2FKim-secret.xml/restore')).status).toBe(400)
  expect((await call('pat', 'DELETE', '/api/trash/..%2F..%2Fkim%2FKim-secret.xml')).status).toBe(400)
  expect((await call('pat', 'GET', '/api/trash/x.xml')).status).toBe(405)
  expect(existsSync(join(chars, 'kim', 'Kim-secret.xml'))).toBe(true)
  expect(existsSync(join(chars, 'pat', '.trash', '.hidden.xml'))).toBe(true) // listed never, touched never
  expect((await list('pat')).items.map((i: { file: string }) => i.file)).not.toContain('.hidden.xml')
  // a file that isn't a runner stays put
  writeFileSync(join(chars, 'pat', '.trash', 'odd.xml'), '<html/>')
  expect((await call('pat', 'POST', '/api/trash/odd.xml/restore')).status).toBe(400)
  expect(existsSync(join(chars, 'pat', '.trash', 'odd.xml'))).toBe(true)
})

test('only regular files count: folders named *.xml and links are never listed, restored or deleted', async () => {
  const trash = join(chars, 'pat', '.trash')
  mkdirSync(join(trash, 'folder.xml'), { recursive: true })
  let linked = true
  try {
    symlinkSync(join(chars, 'kim', 'Kim-secret.xml'), join(trash, 'link.xml'))
  } catch {
    linked = false
  } // Windows without the privilege
  const shown = (await list('pat')).items.map((i: { file: string }) => i.file)
  expect(shown).not.toContain('folder.xml')
  expect(shown).not.toContain('link.xml')
  for (const f of ['folder.xml', ...(linked ? ['link.xml'] : [])]) {
    expect((await call('pat', 'POST', `/api/trash/${f}/restore`)).status).toBe(404)
    expect((await call('pat', 'DELETE', `/api/trash/${f}`)).status).toBe(404)
  }
  await call('pat', 'DELETE', '/api/trash')
  expect(existsSync(join(trash, 'folder.xml'))).toBe(true)
  expect(existsSync(join(chars, 'kim', 'Kim-secret.xml'))).toBe(true)
})

test('emptying with a list deletes only those; the count is what went', async () => {
  const trash = join(chars, 'pat', '.trash')
  for (const f of ['A-1700000000001.xml', 'B-1700000000002.xml', 'C-1700000000003.xml']) writeFileSync(join(trash, f), runner(f[0], f[0]))
  const del = (body: string) =>
    fetch(`${base}/api/trash`, { method: 'DELETE', body, headers: { Origin: base, Cookie: jar.pat, 'Content-Type': 'application/json' } })
  expect(await (await del(JSON.stringify({ files: ['A-1700000000001.xml', 'B-1700000000002.xml', 'gone.xml', '../x.xml'] }))).json()).toEqual({ deleted: 2 })
  expect(readdirSync(trash)).toContain('C-1700000000003.xml')
  for (const bad of ['nope', '{"files":"x"}', '{"files":[1]}']) expect((await del(bad)).status).toBe(400)
  expect(existsSync(join(trash, 'C-1700000000003.xml'))).toBe(true)
})

test('a trash file named only by its time restores as runner.xml', async () => {
  writeFileSync(join(chars, 'pat', '.trash', '-1700000000000.xml'), runner('t1', 'Timeless'))
  expect(await (await call('pat', 'POST', '/api/trash/-1700000000000.xml/restore')).json()).toMatchObject({ file: 'runner.xml', copy: false })
  expect(existsSync(join(chars, 'pat', 'runner.xml'))).toBe(true)
})
