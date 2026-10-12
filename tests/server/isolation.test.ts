// @vitest-environment node
// Several accounts signed in at once, all busy at the same moment: each only ever sees and changes its own runners, trash
// and campaign roster; a request from a page that was signed in as someone else (X-CA2-User) is refused; a backup's token
// works only for the admin who made it; a rename in the middle of saves moves every save with the account.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
// @ts-expect-error plain JS module
import { createServer } from '../../server/server.mjs'
// @ts-expect-error plain JS module
import { usersFile } from '../../server/auth.mjs'

vi.setConfig({ testTimeout: 60000 })
const PW = { ada: 'ada-password-1', bo: 'bo-password-01', eve: 'eve-password-1', pat: 'pat-password-1', kim: 'kim-password-1' }
type Who = keyof typeof PW
const PLAYERS = ['eve', 'pat', 'kim'] as const
const dir = mkdtempSync(join(tmpdir(), 'ca2-isolation-')),
  chars = join(dir, 'chars')
const jar = {} as Record<Who, string>,
  ids = {} as Record<Who, string>
let base = ''
let srv: { close: () => void; stopJobs: () => void; listen: (p: number, cb: () => void) => void; address: () => { port: number } }

beforeAll(async () => {
  mkdirSync(join(dir, 'library', '.config'), { recursive: true })
  writeFileSync(
    join(dir, 'library', '.config', 'users.xml'),
    await usersFile([
      { username: 'ada', password: PW.ada },
      { username: 'bo', password: PW.bo },
      { username: 'eve', password: PW.eve, role: 'editor' },
      { username: 'pat', password: PW.pat, role: 'player' },
      { username: 'kim', password: PW.kim, role: 'player' },
    ]),
  )
  srv = createServer({
    staticDir: 'public',
    charDir: chars,
    customDir: join(dir, 'custom'),
    libraryDir: join(dir, 'library'),
    python: [process.execPath, 'tests/fixtures/stub-worker.mjs'],
  })
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
    ids[who] = (await r.json()).user.id
  }
})
afterAll(() => {
  srv.stopJobs()
  srv.close()
})

const call = (who: Who, method: string, path: string, body?: string, headers: Record<string, string> = {}) =>
  fetch(`${base}${path}`, {
    method,
    body,
    headers: { Origin: base, Cookie: jar[who], ...(body?.startsWith('{') ? { 'Content-Type': 'application/json' } : {}), ...headers },
  })
const runner = (id: string, street: string) =>
  `<?xml version="1.0"?><ca2:character xmlns:ca2="urn:chummer-anarchy2:character:1" formatVersion="1" id="${id}" streetName="${street}" metatype="ork" level="runner" updatedAt="2026-09-27"><build/></ca2:character>`
const street = (xml: string) => xml.match(/streetName="([^"]*)"/)![1]
const list = async (who: Who) => (await call(who, 'GET', '/api/characters')).json() as Promise<{ xml: string; owner: string; rev: number }[]>
/** Everyone's own runners only: every row is theirs, by owner and by what they wrote into it. */
async function onlyOwn(who: Who) {
  const rows = await list(who)
  for (const r of rows) {
    expect(r.owner).toBe(who)
    expect(street(r.xml).startsWith(`${who}-`)).toBe(true)
  }
  return rows
}
const N = 15

test('three accounts save, list and re-save their own runners at once: nothing crosses over', async () => {
  // every account's creates, interleaved, with listings in between
  await Promise.all(
    Array.from({ length: N }, (_, i) =>
      PLAYERS.flatMap(who => [
        call(who, 'PUT', `/api/characters/${who}-r${i}`, runner(`${who}-r${i}`, `${who}-${i}-v1`)).then(r => expect(r.status).toBe(201)),
        onlyOwn(who),
      ]),
    ).flat(),
  )
  // then every one saved again five times over, one save after another per runner (If-Match), all runners at once
  await Promise.all(
    PLAYERS.flatMap(who =>
      Array.from({ length: N }, async (_, i) => {
        for (let v = 2; v <= 6; v++) {
          const r = await call(who, 'PUT', `/api/characters/${who}-r${i}`, runner(`${who}-r${i}`, `${who}-${i}-v${v}`), { 'If-Match': String(v - 1) })
          expect(r.status).toBe(200)
          await onlyOwn(who)
        }
      }),
    ),
  )
  for (const who of PLAYERS) {
    const rows = await onlyOwn(who)
    expect(rows.map(r => street(r.xml)).sort()).toEqual(Array.from({ length: N }, (_, i) => `${who}-${i}-v6`).sort())
    expect(rows.every(r => r.rev === 6)).toBe(true)
    expect(readdirSync(join(chars, who)).filter(f => f.endsWith('.xml'))).toHaveLength(N)
  }
})

