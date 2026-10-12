// @vitest-environment node
// Phase 3: players read shared compendium entries (server/compendiums.mjs GET /api/compendiums/shared and
// /api/sr6/compendiums/shared). Table-shared ones for everyone signed in; campaign-shared ones for that campaign's members
// and GMs while the owner still GMs it; private ones never. NPCs are never sent; nobody writes through it. Each game's own.
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
// @ts-expect-error plain JS module
import { createServer } from '../../server/server.mjs'
// @ts-expect-error plain JS module
import { usersFile } from '../../server/auth.mjs'
import { compendiumXml } from '../../src/engine'
import type { Compendium } from '../../src/model/types'

vi.setConfig({ testTimeout: 30000 })
const PW: Record<string, string> = { ada: 'ada-password-1', eve: 'eve-password-1', gil: 'gil-password-1', pat: 'pat-password-1', quin: 'quin-password-1' }
const dir = mkdtempSync(join(tmpdir(), 'ca2-shared-'))
const jar: Record<string, string> = {}
let base = ''
let srv: { close: () => void; listen: (p: number, cb: () => void) => void; address: () => { port: number } }

beforeAll(async () => {
  mkdirSync(join(dir, 'library', '.config'), { recursive: true })
  writeFileSync(
    join(dir, 'library', '.config', 'users.xml'),
    await usersFile([
      { username: 'ada', password: PW.ada, name: 'Ada' },
      { username: 'eve', password: PW.eve, role: 'editor', name: 'Eve' },
      { username: 'gil', password: PW.gil, role: 'editor', name: 'Gil' },
      { username: 'pat', password: PW.pat, role: 'player', name: 'Pat' },
      { username: 'quin', password: PW.quin, role: 'player', name: 'Quin' },
    ]),
  )
  mkdirSync(join(dir, 'custom', 'sr6', 'imported'), { recursive: true })
  copyFileSync('tests/fixtures/sr6/custom/imported/sources.xml', join(dir, 'custom', 'sr6', 'imported', 'sources.xml'))
  srv = createServer({ staticDir: 'public', charDir: join(dir, 'chars'), customDir: join(dir, 'custom'), libraryDir: join(dir, 'library'), python: 'python3' })
  await new Promise<void>(ok => srv.listen(0, ok))
  base = `http://127.0.0.1:${srv.address().port}`
  for (const who of Object.keys(PW)) {
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

const call = (who: string, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}${path}`, {
    method,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    headers: {
      Origin: base,
      Cookie: jar[who] ?? '',
      ...(body !== undefined && typeof body !== 'string' ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
  })
const CA2_NPC =
  '<ca2:character xmlns:ca2="urn:chummer-anarchy2:character:1" formatVersion="1" id="npc-2" streetName="Secret Goon" updatedAt="2026-10-02"><npc kind="npc" tier="regular"/><build/></ca2:character>'
const SR6_NPC =
  '<sr6:character xmlns:sr6="urn:chummer-sr6:character:1" formatVersion="1" id="npc-1" streetName="Secret Goon" updatedAt="2026-10-02"><npc kind="grunt"/><build/></sr6:character>'
const ca2 = (id: string, source: string, extra: Partial<Compendium> = {}) =>
  compendiumXml({
    id,
    name: `Kit ${source}`,
    source,
    sharing: 'private',
    updatedAt: '2026-10-02T00:00:00.000Z',
    amps: [],
    vehicles: [],
    npcs: [],
    items: [{ id: `${source.toLowerCase()}.blade`, kind: 'weapon', name: `${source} Blade`, dv: '3P', source, page: 1, text: 'Made up.' }],
    ...extra,
  }).replace('</ca2:data>', `${CA2_NPC}</ca2:data>`)
const sr6 = (id: string, source: string, sharing = 'sharing="private"') =>
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  `<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="compendium" version="1" id="${id}" name="Kit ${source}" source="${source}" ${sharing} updatedAt="2026-10-02T00:00:00.000Z">` +
  `<quality id="${source.toLowerCase()}.lucky" source="${source}" page="1" kind="positive" karma="5"><name>${source} Lucky</name><text/></quality>${SR6_NPC}\n</sr6:data>\n`
type Row = { id: string; owner: string; ownerName: string; xml: string; rev: number; file: string }
const shared = async (who: string, game = '') => {
  const r = await call(who, 'GET', `/api${game}/compendiums/shared`)
  expect(r.status).toBe(200)
  return (await r.json()) as Row[]
}
const sources = (rows: Row[]) => rows.map(r => r.xml.match(/ source="([^"]+)"/)![1]).sort()
const P1 = 'a1a1a1a1a1a1',
  T1 = 'b1b1b1b1b1b1',
  C1 = 'c1c1c1c1c1c1',
  X1 = 'd1d1d1d1d1d1'
let cid = '',
  sr6cid = ''

test('setup: eve makes a private, a table and a campaign compendium in each game; pat plays in her campaigns, quin in none', async () => {
  cid = (await (await call('eve', 'POST', '/api/campaigns', { name: 'Seattle' })).json()).id
  sr6cid = (await (await call('eve', 'POST', '/api/sr6/campaigns', { name: 'Sixth' })).json()).id
  expect((await call('eve', 'POST', `/api/campaigns/${cid}/members`, { user: 'pat' })).status).toBe(200)
  expect((await call('eve', 'POST', `/api/sr6/campaigns/${sr6cid}/members`, { user: 'pat' })).status).toBe(200)
  for (const [id, xml] of [
    [P1, ca2(P1, 'PRIV')],
    [T1, ca2(T1, 'TAB', { sharing: 'table' })],
    [C1, ca2(C1, 'CAMP', { sharing: 'campaign', campaign: cid })],
  ])
    expect((await call('eve', 'PUT', `/api/compendiums/${id}`, xml)).status).toBe(201)
  for (const [id, xml] of [
    [P1, sr6(P1, 'SPRIV')],
    [T1, sr6(T1, 'STAB', 'sharing="table"')],
    [C1, sr6(C1, 'SCAMP', `sharing="campaign" campaign="${sr6cid}"`)],
  ])
    expect((await call('eve', 'PUT', `/api/sr6/compendiums/${id}`, xml)).status).toBe(201)
})

test('a player in the campaign reads the table and campaign ones; a player outside only the table one; private never', async () => {
  expect(sources(await shared('pat'))).toEqual(['CAMP', 'TAB'])
  expect(sources(await shared('quin'))).toEqual(['TAB'])
  expect(sources(await shared('pat', '/sr6'))).toEqual(['SCAMP', 'STAB'])
  expect(sources(await shared('quin', '/sr6'))).toEqual(['STAB'])
  const [row] = (await shared('quin')).filter(r => r.id === T1)
  expect(row).toMatchObject({ id: T1, owner: 'eve', ownerName: 'Eve', rev: 1, file: `${T1}.xml` })
  expect(row.xml).toContain('TAB Blade')
  // a GM of another campaign reads the table one here too (their full list is /api/compendiums)
  expect(sources(await shared('gil'))).toEqual(['TAB'])
})

test('NPCs are never sent through the shared route', async () => {
  for (const who of ['pat', 'quin', 'gil', 'ada'])
    for (const game of ['', '/sr6']) {
      const rows = await shared(who, game)
      for (const r of rows) {
        expect(r.xml).not.toMatch(/character|Secret Goon/)
        expect(r.xml).toMatch(/<\/(ca2|sr6):data>\s*$/)
      }
    }
  // an NPC written with another prefix is taken out too
  const sneaky = ca2(X1, 'SNEAK', { sharing: 'table' }).replace(CA2_NPC, CA2_NPC.replace(/ca2:character/g, 'x:character').replace('xmlns:ca2', 'xmlns:x'))
  expect((await call('eve', 'PUT', `/api/compendiums/${X1}`, sneaky)).status).toBe(201)
  const row = (await shared('quin')).find(r => r.id === X1)!
  expect(row.xml).not.toMatch(/character|Secret Goon/)
  expect(row.xml).toContain('SNEAK Blade')
  expect((await call('eve', 'DELETE', `/api/compendiums/${X1}`)).status).toBe(204)
})

test('players still can’t list, write or delete through the GM routes; nobody writes through the shared one', async () => {
  expect((await call('pat', 'GET', '/api/compendiums')).status).toBe(403)
  expect((await call('pat', 'GET', '/api/sr6/compendiums')).status).toBe(403)
  expect((await call('pat', 'PUT', `/api/compendiums/${T1}`, ca2(T1, 'TAB', { sharing: 'table' }), { 'If-Match': '1' })).status).toBe(403)
  expect((await call('pat', 'DELETE', `/api/sr6/compendiums/${T1}`)).status).toBe(403)
  for (const m of ['PUT', 'POST', 'DELETE']) {
    expect((await call('pat', m, '/api/compendiums/shared', m === 'DELETE' ? undefined : 'x')).status).toBeGreaterThanOrEqual(403)
    expect((await call('eve', m, '/api/compendiums/shared', m === 'DELETE' ? undefined : 'x')).status).toBe(405)
  }
  expect((await fetch(`${base}/api/compendiums/shared`, { headers: { Origin: base } })).status).toBe(401)
})

test('a campaign one goes when the player leaves the campaign or the owner stops GMing it', async () => {
  expect((await call('eve', 'DELETE', `/api/campaigns/${cid}/members/pat`)).status).toBe(200)
  expect(sources(await shared('pat'))).toEqual(['TAB'])
  expect(sources(await shared('pat', '/sr6'))).toEqual(['SCAMP', 'STAB']) // the other game's campaign is apart
  expect((await call('ada', 'POST', `/api/sr6/campaigns/${sr6cid}/gms`, { user: 'gil' })).status).toBe(200)
  expect((await call('eve', 'DELETE', `/api/sr6/campaigns/${sr6cid}/gms/eve`)).status).toBe(200)
  expect(sources(await shared('pat', '/sr6'))).toEqual(['STAB'])
})
