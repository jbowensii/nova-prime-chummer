import { test, expect, type Page } from '@playwright/test'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { usersFile } from '../server/auth.mjs'
import { createServer } from '../server/server.mjs'

// 0.7.0 NPCs & Critters end to end, on a server of its own (all names made up): Eve and Gus are editors (GMs), Ada the
// admin, Pat a player. Runs in order. Screenshots go to .extract/ (not committed).
const PW = { ada: 'ada-password-1', eve: 'eve-password-1', gus: 'gus-password-1', pat: 'pat-password-1' }
const SHOTS = '.extract/screenshots/0.7.0'
let server: ReturnType<typeof createServer>, base = '', origin = ''

test.describe.configure({ mode: 'serial' })
test.use({ baseURL: async ({}, use) => use(base), storageState: { cookies: [], origins: [] } })

test.beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ca2-npcs-e2e-')), config = join(dir, 'library', '.config')
  cpSync('tests/fixtures/mini/custom', join(dir, 'custom'), { recursive: true })
  mkdirSync(config, { recursive: true })
  writeFileSync(join(config, 'users.xml'), await usersFile([{ username: 'ada', password: PW.ada, name: 'Ada Admin' },
    { username: 'eve', password: PW.eve, role: 'editor', name: 'Eve Editor' },
    { username: 'gus', password: PW.gus, role: 'editor', name: 'Gus Editor' },
    { username: 'pat', password: PW.pat, role: 'player', name: 'Pat Player' }]))
  server = createServer({ staticDir: 'dist', charDir: join(dir, 'characters'), customDir: join(dir, 'custom'), libraryDir: join(dir, 'library') })
  await new Promise<void>((ok, fail) => server.once('error', fail).listen(0, '127.0.0.1', ok))
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  base = `${origin}/`
  mkdirSync(SHOTS, { recursive: true })
})
test.afterAll(() => { server.stopJobs(); server.close() })

async function signIn(page: Page, username: keyof typeof PW) {
  await page.context().clearCookies()
  await page.goto('/')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password', { exact: true }).fill(PW[username])
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Your runners' })).toBeVisible()
}
const api = (page: Page, method: string, path: string, data?: unknown) =>
  page.request.fetch(`${base}api/${path}`, { method, data, headers: { Origin: origin } })