test('saving another account’s runner is refused, even when both hammer it at once', async () => {
  const tries = await Promise.all(
    Array.from({ length: 10 }, (_, i) => call('kim', 'PUT', `/api/characters/pat-r${i}?force=1`, runner(`pat-r${i}`, `kim-stolen-${i}`)).then(r => r.status)),
  )
  expect(tries.every(s => s === 403)).toBe(true)
  expect((await list('pat')).some(r => street(r.xml).startsWith('kim'))).toBe(false)
  expect((await list('kim')).some(r => /pat-r/.test(r.xml))).toBe(false)
})

test('a page signed in as one account never reads or saves under another account’s cookie (X-CA2-User)', async () => {
  // Pat's page, but the browser's cookie is now Kim's (Kim signed in in another tab): a new runner, a list, a trash
  const asPat = { 'X-CA2-User': ids.pat }
  const put = await call('kim', 'PUT', '/api/characters/pat-new', runner('pat-new', 'pat-new-unsaved'), asPat)
  expect(put.status).toBe(401)
  expect((await put.json()).error).toMatch(/another account/)
  expect((await call('kim', 'GET', '/api/characters', undefined, asPat)).status).toBe(401)
  expect((await call('kim', 'GET', '/api/trash', undefined, asPat)).status).toBe(401)
  expect((await call('kim', 'DELETE', '/api/characters/kim-r0', undefined, asPat)).status).toBe(401)
  expect(existsSync(join(chars, 'kim', 'pat-new-unsaved.xml'))).toBe(false)
  expect((await list('kim')).some(r => /pat-new/.test(r.xml))).toBe(false)
  // the page's own account: as before
  expect((await call('kim', 'GET', '/api/characters', undefined, { 'X-CA2-User': ids.kim })).status).toBe(200)
  // Kim's session is still Kim's: nothing ended it
  expect((await call('kim', 'GET', '/api/characters')).status).toBe(200)
})

test('trash at once: each account deletes, lists and restores its own', async () => {
  await Promise.all(
    PLAYERS.flatMap(who => Array.from({ length: 5 }, (_, i) => call(who, 'DELETE', `/api/characters/${who}-r${i}`).then(r => expect(r.status).toBe(204)))),
  )
  const trashes = await Promise.all(PLAYERS.map(async who => [who, await (await call(who, 'GET', '/api/trash')).json()] as const))
  for (const [who, t] of trashes) {
    expect(t.user).toBe(who)
    expect(t.items.map((x: { id: string }) => x.id).sort()).toEqual(Array.from({ length: 5 }, (_, i) => `${who}-r${i}`).sort())
  }
  // restore them all at once, everyone
  await Promise.all(
    trashes.flatMap(([who, t]) =>
      t.items.map((x: { file: string }) => call(who, 'POST', `/api/trash/${encodeURIComponent(x.file)}/restore`).then(r => expect(r.status).toBe(200))),
    ),
  )
  for (const who of PLAYERS) {
    expect(await onlyOwn(who)).toHaveLength(N)
    expect((await (await call(who, 'GET', '/api/trash')).json()).items).toEqual([])
  }
  // someone else's trash, by name: the admin only
  expect((await call('kim', 'GET', '/api/trash?user=pat')).status).toBe(403)
  expect((await call('kim', 'POST', `/api/trash/${encodeURIComponent(trashes[1][1].items[0].file)}/restore`)).status).toBe(404) // not in Kim's trash
})

