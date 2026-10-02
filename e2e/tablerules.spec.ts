import { test, expect, type Page } from '@playwright/test'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { usersFile } from '../server/auth.mjs'
import { createServer } from '../server/server.mjs'
import { anarchyState } from './session'

// The Rules page is the GMs' (admin and editors): they switch table rules on and off and write house rules; players get
// a read-only Table rules page. On a server of its own with the made-up books (tests/fixtures/mini/custom): one optional
// rule, "Long haggles" (TEST p.42), off, and one house rule, on. Runs in order. Screenshots go to .extract/ (not committed).
const PW = { ada: 'ada-password-1', eve: 'eve-password-1', pat: 'pat-password-1' }
const SHOTS = '.extract/screenshots/0.4.1'
const PHONE = { width: 390, height: 844 }
let server: ReturnType<typeof createServer>, base = '', dir = ''

test.describe.configure({ mode: 'serial' })
test.use({ baseURL: async ({}, use) => use(base), storageState: async ({}, use) => use(anarchyState(base)) })

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'ca2-tablerules-'))
  cpSync('tests/fixtures/mini/custom', join(dir, 'custom'), { recursive: true })
  mkdirSync(join(dir, 'library', '.config'), { recursive: true })
  writeFileSync(join(dir, 'library', '.config', 'users.xml'), await usersFile([{ username: 'ada', password: PW.ada, name: 'Ada Admin' },
    { username: 'eve', password: PW.eve, role: 'editor', name: 'Eve Editor' }, { username: 'pat', password: PW.pat, role: 'player', name: 'Pat Player' }]))
  server = createServer({ staticDir: 'dist', charDir: join(dir, 'characters'), customDir: join(dir, 'custom'), libraryDir: join(dir, 'library'),
    python: [process.execPath, 'tests/fixtures/stub-worker.mjs'] })
  await new Promise<void>((ok, fail) => server.once('error', fail).listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/`
  mkdirSync(SHOTS, { recursive: true })
})
test.afterAll(() => { server.stopJobs(); server.close() })

async function signIn(page: Page, username: keyof typeof PW) {
  await page.goto('/')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password', { exact: true }).fill(PW[username])
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Your runners' })).toBeVisible()
}
/** Light, dark and phone (dark) screenshots of the page as it is. */
async function shots(page: Page, name: string) {
  const theme = (t: string) => page.evaluate(t => { localStorage.setItem('ca2.settings.v1', JSON.stringify({ theme: t })); document.documentElement.dataset.theme = t }, t)
  await theme('light')
  await page.screenshot({ path: `${SHOTS}/${name}-light.png`, fullPage: true })
  await theme('dark')
  await page.screenshot({ path: `${SHOTS}/${name}-dark.png`, fullPage: true })
  await page.setViewportSize(PHONE)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${name} scrolls sideways`).toBeLessThanOrEqual(0)
  await page.screenshot({ path: `${SHOTS}/${name}-phone.png`, fullPage: true })
  await page.setViewportSize({ width: 1400, height: 900 })
  await theme('light')
}

