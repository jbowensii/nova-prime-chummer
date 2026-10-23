// @vitest-environment node
// Phase 2 core: the new settings' precedence, the Data/systems layout (paths and a live server on it), and the migrator
// (dry-run plan, refuse-on-busy, the "sr6" account rename, apply with checksums, resume, idempotency). Temp folders only.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, expect, test } from 'vitest'
// @ts-expect-error plain JS module
import { resolveConfig } from '../../server/config.mjs'
// @ts-expect-error plain JS module
import { dataLayout, layoutOf } from '../../server/layout.mjs'
// @ts-expect-error plain JS module
import { containerGuard, migrate, startGuard } from '../../server/migrate.mjs'
import { createServer } from './_signin'

const root = mkdtempSync(join(tmpdir(), 'layout-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))
const put = (path: string, text = path) => (mkdirSync(dirname(path), { recursive: true }), writeFileSync(path, text))
const sha = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex')
const norm = (p: string) => p.split('\\').join('/')

// ---- settings ----
const file = join(root, 'options.json')
writeFileSync(file, JSON.stringify({ hostname: 'from-file', routePrefix: null, language: 'de', upnp: true, sslCert: '/c.pem', telemetry: true }))

test('resolveConfig: the Phase 2 settings resolve flag > env > options.json > default, and null turns one off', () => {
  const c = ['--config', file]
  const d = resolveConfig([], {})
  expect([
    d.hostname,
    d.routePrefix,
    d.sslCert,
    d.sslKey,
    d.proxySSL,
    d.proxyPort,
    d.upnp,
    d.awsConfig,
    d.language,
    d.updateChannel,
    d.compressStatic,
    d.telemetry,
  ]).toEqual([null, null, null, null, false, null, false, null, 'en', 'stable', true, false])
  expect(d.dataPath).toBe('/data')
  expect(resolveConfig([...c, '--hostname=flag'], { APP_HOSTNAME: 'env' }).hostname).toBe('flag')
  expect(resolveConfig(c, { APP_HOSTNAME: 'env' }).hostname).toBe('env')
  expect(resolveConfig(c, {}).hostname).toBe('from-file')
  expect(resolveConfig(c, {}).routePrefix).toBeNull() // JSON null: off, not the default
  expect(resolveConfig(c, { ROUTE_PREFIX: '/app' }).routePrefix).toBe('/app')
  expect(resolveConfig(c, { SSL_CERT: 'null' }).sslCert).toBeNull() // the text "null" from env turns it off
  expect(resolveConfig(c, {}).language).toBe('de')
  expect(resolveConfig(c, { UPNP: 'off' }).upnp).toBe(false)
  expect(resolveConfig(c, {}).upnp).toBe(true)
  expect(resolveConfig([], { PROXY_SSL: 'true', PROXY_PORT: '8443', UPDATE_CHANNEL: 'Testing', COMPRESS_STATIC: '0' })).toMatchObject({
    proxySSL: true,
    proxyPort: 8443,
    updateChannel: 'testing',
    compressStatic: false,
  })
  expect(resolveConfig([], { UPDATE_CHANNEL: 'nightly' }).updateChannel).toBe('stable')
  expect(resolveConfig(['--data-path', '/x'], {}).dataPath).toBe('/x')
})

// ---- layout ----
test('dataLayout: every path under dataPath, per game; the account registry is one Config/', () => {
  const L = dataLayout(join(root, 'dp'))
  const rel = (p: string) => norm(p).slice(norm(L.root).length + 1)
  expect(rel(L.config)).toBe('Config')
  expect(rel(L.backups)).toBe('Backups')
  expect(rel(L.games.ca2.chars)).toBe('Data/systems/anarchy2/characters')
  expect(rel(L.games.ca2.npcs)).toBe('Data/systems/anarchy2/npcs')
  expect(rel(L.games.ca2.compendiums)).toBe('Data/systems/anarchy2/compendiums')
  expect(rel(L.games.ca2.custom)).toBe('Data/systems/anarchy2')
  expect(L.games.ca2.designs).toBeNull()
  expect(rel(L.games.sr6.designs)).toBe('Data/systems/sr6/designs')
  expect(rel(L.games.sr6.library)).toBe('Library/sr6')
  expect(rel(L.games.ca2.assets)).toBe('Data/assets/anarchy2')
  expect(rel(L.games.sr6.ai)).toBe('Config/ai/sr6')
  expect(layoutOf({ dataPath: L.root }).kind).toBe('data')
  expect(layoutOf({ charDir: join(root, 'c'), customDir: join(root, 'u') }).kind).toBe('legacy')
  expect(() => layoutOf({})).toThrow(/dataPath/)
})

test('a server on a dataPath stores runners, NPCs and designs under Data/systems and never serves them at /custom/', async () => {
  const dp = join(root, 'live')
  const srv = createServer({ staticDir: 'public', dataPath: dp })
  await new Promise<void>(ok => srv.listen(0, ok))
  const base = `http://127.0.0.1:${srv.address().port}`
  const xml = (tag: string, ns: string, id: string, inner = '') =>
    `<?xml version="1.0"?><${tag} xmlns:${tag.split(':')[0]}="${ns}" formatVersion="1" id="${id}" streetName="X" updatedAt="2026-10-23">${inner}</${tag}>`
  const A = 'urn:chummer-anarchy2:character:1',
    S = 'urn:chummer-sr6:character:1'
  try {
    expect((await fetch(`${base}/api/characters/r1`, { method: 'PUT', body: xml('ca2:character', A, 'r1') })).status).toBe(201)
    expect((await fetch(`${base}/api/npcs/n1`, { method: 'PUT', body: xml('ca2:character', A, 'n1', '<npc/>') })).status).toBe(201)
    expect((await fetch(`${base}/api/sr6/characters/s1`, { method: 'PUT', body: xml('sr6:character', S, 's1') })).status).toBe(201)
    expect((await fetch(`${base}/api/sr6/designs/d1`, { method: 'PUT', body: xml('sr6:character', S, 'd1', '<design kind="vehicle"/>') })).status).toBe(201)
    const ds = (g: string, ...p: string[]) => join(dp, 'Data', 'systems', g, ...p)
    expect(readdirSync(ds('anarchy2', 'characters', 'admin'))).toHaveLength(1)
    expect(readdirSync(ds('anarchy2', 'npcs', 'admin'))).toHaveLength(1)
    expect(readdirSync(ds('sr6', 'characters', 'admin'))).toHaveLength(1)
    expect(readdirSync(ds('sr6', 'designs', 'admin'))).toHaveLength(1)
    expect(existsSync(join(dp, 'Config', 'users.xml'))).toBe(true)
    // the catalog is served from the system folder; its account data and campaigns.xml are not
    put(ds('anarchy2', 'imported', 'a.xml'), '<a/>')
    put(ds('sr6', 'imported', 'b.xml'), '<b/>')
    put(ds('anarchy2', 'campaigns.xml'), '<c/>')
    const get = (p: string) => fetch(`${base}${p}`).then(r => r.status)
    expect(await get('/custom/imported/a.xml')).toBe(200)
    expect(await get('/custom/sr6/imported/b.xml')).toBe(200)
    const f = readdirSync(ds('anarchy2', 'characters', 'admin'))[0]
    for (const p of [
      `/custom/characters/admin/${f}`,
      `/custom/Characters/admin/${f}`,
      '/custom/npcs/admin/',
      '/custom/campaigns.xml',
      '/custom/sr6/characters/admin/x.xml',
      '/custom/sr6/designs/admin/x.xml',
    ])
      expect(await get(p), p).toBe(404)
    // a link (a junction, so no privilege is needed on Windows) from the catalog into Config/ is not followed
    symlinkSync(join(dp, 'Config'), ds('anarchy2', 'cfglink'), 'junction')
    expect(await get('/custom/cfglink/users.xml')).toBe(404)
    expect(await get('/custom/imported/a.xml')).toBe(200)
    // backup and restore are wired to the new layout (importer/backup.py), no longer a 501
    expect((await fetch(`${base}/api/backup`, { method: 'POST' })).status).not.toBe(501)
  } finally {
    srv.close()
  }
}, 30000)

// ---- migrator ----
const fakeBackup = async (_r: unknown, out: string) => (writeFileSync(out, 'zip'), { entries: 3 })
function oldTree(name: string, users = '<ca2:users version="1"><user username="ada"/></ca2:users>') {
  const d = join(root, name),
    c = join(d, 'characters'),
    u = join(d, 'custom'),
    l = join(d, 'library')
  put(join(c, 'ada', 'r1.xml'), 'ca2 runner')
  put(join(c, 'ada', '.trash', 'gone-1.xml'), 'ca2 trash')
  put(join(c, 'loose.xml'), 'pre-account runner')
  put(join(c, '.trash', 'old.xml'), 'pre-account trash')
  put(join(c, '.npcs', 'ada', 'n1.xml'), 'ca2 npc')
  put(join(c, '.compendiums', 'ada', 'c1.xml'), 'ca2 comp')
  put(join(c, 'sr6', 'ada', 's1.xml'), 'sr6 runner')
  put(join(c, 'sr6', '.npcs', 'ada', 'sn.xml'), 'sr6 npc')
  put(join(c, 'sr6', '.designs', 'ada', 'sd.xml'), 'sr6 design')
  put(join(c, 'sr6', '.compendiums', 'ada', 'sc.xml'), 'sr6 comp')
  put(join(u, 'imported', 'core', 'levels.xml'), 'core')
  put(join(u, 'sources.xml'), 'house')
  put(join(u, 'campaigns.xml'), '<ca2:campaigns><campaign id="c1"><gm user="ada"/></campaign></ca2:campaigns>')
  put(join(u, 'table-rules.xml'), 'rules')
  put(join(u, 'samples', 'set', 'set.xml'), 'sample')
  put(join(u, 'sr6', 'campaigns.xml'), '<ca2:campaigns/>')
  put(join(u, 'sr6', 'creation.xml'), 'creation')
  put(join(u, 'sr6', 'imported', 'core', 'x.xml'), 'sr6 core')
  put(join(l, 'book1', 'original.pdf'), 'pdf')
  put(join(l, 'book1', 'status.xml'), 'status')
  put(join(l, 'sr6', 'bookS', 'book.md'), 'sr6 book')
  put(join(l, '.config', 'users.xml'), users)
  put(join(l, '.config', 'sessions.xml'), 'sessions')
  put(join(l, '.config', 'ai-keys.xml'), 'keys')
  put(join(l, '.config', 'ask-counts.xml'), 'counts')
  put(join(l, 'sr6', '.config', 'ai-keys.xml'), 'sr6 keys')
  put(join(l, 'backgrounds', 'b.webp'), 'bg')
  put(join(l, 'sr6', 'backgrounds', 'c.webp'), 'sr6 bg')
  put(join(l, '.backups', 'old.zip'), 'old backup')
  put(join(l, '.upload-1', 'tmp.pdf'), 'scratch')
  return { d, cfg: { dataPath: join(d, 'new'), charDir: c, customDir: u, libraryDir: l } }
}
const quiet = { log: () => {}, backup: fakeBackup, guard: async () => null }
const dst = (p: { entries: { src: string; dst: string }[] }, suffix: string) => norm(p.entries.find(e => norm(e.src).endsWith(suffix))!.dst)

test('migrator dry run: the full old -> new plan with checksums, dot-folders and both games, and nothing touched', async () => {
  const { cfg } = oldTree('dry')
  const r = await migrate(cfg, quiet)
  expect(r.status).toBe('planned')
  const p = r.plan
  expect(p.refused).toEqual([])
  const to = (s: string) => dst(p, s).slice(norm(cfg.dataPath).length + 1)
  expect(to('characters/ada/r1.xml')).toBe('Data/systems/anarchy2/characters/ada/r1.xml')
  expect(to('characters/ada/.trash/gone-1.xml')).toBe('Data/systems/anarchy2/characters/ada/.trash/gone-1.xml')
  expect(to('characters/loose.xml')).toBe('Data/systems/anarchy2/characters/loose.xml')
  expect(to('characters/.trash/old.xml')).toBe('Data/systems/anarchy2/characters/.trash/old.xml')
  expect(to('.npcs/ada/n1.xml')).toBe('Data/systems/anarchy2/npcs/ada/n1.xml')
  expect(to('characters/.compendiums/ada/c1.xml')).toBe('Data/systems/anarchy2/compendiums/ada/c1.xml')
  expect(to('sr6/ada/s1.xml')).toBe('Data/systems/sr6/characters/ada/s1.xml')
  expect(to('sr6/.npcs/ada/sn.xml')).toBe('Data/systems/sr6/npcs/ada/sn.xml')
  expect(to('sr6/.designs/ada/sd.xml')).toBe('Data/systems/sr6/designs/ada/sd.xml')
  expect(to('sr6/.compendiums/ada/sc.xml')).toBe('Data/systems/sr6/compendiums/ada/sc.xml')
  expect(to('custom/imported/core/levels.xml')).toBe('Data/systems/anarchy2/imported/core/levels.xml')
  expect(to('custom/campaigns.xml')).toBe('Data/systems/anarchy2/campaigns.xml')
  expect(to('custom/table-rules.xml')).toBe('Data/systems/anarchy2/table-rules.xml')
  expect(to('custom/samples/set/set.xml')).toBe('Data/systems/anarchy2/samples/set/set.xml')
  expect(to('custom/sr6/campaigns.xml')).toBe('Data/systems/sr6/campaigns.xml')
  expect(to('custom/sr6/creation.xml')).toBe('Data/systems/sr6/creation.xml')
  expect(to('custom/sr6/imported/core/x.xml')).toBe('Data/systems/sr6/imported/core/x.xml')
  expect(to('library/book1/original.pdf')).toBe('Library/anarchy2/book1/original.pdf')
  expect(to('library/sr6/bookS/book.md')).toBe('Library/sr6/bookS/book.md')
  expect(to('library/.config/users.xml')).toBe('Config/users.xml')
  expect(to('library/.config/sessions.xml')).toBe('Config/sessions.xml')
  expect(to('library/.config/ask-counts.xml')).toBe('Config/ask-counts.xml')
  expect(to('library/.config/ai-keys.xml')).toBe('Config/ai/anarchy2/.config/ai-keys.xml')
  expect(to('library/sr6/.config/ai-keys.xml')).toBe('Config/ai/sr6/.config/ai-keys.xml')
  expect(to('library/backgrounds/b.webp')).toBe('Data/assets/anarchy2/backgrounds/b.webp')
  expect(to('library/sr6/backgrounds/c.webp')).toBe('Data/assets/sr6/backgrounds/c.webp')
  expect(to('library/.backups/old.zip')).toBe('Backups/old.zip')
  expect(p.skipped.map(norm).some((s: string) => s.endsWith('.upload-1/tmp.pdf'))).toBe(true) // scratch stays behind
  expect(p.entries.every((e: { sha256: string; src: string }) => e.sha256 === sha(e.src))).toBe(true)
  expect(p.unresolved).toEqual([])
  expect(existsSync(cfg.dataPath)).toBe(false) // a dry run writes nothing, not even the backup
  expect(existsSync(join(cfg.charDir, 'ada', 'r1.xml'))).toBe(true)
  expect(await startGuard(cfg)).toMatch(/old layout/)
})

test('migrator refuses while the job queue is not drained, and moves nothing', async () => {
  const cases = [
    ['busy-job', { jobs: [{ game: 'ca2', id: 'b', steps: [] }], batches: { ca2: null, sr6: null } }],
    ['busy-batch', { jobs: [], batches: { ca2: { queued: ['b'] }, sr6: null } }],
  ] as const
  for (const [name, jobs] of cases) {
    const { cfg } = oldTree(name)
    put(join(cfg.libraryDir, '.config', 'jobs.json'), JSON.stringify(jobs))
    const r = await migrate(cfg, { ...quiet, apply: true })
    expect(r.status, name).toBe('refused')
    expect(r.plan.refused[0]).toMatch(/import was in progress/)
    expect(existsSync(join(cfg.charDir, 'ada', 'r1.xml'))).toBe(true)
    expect(existsSync(cfg.dataPath)).toBe(false)
  }
  const { cfg } = oldTree('idle') // an idle queue (no file, or empty lists) is fine
  put(join(cfg.libraryDir, '.config', 'jobs.json'), JSON.stringify({ jobs: [], batches: { ca2: null, sr6: null } }))
  expect((await migrate(cfg, quiet)).status).toBe('planned')
})

test('migrator apply: backup first, every file moved and verified, old roots to _to_delete, a second run is a no-op', async () => {
  const { cfg } = oldTree('apply')
  const before = new Map<string, string>()
  const r0 = await migrate(cfg, quiet)
  for (const e of r0.plan.entries) before.set(e.dst, sha(e.src))
  let backedUp = false
  const r = await migrate(cfg, { ...quiet, apply: true, backup: async (a: unknown, o: string) => ((backedUp = existsSync(cfg.charDir)), fakeBackup(a, o)) })
  expect(r.status).toBe('applied')
  expect(backedUp).toBe(true) // the old tree was still whole when the backup ran
  for (const [to, h] of before) expect(sha(to), to).toBe(h)
  expect(existsSync(cfg.charDir) || existsSync(cfg.customDir) || existsSync(cfg.libraryDir)).toBe(false)
  for (const n of ['charDir', 'customDir', 'libraryDir']) expect(existsSync(join(r.toDelete, n))).toBe(true)
  expect(existsSync(join(r.toDelete, 'libraryDir', '.upload-1', 'tmp.pdf'))).toBe(true) // scratch kept, not deleted
  expect(readdirSync(join(cfg.dataPath, 'Backups')).some(f => /^pre-migration-.*\.zip$/.test(f))).toBe(true)
  expect(JSON.parse(readFileSync(r.manifest, 'utf8')).complete).toBe(true)
  expect((await migrate(cfg, quiet)).status).toBe('noop')
  expect(await startGuard(cfg)).toBeNull()
})

test('migrator: no backup, no move; a taken target and an overlapping folder are refused', async () => {
  const a = oldTree('nobackup')
  const bad = await migrate(a.cfg, { apply: true, log: () => {}, guard: async () => null, backup: async () => ({ entries: 0 }) })
  expect(bad.status).toBe('refused')
  expect(existsSync(join(a.cfg.charDir, 'ada', 'r1.xml'))).toBe(true)
  const t = oldTree('taken')
  put(join(t.cfg.dataPath, 'Config', 'users.xml'), 'a new account was made first')
  const r = await migrate(t.cfg, quiet)
  expect(r.status).toBe('refused')
  expect(r.plan.refused.join()).toMatch(/already exists/)
  const o = oldTree('overlap')
  expect((await migrate({ ...o.cfg, dataPath: o.cfg.charDir }, quiet)).status).toBe('refused')
})

test('migrator renames an account called sr6 (users, campaigns, its folders) and keeps the originals', async () => {
  const users = '<ca2:users version="1"><user id="u1" username="sr6" name="Old"/><user id="u2" username="ada"/></ca2:users>'
  const { cfg } = oldTree('sr6acct', users)
  const c = cfg.charDir
  put(join(c, 'sr6', 'mine.xml'), 'ca2 runner of the account sr6')
  put(join(c, 'sr6', '.trash', 'm-1.xml'), 'its trash')
  put(join(c, '.npcs', 'sr6', 'n.xml'), 'its npc')
  put(
    join(cfg.customDir, 'campaigns.xml'),
    '<ca2:campaigns><campaign id="c1"><gm user="sr6"/><member user="ada"/><lock key="k" by="sr6"/></campaign></ca2:campaigns>',
  )
  const dry = await migrate(cfg, quiet)
  expect(dry.plan.renames).toEqual([{ from: 'sr6', to: 'sr6-1' }])
  expect(dst(dry.plan, 'sr6/mine.xml')).toMatch(/Data\/systems\/anarchy2\/characters\/sr6-1\/mine\.xml$/)
  expect(dst(dry.plan, 'sr6/.trash/m-1.xml')).toMatch(/anarchy2\/characters\/sr6-1\/\.trash\/m-1\.xml$/)
  expect(dst(dry.plan, '.npcs/sr6/n.xml')).toMatch(/anarchy2\/npcs\/sr6-1\/n\.xml$/)
  expect(dst(dry.plan, 'sr6/ada/s1.xml')).toMatch(/Data\/systems\/sr6\/characters\/ada\/s1\.xml$/) // the SR6 game's own tree is unaffected
  const r = await migrate(cfg, { ...quiet, apply: true })
  expect(r.status).toBe('applied')
  const cfgDir = join(cfg.dataPath, 'Config')
  expect(readFileSync(join(cfgDir, 'users.xml'), 'utf8')).toBe(users.replace('username="sr6"', 'username="sr6-1"'))
  const camp = readFileSync(join(cfg.dataPath, 'Data', 'systems', 'anarchy2', 'campaigns.xml'), 'utf8')
  expect(camp).toContain('<gm user="sr6-1"/>')
  expect(camp).toContain('by="sr6-1"')
  expect(camp).toContain('<member user="ada"/>')
  expect(readFileSync(join(r.toDelete, 'pre-rename', 'Config-users.xml'), 'utf8')).toBe(users) // the original, kept
})

test('migrator resumes from its manifest after a move fails', async () => {
  const { cfg } = oldTree('resume')
  const blocker = join(cfg.dataPath, 'Data', 'systems', 'anarchy2', 'npcs')
  put(blocker, 'a file where a folder must go') // mkdir of npcs/ada fails
  const first = await migrate(cfg, { ...quiet, apply: true })
  expect(first.status).toBe('partial')
  expect(existsSync(cfg.charDir)).toBe(true) // old roots stay while anything is left
  rmSync(blocker)
  const second = await migrate(cfg, { ...quiet, apply: true })
  expect(second.status).toBe('applied')
  expect(second.manifest).toBe(first.manifest) // the same manifest, continued
  expect(readFileSync(join(blocker, 'ada', 'n1.xml'), 'utf8')).toBe('ca2 npc')
  expect(existsSync(cfg.charDir)).toBe(false)
})

test('migrator resumes a rewrite entry whose file was rewritten before the manifest was saved (crash window)', async () => {
  const users = '<ca2:users version="1"><user id="u1" username="sr6"/></ca2:users>'
  const { cfg } = oldTree('rewrite-crash', users)
  const r = await migrate(cfg, { ...quiet, apply: true })
  expect(r.status).toBe('applied')
  const m = JSON.parse(readFileSync(r.manifest, 'utf8'))
  m.complete = false
  for (const e of m.entries) if (e.rewrite) e.state = 'pending' // the save that never happened
  writeFileSync(r.manifest, JSON.stringify(m))
  const again = await migrate(cfg, { ...quiet, apply: true })
  expect(again.status).toBe('applied')
  expect(readFileSync(join(cfg.dataPath, 'Config', 'users.xml'), 'utf8')).toContain('username="sr6-1"')
})

test('migrator refuses --apply in a container unless the data path is a mount point, and when the queue file is unreadable', async () => {
  const dir = join(root, 'ctr')
  mkdirSync(dir, { recursive: true })
  const real = realpathSync(dir)
  expect(await containerGuard(dir, { container: false })).toBeNull()
  expect(await containerGuard(dir, { container: true, mounts: '1 2 3:4 / /other rw - ext4 x rw' })).toMatch(/not a mounted volume/)
  expect(await containerGuard(dir, { container: true, mounts: `1 2 3:4 / ${real} rw - ext4 x rw` })).toBeNull()
  expect(await containerGuard(join(dir, 'missing'), { container: true, mounts: '' })).toMatch(/not a mounted volume/)
  const a = oldTree('ctr-apply')
  const r = await migrate(a.cfg, { ...quiet, apply: true, guard: async () => 'not a mounted volume' })
  expect(r.status).toBe('refused')
  expect(existsSync(join(a.cfg.charDir, 'ada', 'r1.xml'))).toBe(true)
  expect(existsSync(a.cfg.dataPath)).toBe(false)
  const b = oldTree('jobs-unreadable')
  mkdirSync(join(b.cfg.libraryDir, '.config', 'jobs.json')) // a jobs.json that can't be read as a file
  const r2 = await migrate(b.cfg, quiet)
  expect(r2.status).toBe('refused')
  expect(r2.plan.refused[0]).toMatch(/can’t be read/)
})