test('a campaign’s roster changes while its players add runners and read it: each sees only what they may', async () => {
  const c = await (await call('eve', 'POST', '/api/campaigns', JSON.stringify({ name: 'Busy table' }))).json()
  await Promise.all([
    call('eve', 'POST', `/api/campaigns/${c.id}/members`, JSON.stringify({ user: 'pat' })),
    call('eve', 'POST', `/api/campaigns/${c.id}/members`, JSON.stringify({ user: 'kim' })),
  ])
  await Promise.all([
    ...(['pat', 'kim'] as const).flatMap(who =>
      Array.from({ length: 5 }, (_, i) =>
        call(who, 'POST', `/api/campaigns/${c.id}/runners`, JSON.stringify({ id: `${who}-r${i}` })).then(r => expect(r.status).toBe(200)),
      ),
    ),
    ...Array.from({ length: 10 }, () =>
      (['pat', 'kim'] as const).map(async who => {
        const r = await call(who, 'GET', `/api/campaigns/${c.id}`)
        if (r.status !== 200) return // not added yet
        const v = await r.json()
        for (const x of v.runners) {
          expect('owner' in x || 'file' in x).toBe(false) // a member gets names only
          if (!x.mine) expect('id' in x).toBe(false)
          else expect(x.id.startsWith(`${who}-`)).toBe(true)
        }
      }),
    ).flat(),
    ...(['pat', 'kim'] as const).map(onlyOwn), // Eve, their GM, reads theirs too (below)
  ])
  const gm = await (await call('eve', 'GET', `/api/campaigns/${c.id}`)).json()
  expect(gm.runners).toHaveLength(10)
  // the GM reads their runners; the players still list only their own
  const eve = await list('eve')
  expect(
    eve
      .filter(r => r.owner !== 'eve')
      .map(r => r.owner)
      .sort(),
  ).toEqual([...Array(5).fill('kim'), ...Array(5).fill('pat')])
  for (const who of ['pat', 'kim'] as const) await onlyOwn(who)
  // Kim leaves while Pat reads: Kim's runners leave the campaign (and stay Kim's); Pat's stay in it
  await Promise.all([call('eve', 'DELETE', `/api/campaigns/${c.id}/members/kim`), ...Array.from({ length: 5 }, () => onlyOwn('pat'))])
  expect((await (await call('eve', 'GET', `/api/campaigns/${c.id}`)).json()).runners.every((x: { owner: string }) => x.owner === 'pat')).toBe(true)
  expect((await call('kim', 'GET', `/api/campaigns/${c.id}`)).status).toBe(404)
  expect(await onlyOwn('kim')).toHaveLength(N)
})

test('an account renamed in the middle of its saves: every save lands in its folder, nobody else’s', async () => {
  const saves = Array.from({ length: 20 }, (_, i) =>
    call('pat', 'PUT', `/api/characters/pat-r${i % N}?force=1`, runner(`pat-r${i % N}`, `pat-${i % N}-renamed`)).then(r => r.status),
  )
  const rename = call('ada', 'PUT', `/api/users/${ids.pat}`, JSON.stringify({ username: 'pat2' })).then(r => r.status)
  const kim = Array.from({ length: 10 }, () => onlyOwn('kim'))
  const [statuses, renamed] = await Promise.all([Promise.all(saves), rename, Promise.all(kim)])
  expect(renamed).toBe(200)
  expect(statuses.every(s => s === 200)).toBe(true)
  expect(existsSync(join(chars, 'pat'))).toBe(false)
  expect(readdirSync(join(chars, 'pat2')).filter(f => f.endsWith('.xml'))).toHaveLength(N)
  const rows = await list('pat') // the same session, now pat2
  expect(rows.every(r => r.owner === 'pat2' && street(r.xml).startsWith('pat-'))).toBe(true)
  expect(await onlyOwn('kim')).toHaveLength(N)
  for (const f of readdirSync(join(chars, 'kim')).filter(f => f.endsWith('.xml'))) expect(readFileSync(join(chars, 'kim', f), 'utf8')).not.toContain('pat-')
})

test('a backup’s token works only for the admin who made it', async () => {
  const { token } = await (await call('ada', 'POST', '/api/backup')).json()
  expect(token).toMatch(/^[0-9a-f]{32}$/)
  expect((await call('bo', 'GET', `/api/backup/${token}`)).status).toBe(404)
  const mine = await call('ada', 'GET', `/api/backup/${token}`)
  expect(mine.status).toBe(200)
  await mine.arrayBuffer()
})
