import { test, expect, type Page } from '@playwright/test'
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { usersFile } from '../server/auth.mjs'
import { createServer } from '../server/server.mjs'
import { anarchyState } from './session'

// Phase 3 end to end: players' runners use GM compendiums, in each game, on a server of its own with the made-up mini and
// SR6 fixtures. Eve (editor) shares Table Kit with the table, Camp Kit with her campaign and keeps Secret Kit private; Pat
// (player) picks Table Kit's entry (marked House) for a new runner, sees Camp Kit's only once the runner is in that
// campaign, never Secret Kit's; Eve deletes Table Kit and Pat's runner keeps its entry, noted on Review. Every name and value
// made up. Runs in order.
const PW = { eve: 'eve-password-1', pat: 'pat-password-1' }
let server: ReturnType<typeof createServer>,
  base = ''
let cookie = '' // Eve's session, for the API
const CA2 = { table: 'a1a1a1a1a1a1', camp: 'a2a2a2a2a2a2', secret: 'a3a3a3a3a3a3' },
  SR6 = { table: 'b1b1b1b1b1b1', secret: 'b3b3b3b3b3b3' }
let campaign = ''

test.describe.configure({ mode: 'serial' })
test.use({ baseURL: async ({}, use) => use(base), storageState: async ({}, use) => use(anarchyState(base)), viewport: { width: 1400, height: 900 } })

const origin = () => base.replace(/\/$/, '')
const api = (method: string, path: string, body?: string, type = 'application/xml') =>
  fetch(`${origin()}${path}`, { method, body, headers: { Origin: origin(), Cookie: cookie, ...(body ? { 'Content-Type': type } : {}) } })
const ca2 = (id: string, name: string, source: string, sharing: string, item: string) =>
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  `<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="compendium" version="1" id="${id}" name="${name}" source="${source}" ${sharing} updatedAt="2026-10-05T00:00:00.000Z">` +
  `<item id="${source.toLowerCase()}.blade" kind="weapon" dv="STR+2" ranges="OK/-/-/-" source="${source}" page="1"><name>${item}</name><text>Made up.</text></item></ca2:data>\n`
const sr6 = (id: string, name: string, source: string, sharing: string, item: string) =>
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  `<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="compendium" version="1" id="${id}" name="${name}" source="${source}" ${sharing} updatedAt="2026-10-05T00:00:00.000Z">` +
  `<gear id="${source.toLowerCase()}.torch" source="${source}" page="1" category="tools" avail="1" cost="25"><name>${item}</name><text>Made up.</text></gear></sr6:data>\n`

test.beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ca2-player-comp-e2e-')),
    config = join(dir, 'library', '.config')
  cpSync('tests/fixtures/mini/custom', join(dir, 'custom'), { recursive: true })
  cpSync('tests/fixtures/sr6/custom', join(dir, 'custom', 'sr6'), { recursive: true })
  mkdirSync(config, { recursive: true })
  writeFileSync(
    join(config, 'users.xml'),
    await usersFile([
      { username: 'eve', password: PW.eve, role: 'editor', name: 'Eve Editor' },
      { username: 'pat', password: PW.pat, role: 'player', name: 'Pat Player' },
    ]),
  )
  server = createServer({ staticDir: 'dist', charDir: join(dir, 'characters'), customDir: join(dir, 'custom'), libraryDir: join(dir, 'library') })
  await new Promise<void>((ok, fail) => server.once('error', fail).listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/`
  const r = await fetch(`${origin()}/api/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ username: 'eve', password: PW.eve }),
    headers: { 'Content-Type': 'application/json', Origin: origin() },
  })
  cookie = r.headers
    .getSetCookie()
    .find(c => /session=/.test(c))!
    .split(';')[0]
  campaign = (await (await api('POST', '/api/campaigns', JSON.stringify({ name: 'Seattle' }), 'application/json')).json()).id
  expect((await api('POST', `/api/campaigns/${campaign}/members`, JSON.stringify({ user: 'pat' }), 'application/json')).ok).toBe(true)
  for (const [id, xml] of [
    [CA2.table, ca2(CA2.table, 'Table Kit', 'KIT', 'sharing="table"', 'Kit Blade')],
    [CA2.camp, ca2(CA2.camp, 'Camp Kit', 'CAMPKIT', `sharing="campaign" campaign="${campaign}"`, 'Camp Club')],
    [CA2.secret, ca2(CA2.secret, 'Secret Kit', 'SECRET', 'sharing="private"', 'Secret Knife')],
  ])
    expect((await api('PUT', `/api/compendiums/${id}`, xml)).status).toBe(201)
  for (const [id, xml] of [
    [SR6.table, sr6(SR6.table, 'Table Kit Six', 'SKIT', 'sharing="table"', 'Kit Torch')],
    [SR6.secret, sr6(SR6.secret, 'Secret Six', 'SSECRET', 'sharing="private"', 'Secret Torch')],
  ])
    expect((await api('PUT', `/api/sr6/compendiums/${id}`, xml)).status).toBe(201)
})
test.afterAll(() => {
  server.stopJobs()
  server.close()
})