test('the admin finds AI settings in Settings', async ({ page }) => {
  await signIn(page, 'ada')
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('link', { name: 'Open AI settings' }).click()
  await expect(page).toHaveURL(/#\/books\/ai$/)
  await expect(page.getByRole('dialog')).toBeHidden()
})

test('an editor switches table rules on and writes house rules on the Rules page', async ({ page }) => {
  await signIn(page, 'eve')
  await page.getByRole('link', { name: 'Rules', exact: true }).click()
  const gm = page.getByRole('region', { name: 'Table rules' })
  const haggles = gm.getByRole('switch', { name: 'Long haggles' })
  await expect(haggles).not.toBeChecked()
  await expect(gm.getByText('Invented: a price is argued over three made-up rounds.')).toBeVisible()
  await haggles.click() // saved first, then shown on
  await expect(haggles).toBeChecked()
  await expect(gm.getByRole('status')).toHaveText('Long haggles is on.')

  await gm.getByRole('button', { name: 'Add a house rule' }).click()
  let form = page.getByRole('dialog', { name: 'Add a house rule' })
  await form.getByLabel('Name').fill('Quiet streets')
  await form.getByLabel('Description').fill('Made up: no drive-bys in the first scene.')
  await form.getByRole('button', { name: 'Save house rule' }).click()
  await expect(gm.getByRole('status')).toHaveText('Saved Quiet streets.')
  await expect(gm.getByRole('switch', { name: 'Quiet streets' })).toBeChecked()

  await gm.getByRole('button', { name: 'Edit Quiet streets' }).click()
  form = page.getByRole('dialog', { name: 'Edit house rule' })
  await form.getByLabel('Name').fill('Quieter streets')
  await form.getByRole('button', { name: 'Save house rule' }).click()
  await expect(gm.getByRole('status')).toHaveText('Saved Quieter streets.')

  await gm.getByRole('button', { name: 'Remove Made-up house rule' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Remove house rule' }).click()
  await expect(gm.getByRole('status')).toHaveText('Removed Made-up house rule.')
  await page.reload() // saved on the server
  await expect(gm.getByRole('switch')).toHaveCount(4) // with the app's two: non-canon content and real SINs, both on
  await expect(gm.getByRole('switch', { name: 'Real SINs allowed' })).toBeChecked()
  await expect(gm.getByRole('switch', { name: 'Long haggles' })).toBeChecked()
  expect(readFileSync(join(dir, 'custom', 'table-rules.xml'), 'utf8')).toContain('<name>Quieter streets</name>')
  await expect(page.getByRole('heading', { name: 'Rules reference' })).toBeVisible() // the quick reference stays below
  await shots(page, 'rules-gm')
})

test('a player sees the rules switched on, read only; the Rules page isn’t theirs', async ({ page }) => {
  await signIn(page, 'pat')
  await expect(page.getByRole('link', { name: 'Rules', exact: true })).toHaveCount(0)
  await page.getByRole('link', { name: 'Table rules' }).click()
  await expect(page.getByRole('heading', { name: 'Table rules' })).toBeVisible()
  await expect(page.getByRole('listitem')).toHaveCount(4)
  await expect(page.getByRole('listitem').filter({ hasText: 'Long haggles' })).toContainText('TEST p.42')
  await expect(page.getByRole('listitem').filter({ hasText: 'Real SINs allowed' })).toContainText('App setting')
  await expect(page.getByText('Made up: no drive-bys in the first scene.')).toBeVisible()
  await expect(page.getByRole('switch')).toHaveCount(0)
  await expect(page.getByText('Made-up house rule')).toHaveCount(0)
  await shots(page, 'table-rules-player')
  await page.goto('/#/rules')
  await expect(page.getByRole('heading', { name: 'Table rules' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Rules reference' })).toHaveCount(0)
  const r = await page.request.put(`${base}api/table-rules`, { data: { rules: [] }, headers: { Origin: base.replace(/\/$/, '') } })
  expect(r.status()).toBe(403)
})

test('a player has no book-data export', async ({ page }) => {
  await signIn(page, 'pat')
  await page.goto('/#/data')
  await expect(page.getByRole('heading', { name: 'Game data' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Export book data for Foundry' })).toHaveCount(0)
})

test('two quick switches both count: the second save waits for the first and builds on it', async ({ page }) => {
  await signIn(page, 'ada')
  await page.getByRole('link', { name: 'Rules', exact: true }).click()
  const gm = page.getByRole('region', { name: 'Table rules' })
  const haggles = gm.getByRole('switch', { name: 'Long haggles' }), streets = gm.getByRole('switch', { name: 'Quieter streets' })
  await expect(haggles).toBeChecked()
  await expect(streets).toBeChecked()
  let first = true
  await page.route('**/api/table-rules', async r => { // the first save is slow to reach the server
    if (first) { first = false; await new Promise(ok => setTimeout(ok, 800)) }
    await r.continue()
  })
  await haggles.click()
  await streets.click()
  await expect(gm.getByRole('status')).toHaveText('Quieter streets is off.')
  await page.unroute('**/api/table-rules')
  await page.reload()
  await expect(haggles).not.toBeChecked()
  await expect(streets).not.toBeChecked()
  const saved = readFileSync(join(dir, 'custom', 'table-rules.xml'), 'utf8')
  expect(saved).toContain('<rule id="test.optional-long-haggles" on="false"></rule>')
  expect(saved).toMatch(/on="false"><name>Quieter streets<\/name>/)
})

test('the same switch twice during a slow save ends as the last click; a failed save’s error stays until dismissed', async ({ page }) => {
  await signIn(page, 'ada')
  await page.getByRole('link', { name: 'Rules', exact: true }).click()
  const gm = page.getByRole('region', { name: 'Table rules' })
  const haggles = gm.getByRole('switch', { name: 'Long haggles' }), streets = gm.getByRole('switch', { name: 'Quieter streets' })
  await expect(haggles).not.toBeChecked()
  let n = 0
  await page.route('**/api/table-rules', async r => {
    if (n++ === 0) await new Promise(ok => setTimeout(ok, 800))
    await r.continue()
  })
  await haggles.click() // on (slow)
  await haggles.click() // off again, after the first
  await haggles.click() // on: the last click
  await expect(gm.getByRole('status')).toHaveText('Long haggles is on.')
  expect(n).toBeGreaterThanOrEqual(2) // queued clicks may be sent as one save of the latest state
  await page.unroute('**/api/table-rules')
  await page.reload()
  await expect(haggles).toBeChecked()

  let first = true // the first save fails, the next one succeeds: the error stays
  await page.route('**/api/table-rules', async r => {
    if (first) { first = false; return r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"server error"}' }) }
    await r.continue()
  })
  await haggles.click()
  await streets.click()
  await expect(streets).toBeChecked()
  await expect(gm.getByRole('alert')).toContainText('Couldn’t save the table rules.')
  await gm.getByRole('button', { name: 'Dismiss' }).click()
  await expect(gm.getByRole('alert')).toHaveCount(0)
  await page.unroute('**/api/table-rules')
  await page.reload()
  await expect(haggles).toBeChecked() // the failed save changed nothing
  await expect(streets).toBeChecked()
})
