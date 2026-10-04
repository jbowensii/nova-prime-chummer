import { test, expect, type Page } from '@playwright/test'
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { usersFile } from '../server/auth.mjs'
import { createServer } from '../server/server.mjs'
import { anarchyState } from './session'

// The Trash page: each account's deleted runners, restored or deleted for good; the admin opens anyone's. On a server of
// its own (an admin and two players, made-up names). Runs in order. Screenshots go to .extract/ (not committed).
const PW = { ada: 'ada-password-1', pat: 'pat-password-1', kim: 'kim-password-1' }
const SHOTS = '.extract/screenshots/0.4.4'
const PHONE = { width: 390, height: 844 }
let server: ReturnType<typeof createServer>, base = ''

test.describe.configure({ mode: 'serial' })
test.use({ baseURL: async ({}, use) => use(base), storageState: async ({}, use) => use(anarchyState(base)) })

test.beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ca2-trash-'))
  cpSync('tests/fixtures/mini/custom', join(dir, 'custom'), { recursive: true })
  mkdirSync(join(dir, 'library', '.config'), { recursive: true })
  writeFileSync(join(dir, 'library', '.config', 'users.xml'), await usersFile([{ username: 'ada', password: PW.ada, name: 'Ada Admin' },
    { username: 'pat', password: PW.pat, role: 'player', name: 'Pat Player' }, { username: 'kim', password: PW.kim, role: 'player', name: 'Kim Player' }]))
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
async function newRunner(page: Page, name: string) {
  await page.getByRole('button', { name: 'New runner' }).click()
  await page.getByRole('button', { name: 'Create runner' }).click()
  const saved = page.waitForResponse(r => r.request().method() === 'PUT' && !!r.request().postData()?.includes(`streetName="${name}"`))
  await page.getByLabel('Street name').fill(name)
  expect((await saved).status()).toBeLessThan(300)
  await page.goto('/')
}
async function remove(page: Page, name: string) {
  await page.locator('.dossier', { hasText: name }).getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('dialog', { name: `Delete ${name}?` }).getByRole('button', { name: 'Delete runner' }).click()
  await expect(page.getByRole('link', { name, exact: true })).toBeHidden()
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

test('a player deletes a runner, finds it in the trash and restores it', async ({ page }) => {
  await signIn(page, 'pat')
  await newRunner(page, 'Ratchet')
  await newRunner(page, 'Glitch')
  await expect(page.getByRole('link', { name: 'Trash (0)' })).toBeVisible()
  await remove(page, 'Ratchet')
  await remove(page, 'Glitch')
  await page.getByRole('link', { name: 'Trash (2)' }).click()
  await expect(page.getByRole('heading', { name: 'Trash', exact: true })).toBeVisible()
  const list = page.getByRole('list', { name: 'Deleted runners' })
  await expect(list.getByRole('listitem')).toHaveCount(2)
  await expect(list.getByRole('listitem').filter({ hasText: 'Ratchet' })).toContainText(/Deleted \w/)
  await shots(page, 'trash')
  await list.getByRole('button', { name: 'Restore Ratchet' }).click()
  await expect(page.getByRole('status')).toHaveText('Restored Ratchet to your library.')
  await expect(list.getByRole('listitem')).toHaveCount(1)
  await page.getByRole('link', { name: 'Your runners' }).click()
  await expect(page.getByRole('link', { name: 'Ratchet', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Trash (1)' })).toBeVisible()
})

test('the account menu opens the trash; emptying it asks first', async ({ page }) => {
  await signIn(page, 'pat')
  await page.getByRole('button', { name: 'Pat Player' }).click()
  await page.getByRole('link', { name: 'Trash', exact: true }).click()
  await page.getByRole('button', { name: 'Empty trash' }).click()
  const ask = page.getByRole('dialog', { name: 'Empty the trash?' })
  await expect(ask).toContainText('Permanently delete 1 runner? This can’t be undone.')
  await shots(page, 'trash-empty-confirm')
  await ask.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('list', { name: 'Deleted runners' }).getByRole('listitem')).toHaveCount(1)
  await page.getByRole('button', { name: 'Empty trash' }).click()
  await page.getByRole('dialog', { name: 'Empty the trash?' }).getByRole('button', { name: 'Empty trash' }).click()
  await expect(page.getByRole('status')).toHaveText('Emptied the trash: 1 runner deleted for good.')
  await expect(page.getByText('The trash is empty.')).toBeVisible()
})

test('a player can’t open another account’s trash', async ({ page }) => {
  await signIn(page, 'kim')
  await newRunner(page, 'Mouse')
  await remove(page, 'Mouse')
  await page.context().clearCookies()
  await signIn(page, 'pat')
  await page.goto('/#/trash/kim') // their own trash instead
  await expect(page.getByRole('heading', { name: 'Trash', exact: true })).toBeVisible()
  await expect(page.getByText('The trash is empty.')).toBeVisible()
  await expect(page.getByText('Mouse')).toBeHidden()
  await expect(page.getByLabel('Account')).toBeHidden()
  expect((await page.request.get('/api/trash?user=kim', { headers: { Origin: base.slice(0, -1) } })).status()).toBe(403)
})

test('the admin opens a player’s trash from the Users page and empties it', async ({ page }) => {
  await signIn(page, 'ada')
  await page.goto('/#/users')
  await page.getByRole('link', { name: 'Open Kim Player’s trash' }).click()
  await expect(page.getByRole('heading', { name: 'Kim Player’s trash' })).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: 'Mouse' })).toBeVisible()
  await expect(page.getByLabel('Account')).toHaveValue('kim')
  await shots(page, 'trash-admin')
  await page.getByRole('button', { name: 'Empty trash' }).click()
  await page.getByRole('dialog', { name: 'Empty the trash?' }).getByRole('button', { name: 'Empty trash' }).click()
  await expect(page.getByRole('status')).toHaveText('Emptied the trash: 1 runner deleted for good.')
  await page.getByLabel('Account').selectOption('ada') // the picker: back to the admin's own
  await expect(page.getByRole('heading', { name: 'Trash', exact: true })).toBeVisible()
})
