import { test, expect, type Page } from '@playwright/test'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { usersFile } from '../server/auth.mjs'
import { createServer } from '../server/server.mjs'
import { anarchyState } from './session'

// Table setup (#/table) is where the GMs (admin and editors) switch table rules on and off and write house rules; players
// get it read only. The Rules page shows only the quick reference. On a server of its own with the made-up books (tests/fixtures/mini/custom): one optional
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

test('an editor switches table rules on and writes house rules on Table setup', async ({ page }) => {
  await signIn(page, 'eve')
  await page.getByRole('link', { name: 'Table setup' }).click()
  await expect(page).toHaveURL(/#\/table$/)
  await expect(page.getByRole('heading', { name: 'Table setup', level: 1 })).toBeVisible()
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
  await expect(gm.getByRole('switch')).toHaveCount(5) // with the app's two (non-canon content, real SINs) and its house rule (SINner free), all on
  await expect(gm.getByRole('switch', { name: 'SINner free, never the first Quality' })).toBeChecked()
  await expect(gm.getByRole('switch', { name: 'Real SINs allowed' })).toBeChecked()
  await expect(gm.getByRole('switch', { name: 'Long haggles' })).toBeChecked()
  expect(readFileSync(join(dir, 'custom', 'table-rules.xml'), 'utf8')).toContain('<name>Quieter streets</name>')
  await expect(page.getByRole('heading', { name: 'Rules reference' })).toHaveCount(0) // the quick reference is on Rules
  await shots(page, 'table-setup-gm')
  await page.getByRole('link', { name: 'Rules', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Rules reference' })).toBeVisible()
  await expect(gm).toHaveCount(0)
  await shots(page, 'rules-gm')
})

test('a player sees the rules switched on, read only; the Rules page isn’t theirs', async ({ page }) => {
  await signIn(page, 'pat')
  await expect(page.getByRole('link', { name: 'Rules', exact: true })).toHaveCount(0)
  await page.getByRole('link', { name: 'Table setup' }).click()
  await expect(page.getByRole('heading', { name: 'Table setup', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Table rules' })).toBeVisible()
  await expect(page.getByRole('listitem')).toHaveCount(5)
  await expect(page.getByRole('listitem').filter({ hasText: 'SINner free' })).toContainText('House rule')
  await expect(page.getByRole('listitem').filter({ hasText: 'Long haggles' })).toContainText('TEST p.42')
  await expect(page.getByRole('listitem').filter({ hasText: 'Real SINs allowed' })).toContainText('App setting')
  await expect(page.getByText('Made up: no drive-bys in the first scene.')).toBeVisible()
  await expect(page.getByRole('switch')).toHaveCount(0)
  await expect(page.getByText('Made-up house rule')).toHaveCount(0)
  await shots(page, 'table-rules-player')
  await page.goto('/#/rules')
  await expect(page.getByRole('heading', { name: 'Table setup', level: 1 })).toBeVisible()
  await page.goto('/#/table-rules') // the old link
  await expect(page.getByRole('heading', { name: 'Table setup', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Rules reference' })).toHaveCount(0)
  const r = await page.request.put(`${base}api/table-rules`, { data: { rules: [] }, headers: { Origin: base.replace(/\/$/, '') } })
  expect(r.status()).toBe(403)
})

test('a player has no book-data export', async ({ page }) => {
  await signIn(page, 'pat')
  await page.goto('/#/data')
  await expect(page.getByRole('heading', { name: 'Game data' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Export book data for Foundry' })).toHaveCount(0)
  await expect(page.locator('#foundry-export')).toHaveCount(0)
})

test('two quick switches both count: the second save waits for the first and builds on it', async ({ page }) => {
  await signIn(page, 'ada')
  await page.getByRole('link', { name: 'Table setup' }).click()
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
  await page.getByRole('link', { name: 'Table setup' }).click()
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

test('a runner plays the table’s optional rules unless it sets its own (Review tab)', async ({ page }) => {
  await signIn(page, 'pat') // Long haggles is on at the table (the test before)
  await page.getByRole('button', { name: 'New runner' }).click()
  await page.getByRole('button', { name: 'Create runner' }).click()
  await page.getByLabel('Street name').fill('Haggler')
  await page.getByRole('link', { name: 'Review' }).click()
  const own = page.getByRole('region', { name: 'Optional rules' })
  const pick = own.getByLabel('Long haggles for this runner')
  await expect(pick).toHaveValue('')
  await expect(pick.locator('option').first()).toHaveText('As the table: on')
  const state = own.getByRole('listitem').filter({ hasText: 'Long haggles' }).getByText(/^(not )?in play$/)
  await expect(state).toHaveText('in play')
  await pick.selectOption('off')
  await expect(state).toHaveText('not in play')
})

test('the GM locks a rule: every runner plays it as the table has it, its own switch disabled', async ({ page }) => {
  await signIn(page, 'eve')
  await page.getByRole('link', { name: 'Table setup' }).click()
  const gm = page.getByRole('region', { name: 'Table rules' })
  await gm.getByRole('checkbox', { name: 'Lock Long haggles' }).click()
  await expect(gm.getByRole('checkbox', { name: 'Lock Long haggles' })).toBeChecked()
  await expect(gm.getByRole('status')).toHaveText('Long haggles is locked: every runner plays it as set here.')
})

test('a locked rule plays as the table has it: the runner’s own switch is disabled', async ({ page }) => {
  await signIn(page, 'pat') // Long haggles is on at the table and locked (the tests before)
  await page.getByRole('button', { name: 'New runner' }).click()
  await page.getByRole('button', { name: 'Create runner' }).click()
  await page.getByRole('link', { name: 'Review' }).click()
  const own = page.getByRole('region', { name: 'Optional rules' })
  await expect(own.getByLabel('Long haggles for this runner')).toBeDisabled()
  await expect(own.getByLabel('Long haggles for this runner')).toHaveValue('')
  await expect(own.getByText(/^in play \(locked by the GM\)$/)).toBeVisible()
})

test('the SINner house rule: on by default, a runner may switch it off on the Review tab, the GM may lock it', async ({ page }) => {
  await signIn(page, 'pat')
  await page.getByRole('button', { name: 'New runner' }).click()
  await page.getByRole('button', { name: 'Create runner' }).click()
  await page.getByRole('link', { name: 'Review' }).click()
  const row = page.getByRole('region', { name: 'Optional rules' }).getByRole('listitem').filter({ hasText: 'SINner free' })
  await expect(row).toContainText('House rule')
  const pick = row.getByLabel('SINner free, never the first Quality for this runner')
  await expect(pick.locator('option').first()).toHaveText('As the table: on')
  await expect(row.getByText(/^(not )?in play$/)).toHaveText('in play')
  await pick.selectOption('off')
  await expect(row.getByText(/^(not )?in play$/)).toHaveText('not in play')
})


test('hovering a Table setup switch shows what it does and where it comes from', async ({ page }) => {
  await signIn(page, 'eve')
  await page.getByRole('link', { name: 'Table setup' }).click()
  const gm = page.getByRole('region', { name: 'Table rules' })
  for (const [name, text] of [['Long haggles', 'Source: Test Book One p.42.'], ['SINner free, never the first Quality', 'Source: house rule.'], ['Real SINs allowed', 'Source: house rule.']]) {
    const sw = gm.locator('label.switch').filter({ has: page.getByRole('switch', { name }) })
    await sw.hover()
    const tip = await sw.getAttribute('title') // (the browser draws the title as its tooltip)
    expect(tip, name).toContain(text)
    expect(tip, name).not.toMatch(/commlink|sra2/i)
  }
})
