// @vitest-environment node
// Background art (server/backgrounds.mjs): only the admin uploads, toggles and deletes; anyone signed in lists the enabled
// ones and reads them; nothing without a session; uploads checked by their bytes (SVG or HTML named .png: refused), 10 MB
// and 50 images at most; ids can't reach outside the folder; backgrounds.xml schema-valid; never a book on the Books page.
// Shadowrun 6's gallery starts with the circuit board, once: deleted or hidden, it never comes back; Anarchy's has no default.
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { validateXML } from 'xmllint-wasm'
// @ts-expect-error plain JS module
import { createServer } from '../../server/server.mjs'
// @ts-expect-error plain JS module
import { usersFile } from '../../server/auth.mjs'
// @ts-expect-error plain JS module
import { backgroundsApi, sniff } from '../../server/backgrounds.mjs'
import { makePng } from '../png'

vi.setConfig({ testTimeout: 30000 })
const PW = { ada: 'ada-password-1', eve: 'eve-password-1', pat: 'pat-password-1' }
type Who = keyof typeof PW | 'nobody'
const dir = mkdtempSync(join(tmpdir(), 'ca2-backgrounds-')),
  lib = join(dir, 'library'),
  bgDir = join(lib, 'backgrounds')
const jar: Record<string, string> = { nobody: '' }
let base = ''
let srv: { close: () => void; listen: (p: number, cb: () => void) => void; address: () => { port: number } }
const PNG = makePng(4, 4, x => [x * 60, 20, 90])