async function signIn(page: Page, path: string) {
  await page.goto(path)
  await page.getByLabel('Username').fill('pat')
  await page.getByLabel('Password', { exact: true }).fill(PW.pat)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Your runners' })).toBeVisible()
}
const saved = (page: Page, text: string) =>
  page.waitForResponse(r => r.request().method() === 'PUT' && /\/api\/(sr6\/)?characters\//.test(r.url()) && !!r.request().postData()?.includes(text))

test('Anarchy: a player picks a table-shared entry, marked House; a campaign one only in that campaign; a private one never', async ({ page }) => {
  await signIn(page, '/')
  await page.getByRole('button', { name: 'New runner' }).click()
  await page.getByRole('button', { name: 'Create runner' }).click()
  await page.getByLabel('Street name').fill('Pat Blade')
  await expect(page).toHaveURL(/#\/c\/[^/]+\//)
  const id = page.url().match(/#\/c\/([^/]+)\//)![1]
  await page.goto(`/#/c/${id}/gear`)
  const weapons = page.locator('section', { has: page.getByRole('heading', { name: 'Weapons' }) })
  await weapons.getByRole('button', { name: 'Add from the book' }).click()
  const picker = page.getByRole('dialog').last()
  await expect(picker.locator('.picker li', { hasText: 'Kit Blade' }).locator('.house')).toHaveText('House · Table Kit')
  await expect(picker.locator('.picker li', { hasText: 'Secret Knife' })).toHaveCount(0)
  await expect(picker.locator('.picker li', { hasText: 'Camp Club' })).toHaveCount(0) // the runner is in no campaign
  const done = saved(page, 'Kit Blade')
  await picker.locator('.picker li', { hasText: 'Kit Blade' }).click()
  expect((await done).status()).toBeLessThan(300)
  const row = weapons.locator('tr', { hasText: 'Kit Blade' })
  await expect(row).toContainText('DV 3 [OK/-/-/-]')
  await expect(row.locator('.house')).toHaveText('House · Table Kit')
  // nobody writes a compendium through the player's account
  expect((await page.request.get('/api/compendiums')).status()).toBe(403)

  // in Eve's campaign, Camp Kit's entry is offered too
  expect((await page.request.post(`/api/campaigns/${campaign}/runners`, { data: { id }, headers: { Origin: origin() } })).ok()).toBe(true)
  await page.reload()
  await weapons.getByRole('button', { name: 'Add from the book' }).click()
  await expect(page.getByRole('dialog').last().locator('.picker li', { hasText: 'Camp Club' }).locator('.house')).toHaveText('House · Camp Kit')
  await page.getByRole('button', { name: 'Close', exact: true }).click()

  // Eve deletes Table Kit: the runner keeps Kit Blade, and Review says its source is gone
  expect((await api('DELETE', `/api/compendiums/${CA2.table}`)).status).toBe(204)
  await page.reload()
  await expect(weapons.locator('tr', { hasText: 'Kit Blade' })).toContainText('DV 3 [OK/-/-/-]')
  await page.goto(`/#/c/${id}/review`)
  await expect(page.getByText('Kit Blade: its source KIT is no longer available; the runner keeps its own copy.')).toBeVisible()
})

test('SR6: a player buys a table-shared entry, marked House; once deleted the runner keeps it at its price', async ({ page }) => {
  await signIn(page, '/#/sr6')
  await page.getByRole('button', { name: 'New runner' }).click()
  await page.getByRole('dialog', { name: 'New runner' }).getByLabel('Street name').fill('Pat Torch')
  await page.getByRole('dialog', { name: 'New runner' }).getByRole('button', { name: 'Create runner' }).click()
  await expect(page).toHaveURL(/#\/sr6\/c\/[^/]+\/concept$/)
  const id = page.url().match(/#\/sr6\/c\/([^/]+)\//)![1]
  await page.getByRole('navigation', { name: 'Character sections' }).getByRole('link').filter({ hasText: 'Gear' }).click()
  await page.getByRole('button', { name: 'Add other gear…' }).click()
  const picker = page.getByRole('dialog', { name: 'Add other gear' })
  await expect(picker.locator('.picker li', { hasText: 'Kit Torch' }).locator('.house')).toHaveText('House · Table Kit Six')
  await expect(picker.locator('.picker li', { hasText: 'Secret Torch' })).toHaveCount(0)
  const done = saved(page, 'skit.torch')
  await picker.locator('.picker li', { hasText: 'Kit Torch' }).click()
  // (the picker's quantity step: confirm it)
  if (await picker.getByRole('button', { name: 'Add', exact: true }).count()) await picker.getByRole('button', { name: 'Add', exact: true }).click()
  expect((await done).status()).toBeLessThan(300)
  const row = page.locator('section', { has: page.getByRole('heading', { name: 'Other gear' }) }).locator('tr', { hasText: 'Kit Torch' })
  await expect(row).toContainText('25¥')
  expect((await page.request.get('/api/sr6/compendiums')).status()).toBe(403)

  expect((await api('DELETE', `/api/sr6/compendiums/${SR6.table}`)).status).toBe(204)
  await page.reload()
  await expect(row).toContainText('25¥')
  await expect(row).not.toContainText('no longer in the catalog')
  await page.goto(`/#/sr6/c/${id}/review`)
  await expect(page.getByText('Kit Torch: its source SKIT is no longer available; the runner keeps its own copy.')).toBeVisible()
})
