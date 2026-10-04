import { test, expect, type Page } from '@playwright/test'
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { usersFile } from '../server/auth.mjs'
import { createServer } from '../server/server.mjs'

// SR6 S2 end to end: the SR6 runners page and the builder on a server of its own with the made-up SR6 fixture
// (tests/fixtures/sr6/custom copied to custom/sr6/). All names made up: Ada the admin, Gil an editor, Pat a player. Runs in
// order. Screenshots go to .extract/screenshots/sr6-s2 (not committed).
const PW = { ada: 'ada-password-1', gil: 'gil-password-1', pat: 'pat-password-1' }
const SHOTS = '.extract/screenshots/sr6-s2'
const PHONE = { width: 390, height: 844 }, DESK = { width: 1400, height: 900 }
const CA2 = '<ca2:character xmlns:ca2="urn:chummer-anarchy2:character:1" formatVersion="1" id="anarchy-1" metatype="elf" level="runner" updatedAt="2026-10-03T00:00:00.000Z"><build><attributes str="1" agi="1" wil="1" log="1" cha="1"/></build></ca2:character>'
let server: ReturnType<typeof createServer>, base = '', dir = ''

test.describe.configure({ mode: 'serial' })
test.use({ baseURL: async ({}, use) => use(base), storageState: { cookies: [], origins: [] }, viewport: DESK })

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'ca2-sr6-builder-e2e-'))
  const config = join(dir, 'library', '.config')
  cpSync('tests/fixtures/mini/custom', join(dir, 'custom'), { recursive: true })
  cpSync('tests/fixtures/sr6/custom', join(dir, 'custom', 'sr6'), { recursive: true })
  mkdirSync(config, { recursive: true })
  writeFileSync(join(config, 'users.xml'), await usersFile([{ username: 'ada', password: PW.ada, name: 'Ada Admin' },
    { username: 'gil', password: PW.gil, role: 'editor', name: 'Gil Editor' }, { username: 'pat', password: PW.pat, role: 'player', name: 'Pat Player' }]))
  server = createServer({ staticDir: 'dist', charDir: join(dir, 'characters'), customDir: join(dir, 'custom'), libraryDir: join(dir, 'library') })
  await new Promise<void>((ok, fail) => server.once('error', fail).listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/`
  mkdirSync(SHOTS, { recursive: true })
})
test.afterAll(() => { server.stopJobs(); server.close() })

async function signIn(page: Page, path: string, username: keyof typeof PW) {
  await page.goto(path)
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password', { exact: true }).fill(PW[username])
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByLabel('Username')).toHaveCount(0)
}
const fits = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
/** light and dark at desktop width, then both at phone width (which must not scroll sideways) */
async function shoot(page: Page, name: string) {
  const theme = (t: string) => page.evaluate(v => { document.documentElement.dataset.theme = v }, t)
  await page.screenshot({ path: `${SHOTS}/${name}-light.png`, fullPage: true })
  await theme('dark')
  await page.screenshot({ path: `${SHOTS}/${name}-dark.png`, fullPage: true })
  await page.setViewportSize(PHONE)
  await fits(page)
  await page.screenshot({ path: `${SHOTS}/${name}-phone-dark.png`, fullPage: true })
  await theme('light')
  await page.screenshot({ path: `${SHOTS}/${name}-phone.png`, fullPage: true })
  await page.setViewportSize(DESK)
}
const row = (page: Page, name: string) => page.locator('.dossier', { hasText: name })
const file = (name: string, text: string) => ({ name, mimeType: 'application/xml', buffer: Buffer.from(text) })

test('the runners page: empty, a method that needs settings, a new runner, import, export, repair, trash', async ({ page }) => {
  // without pointBuy.total, Point buy can't be picked and says what's missing
  await page.route('**/custom/sr6/creation.xml', async r => {
    const res = await r.fetch()
    await r.fulfill({ response: res, body: (await res.text()).replace(/<setting key="pointBuy\.total"[^>]*\/>/, '') })
  })
  await signIn(page, '/#/sr6', 'pat')
  await expect(page.getByRole('heading', { name: 'Your runners' })).toBeVisible()
  await expect(page.getByText('No runners yet.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Your runners' })).toHaveAttribute('aria-current', 'page')
  await page.getByRole('button', { name: 'New runner' }).click()
  const dlg = page.getByRole('dialog', { name: 'New runner' })
  const method = dlg.getByLabel('Creation method')
  await expect(method.locator('option', { hasText: 'Lifepath' })).not.toHaveAttribute('disabled')
  await expect(method.locator('option', { hasText: 'Point buy' })).toHaveAttribute('disabled')
  await expect(method.locator('option', { hasText: 'Point buy' })).toContainText('needs 1 setting')
  await expect(dlg.locator('.missing')).toContainText('Point buy: Character points')
  await expect(method).toHaveValue('priority')
  await page.screenshot({ path: `${SHOTS}/new-runner-light.png` })
  await dlg.getByLabel('Street name').fill('Zip Spark')
  await dlg.getByRole('button', { name: 'Create runner' }).click()
  await expect(page).toHaveURL(/#\/sr6\/c\/[^/]+\/concept$/)
  await page.unroute('**/custom/sr6/creation.xml')

  // back on the list: the row, then a file the app can't read, listed with Download and Try to repair
  const id = page.url().split('/c/')[1].split('/')[0]
  const folder = join(dir, 'characters', 'sr6', 'pat'), xml = readFileSync(join(folder, readdirSync(folder)[0]), 'utf8')
  expect(xml).toContain(`id="${id}"`)
  const broken = xml.replace(`id="${id}"`, 'id="broken-1"').replace('streetName="Zip Spark"', 'streetName="Cracked Kit"')
    .replace('</build>', '<purchase uid="p1" kind="gear" id="crb.zap-pellets" qty="x"/></build>')
  writeFileSync(join(folder, 'cracked-kit.xml'), broken)
  await page.goto('/#/sr6')
  await page.reload()
  await expect(row(page, 'Zip Spark')).toContainText('No metatype yet, Priority')
  await expect(row(page, 'Zip Spark')).toContainText('Draft')
  await expect(row(page, 'Zip Spark').locator('.overspent')).toContainText(/\d+ errors?/)
  await expect(row(page, 'Cracked Kit')).toContainText('Couldn’t open Cracked Kit')
  await shoot(page, 'runners')
  await row(page, 'Cracked Kit').getByRole('button', { name: 'Try to repair' }).click()
  const fix = page.getByRole('dialog', { name: 'Repair Cracked Kit?' })
  await expect(fix).toContainText('Dropped purchase 1')
  await fix.getByRole('button', { name: 'Save repaired runner' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Repaired Cracked Kit.' })).toBeVisible()
  await expect(row(page, 'Cracked Kit').getByRole('link', { name: 'Cracked Kit' })).toBeVisible()

  // export, import it back (a copy with a new id), an Anarchy file refused
  const [down] = await Promise.all([page.waitForEvent('download'), row(page, 'Zip Spark').getByRole('button', { name: 'Export' }).click()])
  const exported = readFileSync(await down.path(), 'utf8')
  expect(exported).toContain('lastExportedAt=')
  await page.locator('input[type=file]').setInputFiles([file('zip.xml', exported), file('anarchy.xml', CA2)])
  await expect(page.getByRole('status').filter({ hasText: 'Imported Zip Spark.' })).toContainText('anarchy.xml: This is a Shadowrun Anarchy runner. Import it on the Anarchy side.')
  await expect(row(page, 'Zip Spark')).toHaveCount(2)

  // search and sort
  await page.getByLabel('Search runners').fill('crack')
  await expect(page.locator('.dossier')).toHaveCount(1)
  await page.getByLabel('Search runners').fill('')

  // delete the copy: to the SR6 trash, then restore it
  await row(page, 'Zip Spark').nth(1).getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete runner' }).click()
  await expect(row(page, 'Zip Spark')).toHaveCount(1)
  await page.getByRole('link', { name: 'Trash (1)' }).click()
  await expect(page).toHaveURL(/#\/sr6\/trash$/)
  await expect(page.getByRole('heading', { name: 'Trash' })).toBeVisible()
  await page.getByRole('button', { name: 'Restore Zip Spark' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Restored Zip Spark' })).toBeVisible()
  await page.goto('/#/sr6')
  await expect(row(page, 'Zip Spark')).toHaveCount(2)
})

test('the legacy server: the SR6 runners page says who is in the way', async ({ page }) => {
  await page.route('**/api/sr6/characters', r => r.fulfill({ status: 409, json: { error: 'rename the account sr6 first' } }))
  await signIn(page, '/#/sr6', 'pat')
  await expect(page.getByRole('alert')).toHaveText('An account called sr6 is in the way: the admin renames it on the Users page.')
  await expect(page.getByRole('button', { name: 'New runner' })).toBeDisabled()
})

test('isolation: the Anarchy list never shows an SR6 runner', async ({ page }) => {
  await signIn(page, '/#/sr6', 'pat')
  await expect(page.getByRole('link', { name: 'Zip Spark' }).first()).toBeVisible()
  await page.getByRole('link', { name: 'Switch to Shadowrun Anarchy' }).click()
  await expect(page.getByRole('link', { name: 'Chummer Anarchy 2.0' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Your runners' })).toBeVisible()
  await expect(page.getByText('Zip Spark')).toHaveCount(0)
  expect(await page.evaluate(() => fetch('./api/characters').then(r => r.text()))).not.toContain('sr6:character')
})