beforeAll(async () => {
  mkdirSync(join(lib, '.config'), { recursive: true })
  writeFileSync(
    join(lib, '.config', 'users.xml'),
    await usersFile([
      { username: 'ada', password: PW.ada },
      { username: 'eve', password: PW.eve, role: 'editor' },
      { username: 'pat', password: PW.pat, role: 'player' },
    ]),
  )
  srv = createServer({ staticDir: 'public', charDir: join(dir, 'chars'), customDir: join(dir, 'custom'), libraryDir: lib })
  await new Promise<void>(ok => srv.listen(0, ok))
  base = `http://127.0.0.1:${srv.address().port}`
  for (const who of Object.keys(PW) as (keyof typeof PW)[]) {
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

const call = (who: Who, method: string, path: string, body?: unknown, type = 'application/json', name?: string) =>
  fetch(`${base}${path}`, {
    method,
    body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body),
    headers: { Origin: base, Cookie: jar[who], ...(body !== undefined ? { 'Content-Type': type } : {}), ...(name ? { 'X-Filename': name } : {}) },
  })
const upload = (data: Buffer, type = 'image/png', who: Who = 'ada', name = 'art.png') => call(who, 'POST', '/api/backgrounds', data, type, name)

test('sniff knows PNG, JPEG and WebP by their bytes, and nothing else', () => {
  expect(sniff(PNG)).toBe('png')
  expect(sniff(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe('jpg')
  expect(sniff(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1'))).toBe('webp')
  for (const s of ['<svg xmlns="http://www.w3.org/2000/svg"/>', '<!doctype html><script>alert(1)</script>', 'GIF89a', 'RIFF\0\0\0\0WAVE'])
    expect(sniff(Buffer.from(s, 'latin1'))).toBeNull()
})

test('the admin uploads; editors and players can’t; nobody signed out reaches anything', async () => {
  for (const who of ['eve', 'pat'] as const) expect((await upload(PNG, 'image/png', who)).status).toBe(403)
  expect((await upload(PNG, 'image/png', 'nobody')).status).toBe(401)
  const r = await upload(PNG, 'image/png', 'ada', 'My%20Art.png')
  expect(r.status).toBe(201)
  const b = await r.json()
  expect(b).toMatchObject({ name: 'My Art.png', enabled: true, size: PNG.length })
  expect(readdirSync(bgDir).sort()).toEqual([`${b.id}.png`, 'backgrounds.xml'].sort())
  expect((await call('nobody', 'GET', '/api/backgrounds')).status).toBe(401)
  expect((await call('nobody', 'GET', `/api/backgrounds/${b.id}`)).status).toBe(401)
  // the Library is never served as files
  for (const p of [`/library/backgrounds/${b.id}.png`, '/backgrounds/backgrounds.xml']) expect(await (await call('ada', 'GET', p)).text()).not.toContain('PNG')
  for (const who of ['pat', 'eve', 'ada'] as const) {
    const img = await call(who, 'GET', `/api/backgrounds/${b.id}`)
    expect(img.status).toBe(200)
    expect(img.headers.get('content-type')).toBe('image/png')
    expect(img.headers.get('x-content-type-options')).toBe('nosniff')
    expect(img.headers.get('cache-control')).toMatch(/^private/)
    expect(Buffer.from(await img.arrayBuffer()).equals(PNG)).toBe(true)
  }
  expect(await (await call('pat', 'GET', '/api/backgrounds')).json()).toEqual({ enabled: [b.id] }) // no names for players
  expect((await (await call('ada', 'GET', '/api/backgrounds')).json()).items).toHaveLength(1)
  // never a book
  expect(await (await call('ada', 'GET', '/api/books')).json()).toEqual([])
  expect((await call('ada', 'DELETE', '/api/books/backgrounds?files=1')).status).toBe(400)
})

test('uploads are checked by their bytes, size and count', async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'),
    html = Buffer.from('<html><script>alert(1)</script></html>')
  expect((await upload(svg, 'image/svg+xml', 'ada', 'x.svg')).status).toBe(415)
  expect((await upload(svg, 'image/png', 'ada', 'x.png')).status).toBe(415) // SVG named as a PNG
  expect((await upload(html, 'image/png', 'ada', 'x.png')).status).toBe(415)
  expect((await upload(html, 'text/html')).status).toBe(415)
  const big = await upload(Buffer.concat([PNG, Buffer.alloc(10 * 1024 * 1024)])).catch(() => null)
  if (big) expect(big.status).toBe(413) // the server may close the connection before fetch reads the answer
  expect(readdirSync(bgDir)).toHaveLength(2) // nothing refused was kept
  const before = (await (await call('ada', 'GET', '/api/backgrounds')).json()).items.length
  for (let i = before; i < 50; i++) expect((await upload(PNG)).status).toBe(201)
  expect((await upload(PNG)).status).toBe(409)
  const { items } = await (await call('ada', 'GET', '/api/backgrounds')).json()
  for (const it of items.slice(1)) expect((await call('ada', 'DELETE', `/api/backgrounds/${it.id}`)).status).toBe(204)
  expect(readdirSync(bgDir)).toHaveLength(2)
})

test('ids can’t leave the folder', async () => {
  for (const id of ['..%2F.config%2Fusers.xml', '..%5C..%5Cusers', '%2e%2e', 'backgrounds.xml', 'ABCDEF123456', '0123456789ab.png'])
    expect([400, 404]).toContain((await call('ada', 'GET', `/api/backgrounds/${id}`)).status)
  expect((await call('ada', 'GET', '/api/backgrounds/0123456789ab')).status).toBe(404)
})

test('enable, disable and delete: the admin only; a disabled image is the admin’s alone', async () => {
  const [{ id }] = (await (await call('ada', 'GET', '/api/backgrounds')).json()).items
  for (const who of ['eve', 'pat'] as const) {
    expect((await call(who, 'PUT', `/api/backgrounds/${id}`, { enabled: false })).status).toBe(403)
    expect((await call(who, 'DELETE', `/api/backgrounds/${id}`)).status).toBe(403)
  }
  expect((await call('ada', 'PUT', `/api/backgrounds/${id}`, { enabled: 'no' })).status).toBe(400)
  expect(await (await call('ada', 'PUT', `/api/backgrounds/${id}`, { enabled: false })).json()).toMatchObject({ id, enabled: false })
  expect(await (await call('pat', 'GET', '/api/backgrounds')).json()).toEqual({ enabled: [] })
  expect((await call('pat', 'GET', `/api/backgrounds/${id}`)).status).toBe(404)
  expect((await call('ada', 'GET', `/api/backgrounds/${id}`)).status).toBe(200) // the gallery's thumbnail
  const xml = readFileSync(join(bgDir, 'backgrounds.xml'), 'utf8')
  const v = await validateXML({
    xml: { fileName: 'backgrounds.xml', contents: xml },
    schema: { fileName: 'backgrounds.xsd', contents: readFileSync('public/data/schema/backgrounds.xsd', 'utf8') },
  })
  expect(v.errors).toEqual([])
  expect((await call('ada', 'DELETE', `/api/backgrounds/${id}`)).status).toBe(204)
  expect((await call('ada', 'DELETE', `/api/backgrounds/${id}`)).status).toBe(404)
  expect(readdirSync(bgDir)).toEqual(['backgrounds.xml'])
})

const SEED = { file: 'server/defaults/sr6-circuit.webp', name: 'Circuit board (default)' }
const validate = async (xml: string) =>
  (
    await validateXML({
      xml: { fileName: 'backgrounds.xml', contents: xml },
      schema: { fileName: 'backgrounds.xsd', contents: readFileSync('public/data/schema/backgrounds.xsd', 'utf8') },
    })
  ).errors

test('the default circuit board: a WebP under 500 KB', () => {
  const data = readFileSync(SEED.file)
  expect(sniff(data)).toBe('webp')
  expect(data.length).toBeLessThan(500 * 1024)
})

test('a gallery with a default gets it once, after what’s there; never again once deleted or hidden, even after a restart', async () => {
  type Item = { id: string; name: string; enabled: boolean }
  const items = async (libraryDir: string, seed?: typeof SEED) => {
    let out: { items: Item[] } = { items: [] }
    await backgroundsApi({ libraryDir, auth: {}, seed }).handle(
      { method: 'GET', headers: {} },
      {},
      new URL('http://x/api/backgrounds'),
      (_r: unknown, _c: number, body: typeof out) => {
        out = body
      },
      { role: 'admin' },
    )
    return out.items
  }
  // a new server: the default alone, on
  const fresh = mkdtempSync(join(tmpdir(), 'ca2-seed-'))
  const [d] = await items(fresh, SEED)
  expect(d).toMatchObject({ name: 'Circuit board (default)', enabled: true })
  expect(readFileSync(join(fresh, 'backgrounds', `${d.id}.webp`)).equals(readFileSync(SEED.file))).toBe(true)
  const xml = readFileSync(join(fresh, 'backgrounds', 'backgrounds.xml'), 'utf8')
  expect(xml).toMatch(/<ca2:backgrounds [^>]*seeded="true"/)
  expect(await validate(xml)).toEqual([])
  expect(await items(fresh, SEED)).toEqual([d]) // the same server, a restart: still one
  // hidden: stays hidden; deleted: stays gone
  const xmlHidden = xml.replace('enabled="true"', 'enabled="false"')
  writeFileSync(join(fresh, 'backgrounds', 'backgrounds.xml'), xmlHidden)
  expect(await items(fresh, SEED)).toEqual([{ ...d, enabled: false }])
  writeFileSync(join(fresh, 'backgrounds', 'backgrounds.xml'), xml.replace(/ *<background [^>]*\/>\n/, ''))
  expect(await items(fresh, SEED)).toEqual([])
  // a server with art already (never seeded): the default joins at the end, on
  const old = mkdtempSync(join(tmpdir(), 'ca2-seed-')),
    oldDir = join(old, 'backgrounds')
  mkdirSync(oldDir)
  writeFileSync(join(oldDir, 'a1b2c3d4e5f6.png'), PNG)
  writeFileSync(
    join(oldDir, 'backgrounds.xml'),
    '<?xml version="1.0" encoding="UTF-8"?>\n<ca2:backgrounds xmlns:ca2="urn:chummer-anarchy2:config:1" version="1">\n' +
      `  <background id="a1b2c3d4e5f6" type="png" name="Neon alley.png" enabled="false" uploaded="2026-01-02T03:04:05Z" size="${PNG.length}"/>\n</ca2:backgrounds>\n`,
  )
  expect((await items(old, SEED)).map(b => [b.name, b.enabled])).toEqual([
    ['Neon alley.png', false],
    ['Circuit board (default)', true],
  ])
  // no default (Anarchy): nothing added, nothing written
  const none = mkdtempSync(join(tmpdir(), 'ca2-seed-'))
  expect(await items(none)).toEqual([])
  expect(readdirSync(none)).toEqual([])
})

test('Shadowrun 6 has its own art set: /api/sr6/backgrounds in library/sr6/backgrounds, apart from Anarchy’s', async () => {
  const sr6 = (who: Who, method: string, rest = '', body?: unknown, type = 'application/json', name?: string) =>
    call(who, method, `/api/sr6/backgrounds${rest}`, body, type, name)
  // it starts with the circuit board, which everyone signed in sees; the admin deletes it, and it stays gone
  const [d] = (await (await sr6('ada', 'GET')).json()).items
  expect(d).toMatchObject({ name: 'Circuit board (default)', enabled: true })
  expect(await (await sr6('pat', 'GET')).json()).toEqual({ enabled: [d.id] })
  expect((await sr6('pat', 'GET', `/${d.id}`)).headers.get('content-type')).toBe('image/webp')
  expect((await sr6('ada', 'DELETE', `/${d.id}`)).status).toBe(204)
  expect(await (await sr6('ada', 'GET')).json()).toEqual({ enabled: [], items: [] })
  expect(readFileSync(join(bgDir, 'backgrounds.xml'), 'utf8')).not.toContain('seeded') // Anarchy's: no default
  for (const who of ['eve', 'pat'] as const) expect((await sr6(who, 'POST', '', PNG, 'image/png', 'x.png')).status).toBe(403)
  expect((await sr6('nobody', 'GET')).status).toBe(401)
  expect((await sr6('ada', 'POST', '', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/png', 'x.png')).status).toBe(415)
  const big = await sr6('ada', 'POST', '', Buffer.concat([PNG, Buffer.alloc(10 * 1024 * 1024)]), 'image/png', 'big.png').catch(() => null)
  if (big) expect(big.status).toBe(413)
  const r = await sr6('ada', 'POST', '', PNG, 'image/png', 'sr6.png')
  expect(r.status).toBe(201)
  const { id } = await r.json()
  expect(readdirSync(join(lib, 'sr6', 'backgrounds')).sort()).toEqual([`${id}.png`, 'backgrounds.xml'].sort())
  expect(readdirSync(bgDir)).toEqual(['backgrounds.xml']) // Anarchy's folder untouched
  expect(await (await sr6('pat', 'GET')).json()).toEqual({ enabled: [id] })
  expect(await (await call('pat', 'GET', '/api/backgrounds')).json()).toEqual({ enabled: [] })
  expect((await call('pat', 'GET', `/api/backgrounds/${id}`)).status).toBe(404)
  expect((await sr6('pat', 'GET', `/${id}`)).status).toBe(200)
  const a = await (await upload(PNG)).json() // an Anarchy image is never SR6's
  expect((await sr6('ada', 'GET', `/${a.id}`)).status).toBe(404)
  expect((await sr6('ada', 'PUT', `/${a.id}`, { enabled: false })).status).toBe(404)
  // never an SR6 book
  expect(await (await call('ada', 'GET', '/api/sr6/books')).json()).toEqual([])
  expect((await sr6('eve', 'PUT', `/${id}`, { enabled: false })).status).toBe(403)
  expect((await sr6('eve', 'DELETE', `/${id}`)).status).toBe(403)
  expect(await (await sr6('ada', 'PUT', `/${id}`, { enabled: false })).json()).toMatchObject({ id, enabled: false })
  expect(await (await sr6('pat', 'GET')).json()).toEqual({ enabled: [] })
  expect((await sr6('ada', 'DELETE', `/${id}`)).status).toBe(204)
  expect(readdirSync(join(lib, 'sr6', 'backgrounds'))).toEqual(['backgrounds.xml'])
  expect((await call('ada', 'DELETE', `/api/backgrounds/${a.id}`)).status).toBe(204)
})