const saved = (page: Page) => expect(page.getByRole('status', { name: 'Save status' })).toContainText('All changes saved')
const row = (page: Page, name: string) => page.locator('.dossier').filter({ has: page.getByRole('link', { name, exact: true }) })
async function newNpc(page: Page, kind: string, tier: string, meta?: string) {
  await page.goto('/#/npcs')
  await page.getByRole('button', { name: 'New NPC' }).click()
  const d = page.getByRole('dialog', { name: 'New NPC' })
  await d.getByLabel('Kind').selectOption({ label: kind })
  await d.getByLabel('Tier').selectOption({ label: tier })
  if (meta) await d.getByLabel('Metatype').selectOption({ label: meta })
  await d.getByRole('button', { name: 'Create NPC' }).click()
  await expect(page).toHaveURL(/#\/n\/[^/]+\/concept$/)
}
async function shots(page: Page, name: string) {
  const theme = (t: string) => page.evaluate(t => { localStorage.setItem('ca2.settings.v1', JSON.stringify({ theme: t })); document.documentElement.dataset.theme = t }, t)
  await theme('light'); await page.screenshot({ path: `${SHOTS}/${name}-light.png`, fullPage: true })
  await theme('dark'); await page.screenshot({ path: `${SHOTS}/${name}-dark.png`, fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${name} scrolls sideways`).toBeLessThanOrEqual(0)
  await page.screenshot({ path: `${SHOTS}/${name}-phone.png`, fullPage: true })
  await page.setViewportSize({ width: 1400, height: 900 })
  await theme('light')
}
const NPC_FILE = `<?xml version="1.0" encoding="UTF-8"?>
<ca2:character xmlns:ca2="urn:chummer-anarchy2:character:1" formatVersion="1" id="npc-wisp-1" streetName="Made-up Wisp" metatype="" level="runner" package="free" updatedAt="2026-10-02T00:00:00.000Z">
  <npc kind="spirit" tier="regular" fightingSpirit="low"/>
  <build><attributes str="2" agi="5" wil="4" log="3" cha="3"/></build>
</ca2:character>
`
const RUNNER_FILE = NPC_FILE.replace(/  <npc[^\n]*\n/, '').replace('npc-wisp-1', 'runner-1').replace('Made-up Wisp', 'Plain Runner').replace('metatype=""', 'metatype="human"')

test('an editor makes a regular NPC: NPC mode editor, it saves and lists; the runner list never shows it', async ({ page }) => {
  await signIn(page, 'eve')
  await page.getByRole('link', { name: 'NPCs' }).click()
  await expect(page.getByRole('heading', { name: 'NPCs & Critters' })).toBeVisible()
  await newNpc(page, 'NPC', 'Regular')
  await page.getByLabel('Street name').fill('Ganger Boss')
  await page.getByLabel('Fighting spirit').selectOption('high')
  await expect(page.getByLabel('Level of play')).toHaveCount(0)
  await expect(page.locator('.topbar .npckind')).toHaveText('NPC')
  await expect(page.locator('.topbar .npctier')).toHaveText('Regular')
  await expect(page.locator('aside.receipt')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Ledger' })).toHaveCount(0)
  await saved(page)
  await shots(page, 'npc-concept')

  await page.getByRole('link', { name: 'Attributes' }).click()
  await page.getByRole('button', { name: 'Raise Brawn' }).click()
  await page.getByRole('link', { name: 'Skills' }).click()
  await page.getByLabel('New knowledge skill').fill('Gang turf')
  await page.getByRole('button', { name: /^Add knowledge skill/ }).click()
  await page.getByRole('link', { name: 'Review' }).click()
  await expect(page.getByRole('heading', { name: 'Finalize' })).toHaveCount(0)
  await saved(page)
  await page.getByRole('button', { name: 'Save and close' }).click()
  await expect(page).toHaveURL(/#\/npcs$/)
  const r = row(page, 'Ganger Boss')
  await expect(r.locator('.npckind')).toHaveText('NPC')
  await expect(r.locator('.npctier')).toHaveText('Regular')

  await r.getByRole('link', { name: 'Ganger Boss' }).click()
  await expect(page.getByLabel('Fighting spirit')).toHaveValue('high')
  await page.getByRole('link', { name: 'Skills' }).click()
  await expect(page.getByRole('table', { name: 'Knowledge' }).locator('input').first()).toHaveValue('Gang turf')

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Your runners' })).toBeVisible()
  await expect(page.getByText('Ganger Boss')).toHaveCount(0)
})

test('a critter with no metatype; import an NPC file (a runner file is refused); export for Foundry carries npc', async ({ page }) => {
  await signIn(page, 'eve')
  await newNpc(page, 'Critter', 'Prime')
  await expect(page.getByLabel('Metatype')).toHaveValue('')
  await page.getByLabel('Street name').fill('Made-up Hound')
  await page.getByRole('link', { name: 'Attributes' }).click()
  for (let i = 0; i < 8; i++) await page.getByRole('button', { name: 'Raise Brawn' }).click()
  await saved(page)
  await page.goto('/#/npcs')
  await expect(row(page, 'Made-up Hound').locator('.meta')).toContainText('Critter')

  await page.locator('input[type=file]').setInputFiles([
    { name: 'wisp.xml', mimeType: 'application/xml', buffer: Buffer.from(NPC_FILE) },
    { name: 'runner.xml', mimeType: 'application/xml', buffer: Buffer.from(RUNNER_FILE) }])
  const msg = page.getByRole('status')
  await expect(msg).toContainText('Imported Made-up Wisp.')
  await expect(msg).toContainText('runner.xml: this is a runner, not an NPC')
  await expect(row(page, 'Made-up Wisp').locator('.npckind')).toHaveText('Spirit')
  await shots(page, 'npcs-list')

  await page.getByRole('button', { name: 'Export for Foundry…' }).click()
  const d = page.getByRole('dialog', { name: 'Export NPCs for Foundry' })
  await d.getByRole('button', { name: 'All' }).click()
  const download = page.waitForEvent('download')
  await d.getByRole('button', { name: 'Download 3 NPCs' }).click()
  const file = JSON.parse(readFileSync(await (await download).path(), 'utf8'))
  const byName = Object.fromEntries(file.runners.map((r: { streetName: string; npc: unknown }) => [r.streetName, r.npc]))
  expect(byName['Made-up Hound']).toEqual({ kind: 'critter', tier: 'prime' })
  expect(byName['Made-up Wisp']).toEqual({ kind: 'spirit', tier: 'regular', fightingSpirit: 'low' })

  // the runner list refuses an NPC file
  await page.goto('/')
  await page.locator('input[type=file]').setInputFiles({ name: 'wisp.xml', mimeType: 'application/xml', buffer: Buffer.from(NPC_FILE) })
  await expect(page.getByRole('status')).toContainText('wisp.xml: this is an NPC, not a runner')
})

test('share with a campaign: its co-GM reads and prints it; unshare', async ({ page }) => {
  await signIn(page, 'eve')
  const camp = await (await api(page, 'POST', 'campaigns', { name: 'Made-up Run', note: '' })).json()
  await signIn(page, 'ada')
  expect((await api(page, 'POST', `campaigns/${camp.id}/gms`, { user: 'gus' })).ok()).toBe(true)

  await signIn(page, 'eve')
  await page.goto('/#/npcs')
  await row(page, 'Ganger Boss').getByRole('button', { name: 'Share with campaign…' }).click()
  const d = page.getByRole('dialog', { name: 'Share Ganger Boss with a campaign' })
  await d.getByLabel('Campaign').selectOption({ label: 'Made-up Run' })
  await d.getByRole('button', { name: 'Share' }).click()
  await expect(page.getByRole('status')).toHaveText('Ganger Boss is shared with Made-up Run.')
  await expect(row(page, 'Ganger Boss').getByRole('link', { name: 'Made-up Run' })).toBeVisible()

  await signIn(page, 'gus')
  await page.goto('/#/npcs')
  const theirs = page.getByRole('region', { name: 'Eve Editor’s NPCs' })
  await expect(theirs.getByRole('link', { name: 'Ganger Boss', exact: true })).toBeVisible()
  await expect(theirs.getByRole('button', { name: 'Delete' })).toHaveCount(0)
  await expect(theirs.getByRole('link', { name: 'Print Ganger Boss' })).toBeVisible()
  await shots(page, 'npcs-shared')
  await theirs.getByRole('link', { name: 'Ganger Boss', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Read only' })).toContainText('Eve Editor’s NPC')
  await expect(page.getByLabel('Street name')).toBeDisabled()

  await signIn(page, 'eve')
  await page.goto('/#/npcs')
  await row(page, 'Ganger Boss').getByRole('button', { name: 'Unshare' }).click()
  await expect(page.getByRole('status')).toHaveText('Ganger Boss is no longer shared with Made-up Run.')
  await expect(row(page, 'Ganger Boss').getByRole('link', { name: 'Made-up Run' })).toHaveCount(0)
})

test('a player has no NPCs link, and #/npcs says only GMs can see NPCs', async ({ page }) => {
  await signIn(page, 'pat')
  await expect(page.getByRole('link', { name: 'NPCs' })).toHaveCount(0)
  await page.goto('/#/npcs')
  await expect(page.getByText('Only GMs can see NPCs.')).toBeVisible()
  await shots(page, 'npcs-player')
})
