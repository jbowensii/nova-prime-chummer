import { test, expect, type Page } from '@playwright/test'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { usersFile } from '../server/auth.mjs'
import { createServer } from '../server/server.mjs'

// SR6 S3 end to end: career play on the Ledger tab (and, from Task 9, NPCs and campaigns) on a server of its own with the
// made-up SR6 fixture (tests/fixtures/sr6/custom copied to custom/sr6/). All names made up: Ada the admin, Gil an editor,
// Pat a player. Pat's runner is tests/fixtures/sr6/runner-career.xml with its ledger cut back to the finalize entry (31
// karma, 4,350¥). Runs in order. Screenshots go to .extract/screenshots/sr6-s3 (not committed).
const PW = { ada: 'ada-password-1', gil: 'gil-password-1', pat: 'pat-password-1' }
const SHOTS = '.extract/screenshots/sr6-s3'
const PHONE = { width: 390, height: 844 }, DESK = { width: 1400, height: 900 }
const RUNNER = 'career-wisp-1'
let server: ReturnType<typeof createServer>, base = '', dir = ''

test.describe.configure({ mode: 'serial' })
test.use({ baseURL: async ({}, use) => use(base), storageState: { cookies: [], origins: [] }, viewport: DESK })

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'ca2-sr6-career-e2e-'))
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

test('career: the Ledger tab records earnings and spends, voids the newest, and the other tabs show the runner as it stands', async ({ page }) => {
  await signIn(page, '/#/sr6', 'pat')
  const xml = readFileSync('tests/fixtures/sr6/runner-career.xml', 'utf8').replace(/(<entry id="l-1"[^>]*\/>)[\s\S]*<\/ledger>/, '$1\n  </ledger>')
  const put = await page.request.put(`/api/sr6/characters/${RUNNER}`, { data: xml, headers: { 'Content-Type': 'application/xml', Origin: base.replace(/\/$/, '') } })
  expect(put.status()).toBe(201)
  await page.goto(`/#/sr6/c/${RUNNER}/attributes`)
  const tabs = page.getByRole('navigation', { name: 'Character sections' }).getByRole('link')
  const work = page.locator('main.work'), dlg = page.getByRole('dialog'), price = page.getByRole('status', { name: 'Price' })
  await expect(page.locator('.topbar .runstate')).toHaveAttribute('title', 'Finalized: spend karma and nuyen on the Ledger tab')
  await expect(page.getByRole('status').filter({ hasText: 'Finalized: spend karma and nuyen on the Ledger tab.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Raise Agility points' })).toBeDisabled()

  await tabs.filter({ hasText: 'Ledger' }).click()
  await expect(work.locator('.sr6-balances')).toHaveText(/Karma 31\s*Nuyen 4,350¥/)
  await work.getByLabel('Karma', { exact: true }).fill('9')
  await work.getByLabel('Nuyen', { exact: true }).fill('3100')
  await work.getByLabel('Run').fill('Made-up run')
  await work.getByRole('button', { name: 'Record earnings' }).click()
  await expect(work.locator('.sr6-balances')).toHaveText(/Karma 40\s*Nuyen 7,450¥/)
  await expect(page.locator('.sr6-budgets')).toContainText('40')

  // raise Agility: the price line, the confirm dialog, then Attributes shows 4
  await work.getByRole('combobox', { name: /^What/ }).selectOption('attribute')
  await work.getByRole('combobox', { name: /^Attribute/ }).selectOption({ label: 'Agility (3)' })
  await expect(price).toHaveText('AGI 3 → 4 · 12 karma · after: 28 karma, 7,450¥')
  await work.getByRole('button', { name: 'Record', exact: true }).click()
  await expect(dlg).toContainText('AGI 3 → 4')
  await dlg.getByRole('button', { name: 'Record it' }).click()
  await expect(work.locator('.sr6-balances')).toHaveText(/Karma 28/)
  // learn a spell from the catalog
  await work.getByRole('combobox', { name: /^What/ }).selectOption('pick')
  await work.getByRole('button', { name: 'Pick from the catalog…' }).click()
  await dlg.getByText('Glow Ward').click()
  await expect(price).toHaveText('Spell: Glow Ward · 7 karma · after: 21 karma, 7,450¥')
  await work.getByRole('button', { name: 'Record', exact: true }).click()
  await dlg.getByRole('button', { name: 'Record it' }).click()
  await expect(work.locator('.sr6-balances')).toHaveText(/Karma 21/)
  // nuyen to karma is an optional rule, off without its setting
  await work.getByRole('combobox', { name: /^What/ }).selectOption('n2k')
  await work.getByLabel('Karma', { exact: true }).last().fill('1')
  await expect(price).toHaveText('That optional rule is off: Game data → Creation rules.')
  await expect(work.getByRole('button', { name: 'Record', exact: true })).toBeDisabled()

  // only the newest spend can be voided
  await expect(work.getByRole('button', { name: 'Void AGI 3 → 4' })).toHaveCount(0)
  await expect(work.getByRole('button', { name: 'Void Earned: Made-up run (' + new Date().toISOString().slice(0, 10) + ')' })).toBeVisible()
  await shoot(page, 'ledger')
  await work.getByRole('button', { name: 'Void Spell: Glow Ward' }).click()
  await dlg.getByLabel('Why').fill('Picked the wrong one')
  await dlg.getByRole('button', { name: 'Void' }).click()
  await expect(work.locator('.sr6-balances')).toHaveText(/Karma 28/)
  await expect(work.locator('tr.voided')).toContainText('Voided: Picked the wrong one')
  await expect(work.getByRole('button', { name: 'Void AGI 3 → 4' })).toBeVisible()

  await tabs.filter({ hasText: 'Attributes' }).click()
  await expect(work.locator('tr', { hasText: 'Agility' }).locator('td.num').first()).toHaveText('4')
  await tabs.filter({ hasText: 'Review' }).click()
  await expect(page.getByRole('button', { name: 'Back to draft' })).toBeDisabled()
  await expect(work).toContainText('Void the ledger’s earnings and spends first (newest first).')
  await expect(work).toContainText('The ledger now holds 28 karma and 7,450¥.')
  await expect(page.getByRole('status', { name: 'Save status' })).toContainText('All changes saved')
})
