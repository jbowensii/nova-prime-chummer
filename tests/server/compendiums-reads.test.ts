// @vitest-environment node
// The compendium lists read campaigns.xml once per request, not twice per campaign-shared row (server/compendiums.mjs
// shared() and readable(), through campaigns.snapshot()).
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, vi } from 'vitest'
// @ts-expect-error plain JS module
import { campaignsApi } from '../../server/campaigns.mjs'
// @ts-expect-error plain JS module
import { compendiumsApi } from '../../server/compendiums.mjs'

const reads = vi.hoisted(() => ({ n: 0 }))
vi.mock('node:fs/promises', async importOriginal => {
  const fs = await importOriginal<typeof import('node:fs/promises')>()
  return { ...fs, readFile: (path: string, ...rest: unknown[]) => {
    if (String(path).endsWith('campaigns.xml')) reads.n++
    return (fs.readFile as (...a: unknown[]) => Promise<unknown>)(path, ...rest)
  } }
})

const dir = mkdtempSync(join(tmpdir(), 'ca2-compreads-'))
const CID = 'c1c1c1c1c1c1', ROWS = 5
mkdirSync(join(dir, 'custom'), { recursive: true })
writeFileSync(join(dir, 'custom', 'campaigns.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<ca2:campaigns xmlns:ca2="urn:chummer-anarchy2:config:1" version="1">\n'
  + `  <campaign id="${CID}" name="Seattle" created="2026-10-12T00:00:00Z">\n    <gm user="eve"/>\n    <gm user="gil"/>\n    <member user="pat"/>\n  </campaign>\n</ca2:campaigns>\n`)
const comps = join(dir, 'chars', '.compendiums', 'eve')
mkdirSync(comps, { recursive: true })
for (let i = 0; i < ROWS; i++) {
  const id = `a${i}`.padEnd(12, '0')
  writeFileSync(join(comps, `${id}.xml`), `<?xml version="1.0" encoding="UTF-8"?>\n<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="compendium" `
    + `version="1" id="${id}" name="Kit ${i}" source="KIT${i}" sharing="campaign" campaign="${CID}" rev="1">\n</ca2:data>\n`)
}
const users: Record<string, { username: string; role: string }> = { 'eve-id': { username: 'eve', role: 'editor' }, 'pat-id': { username: 'pat', role: 'player' },
  'gil-id': { username: 'gil', role: 'editor' } }
const auth = { usernames: () => ['eve', 'gil', 'pat'], roleOf: (u: string) => (u === 'pat' ? 'player' : 'editor'), nameOf: (u: string) => u,
  current: (id: string) => users[id] }
const lock = (fn: () => unknown) => fn()
const campaigns = campaignsApi({ customDir: join(dir, 'custom'), lock, auth, runnersOf: async () => [], writeRunner: async () => {} })
const api = compendiumsApi({ home: join(dir, 'chars'), sourceFiles: [], lock, auth, campaigns })

const get = async (path: string, who: string) => {
  let out: { code: number; body: unknown } | null = null
  reads.n = 0
  await api.handle({ method: 'GET', headers: {} }, {}, new URL(`http://x${path}`), (_res: unknown, code: number, body: unknown) => { out = { code, body } }, { id: who })
  return { ...out!, reads: reads.n }
}

test('a player in the campaign gets every campaign-shared row from one read of campaigns.xml', async () => {
  const r = await get('/api/compendiums/shared', 'pat-id')
  expect(r.code).toBe(200)
  expect((r.body as unknown[]).length).toBe(ROWS)
  expect(r.reads).toBe(1)
})

test('another GM of the campaign (an editor) reads them from one read of campaigns.xml too', async () => {
  const r = await get('/api/compendiums', 'gil-id')
  expect(r.code).toBe(200)
  expect((r.body as unknown[]).length).toBe(ROWS)
  expect(r.reads).toBe(1)
})
