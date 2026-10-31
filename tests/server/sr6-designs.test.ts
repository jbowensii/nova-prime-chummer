// @vitest-environment node
// SR6 vehicle and drone designs (server.mjs /api/sr6/designs*): every account's own store in characters/sr6/.designs/
// <owner>/, players too; a body must have a <design> block, which no runner or NPC store takes; rev/If-Match like
// runners; another account's design can't be overwritten; the design trash restores; Anarchy has no such route; a
// player's save drops the design's approved (a GM's mark).
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
// @ts-expect-error plain JS module
import { createServer } from '../../server/server.mjs'
// @ts-expect-error plain JS module
import { usersFile } from '../../server/auth.mjs'

vi.setConfig({ testTimeout: 30000 })
const PW = { ada: 'ada-password-1', eve: 'eve-password-1', pat: 'pat-password-1' }
type Who = keyof typeof PW
const dir = mkdtempSync(join(tmpdir(), 'sr6-designs-')),
  chars = join(dir, 'chars'),
  designs = join(chars, 'sr6', '.designs')
const jar = {} as Record<Who, string>
let base = ''
let srv: { close: () => void; listen: (p: number, cb: () => void) => void; address: () => { port: number } }

beforeAll(async () => {
  mkdirSync(join(dir, 'library', '.config'), { recursive: true })
  writeFileSync(
    join(dir, 'library', '.config', 'users.xml'),
    await usersFile([
      { username: 'ada', password: PW.ada, name: 'Ada Admin' },
      { username: 'eve', password: PW.eve, role: 'editor', name: 'Eve Editor' },
      { username: 'pat', password: PW.pat, role: 'player', name: 'Pat Player' },
    ]),
  )
  srv = createServer({ staticDir: 'public', charDir: chars, customDir: join(dir, 'custom'), libraryDir: join(dir, 'library'), python: 'python3' })
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

const call = (who: Who, method: string, path: string, body?: string, headers: Record<string, string> = {}) =>
  fetch(`${base}${path}`, { method, body, headers: { Origin: base, Cookie: jar[who], ...headers } })
const file = (id: string, name: string, first = '<design kind="vehicle"/>') =>
  `<?xml version="1.0"?><sr6:character xmlns:sr6="urn:chummer-sr6:character:1" formatVersion="1" id="${id}" streetName="${name}" updatedAt="2026-10-16">\n  ${first}<build/></sr6:character>`
const ids = async (who: Who, path = '/api/sr6/designs') =>
  (await (await call(who, 'GET', path)).json()).map((c: { owner: string; xml: string }) => `${c.owner}/${c.xml.match(/ id="([^"]+)"/)![1]}`).sort()

test('a player saves their own designs (rev, If-Match); a body without a <design> is refused, and no runner or NPC store takes one', async () => {
  expect((await call('pat', 'PUT', '/api/sr6/designs/d1', file('d1', 'Red Zip', ''))).status).toBe(400)
  const made = await call('pat', 'PUT', '/api/sr6/designs/d1', file('d1', 'Red Zip'))
  expect([made.status, await made.json()]).toEqual([201, { rev: 1, file: 'Red-Zip.xml' }])
  expect(readdirSync(join(designs, 'pat'))).toEqual(['Red-Zip.xml'])
  expect((await call('pat', 'PUT', '/api/sr6/designs/d1', file('d1', 'Red Zip II'))).status).toBe(409) // no If-Match
  expect((await call('pat', 'PUT', '/api/sr6/designs/d1', file('d1', 'Red Zip II'), { 'If-Match': '1' })).status).toBe(200)
  expect(await ids('pat')).toEqual(['pat/d1'])
  expect(await ids('pat', '/api/sr6/characters')).toEqual([])
  expect((await call('pat', 'PUT', '/api/sr6/characters/d2', file('d2', 'Sneaky'))).status).toBe(400)
  expect((await call('eve', 'PUT', '/api/sr6/npcs/d2', file('d2', 'Sneaky'))).status).toBe(400)
  expect(existsSync(join(chars, 'sr6', 'pat'))).toBe(false)
})

test('another account can’t overwrite or delete it and doesn’t list it; the admin lists everyone’s', async () => {
  expect((await call('eve', 'PUT', '/api/sr6/designs/d1', file('d1', 'Mine now'), { 'If-Match': '2' })).status).toBe(403)
  expect((await call('eve', 'DELETE', '/api/sr6/designs/d1')).status).toBe(403)
  expect((await call('eve', 'PUT', '/api/sr6/designs/e1', file('e1', 'Eve’s drone', '<design kind="drone" approved="true"/>'))).status).toBe(201)
  expect(await ids('eve')).toEqual(['eve/e1'])
  expect(await ids('pat')).toEqual(['pat/d1'])
  expect(await ids('ada')).toEqual(['eve/e1', 'pat/d1'])
})

test('deleted, it waits in the design trash and comes back; Anarchy has no designs', async () => {
  expect((await call('pat', 'DELETE', '/api/sr6/designs/d1')).status).toBe(204)
  expect(await ids('pat')).toEqual([])
  const t = await (await call('pat', 'GET', '/api/sr6/designs/trash')).json()
  expect(t.items.map((i: { id: string; name: string }) => [i.id, i.name])).toEqual([['d1', 'Red Zip II']])
  expect((await (await call('pat', 'GET', '/api/sr6/trash')).json()).items).toEqual([]) // (not the runner trash)
  const back = await call('pat', 'POST', `/api/sr6/designs/trash/${encodeURIComponent(t.items[0].file)}/restore`)
  expect([back.status, (await back.json()).copy]).toEqual([200, false])
  expect(await ids('pat')).toEqual(['pat/d1'])
  expect((await call('pat', 'GET', '/api/designs')).status).toBe(404)
  expect((await call('pat', 'GET', '/api/designs/trash')).status).toBe(404)
})

test('a player’s design is saved without approved (either quote, a > in a value); a GM’s keeps it', async () => {
  const stored = (who: Who, name: string) => readFileSync(join(designs, who, name), 'utf8')
  const tag = `<design kind="vehicle" chassis="a>b" approved="true" diy="true"/>`
  expect((await call('pat', 'PUT', '/api/sr6/designs/p2', file('p2', 'Self Approved', tag))).status).toBe(201)
  expect(stored('pat', 'Self-Approved.xml')).toContain('<design kind="vehicle" chassis="a>b" diy="true"/>')
  expect(
    (await call('pat', 'PUT', '/api/sr6/designs/p2', file('p2', 'Self Approved', `<design approved = 'true' kind="drone">`), { 'If-Match': '1' })).status,
  ).toBe(200)
  expect(stored('pat', 'Self-Approved.xml')).toContain('<design kind="drone">')
  expect((await call('pat', 'PUT', '/api/sr6/designs/p3', file('p3', 'Odd', '<design kind=drone approved="true"/>'))).status).toBe(400)
  expect((await call('eve', 'PUT', '/api/sr6/designs/e2', file('e2', 'GM Approved', tag))).status).toBe(201)
  expect(stored('eve', 'GM-Approved.xml')).toContain(tag)
})

test('weapon and cyberware designs (the item builders) are shared: every account lists everyone’s; vehicle designs stay their own', async () => {
  const item = (approved = '') => `<itemDesign kind="weapon"${approved}><purchase uid="u" kind="weapons" id="zz.rifle" qty="1"/></itemDesign>`
  expect((await call('pat', 'PUT', '/api/sr6/designs/i1', file('i1', 'Pat Gun', item(' approved="true"')))).status).toBe(201)
  // a player's own save drops approved here too
  expect(readFileSync(join(designs, 'pat', 'Pat-Gun.xml'), 'utf8')).toContain('<itemDesign kind="weapon">')
  expect((await call('eve', 'PUT', '/api/sr6/designs/i2', file('i2', 'Eve Gun', item()))).status).toBe(201)
  const pat = await ids('pat')
  expect(pat).toContain('eve/i2')
  expect(pat.some(i => i.startsWith('eve/') && i !== 'eve/i2')).toBe(false)
})

test('a player’s item design is saved without the inner purchase’s approved too; a GM’s keeps it', async () => {
  const item = `<itemDesign kind="weapon" approved="true"><purchase uid="u" kind="weapons" id="zz.rifle" approved="true" qty="1"><purchase uid="a" kind="weapons" id="zz.scope" approved='true'/></purchase></itemDesign>`
  expect((await call('pat', 'PUT', '/api/sr6/designs/i3', file('i3', 'Sneaky Gun', item))).status).toBe(201)
  expect(readFileSync(join(designs, 'pat', 'Sneaky-Gun.xml'), 'utf8')).not.toMatch(/approved/)
  expect((await call('eve', 'PUT', '/api/sr6/designs/i4', file('i4', 'GM Gun', item))).status).toBe(201)
  expect(readFileSync(join(designs, 'eve', 'GM-Gun.xml'), 'utf8')).toContain('id="zz.rifle" approved="true"')
})

test('a cyberware design (the Cyberware designer) is stripped the same way for a player, kept for a GM', async () => {
  const item = `<itemDesign kind="cyberware" approved="true"><purchase uid="u" kind="augmentations" id="custom.limb-arm-obvious" approved="true" qty="1"/></itemDesign>`
  expect((await call('pat', 'PUT', '/api/sr6/designs/i5', file('i5', 'Pat Arm', item))).status).toBe(201)
  expect(readFileSync(join(designs, 'pat', 'Pat-Arm.xml'), 'utf8')).not.toMatch(/approved/)
  expect((await call('eve', 'PUT', '/api/sr6/designs/i6', file('i6', 'GM Arm', item))).status).toBe(201)
  expect(readFileSync(join(designs, 'eve', 'GM-Arm.xml'), 'utf8')).toContain('<itemDesign kind="cyberware" approved="true">')
})
