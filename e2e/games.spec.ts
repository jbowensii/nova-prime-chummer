import { test, expect, type Page } from '@playwright/test'
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { usersFile } from '../server/auth.mjs'
import { createServer } from '../server/server.mjs'
import { GAME_KEY } from './session'

// 0.9.0 (SR6 S0) game picker and switch end to end, on a server of its own with an empty browser (all names made up):
// Ada the admin, Pat a player. Runs in order. Screenshots go to .extract/ (not committed).
const PW = { ada: 'ada-password-1', pat: 'pat-password-1' }
const SHOTS = '.extract/screenshots/sr6-s0'
const PHONE = { width: 390, height: 844 }
let server: ReturnType<typeof createServer>, base = '', runner = ''

test.describe.configure({ mode: 'serial' })
test.use({ baseURL: async ({}, use) => use(base), storageState: { cookies: [], origins: [] } })

test.beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ca2-games-e2e-')), config = join(dir, 'library', '.config')
  cpSync('tests/fixtures/mini/custom', join(dir, 'custom'), { recursive: true })
  mkdirSync(config, { recursive: true })
  writeFileSync(join(config, 'users.xml'), await usersFile([{ username: 'ada', password: PW.ada, name: 'Ada Admin' },
    { username: 'pat', password: PW.pat, role: 'player', name: 'Pat Player' }]))
  server = createServer({ staticDir: 'dist', charDir: join(dir, 'characters'), customDir: join(dir, 'custom'), libraryDir: join(dir, 'library') })
  await new Promise<void>((ok, fail) => server.once('error', fail).listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/`
  mkdirSync(SHOTS, { recursive: true })
})
test.afterAll(() => { server.stopJobs(); server.close() })

async function signIn(page: Page, username: keyof typeof PW) {
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password', { exact: true }).fill(PW[username])
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Your runners' })).toBeVisible()
}
const menu = (page: Page) => page.getByRole('navigation', { name: 'Main menu' }).getByRole('link')
const stored = (page: Page) => page.evaluate(k => localStorage.getItem(k), GAME_KEY)
const fits = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)

test('a fresh browser picks its game before signing in; SR6 opens its shell', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Choose your game' })).toBeVisible()
  await expect(page.getByLabel('Username')).toHaveCount(0)
  // no game picked yet: the neutral name and the version, neither game's brand
  await expect(page.locator('.gamepick .brand-row .brand')).toHaveText('Chummer')
  await expect(page.locator('.gamepick .brand-row .ver')).toHaveText(/^v\d/)
  await expect(page.getByRole('link', { name: /Chummer/ })).toHaveCount(0)
  const ca2 = page.getByRole('button', { name: 'Shadowrun Anarchy 2.0' }), sr6 = page.getByRole('button', { name: 'Shadowrun 6th World' })
  // Shadowrun 6th World comes first (on the left)
  await expect(page.locator('.gamepick .game').first()).toHaveAccessibleName('Shadowrun 6th World')
  await expect(ca2).toHaveAccessibleDescription(/story-first/)
  await expect(sr6).toHaveAccessibleDescription(/full rules/)
  await page.screenshot({ path: `${SHOTS}/picker-light.png`, fullPage: true })
  await page.evaluate(() => localStorage.setItem('ca2.settings.v1', JSON.stringify({ theme: 'dark' })))
  await page.reload()
  await sr6.focus() // keyboard focus: the widened edge and the focus ring
  await page.screenshot({ path: `${SHOTS}/picker-dark.png`, fullPage: true })
  await page.evaluate(() => localStorage.removeItem('ca2.settings.v1'))
  await page.setViewportSize(PHONE)
  await page.reload()
  await fits(page)
  await page.screenshot({ path: `${SHOTS}/picker-phone.png`, fullPage: true })
  await page.setViewportSize({ width: 1400, height: 900 })

  await sr6.click()
  await expect(page).toHaveURL(/#\/sr6$/)
  expect(await stored(page)).toBe('sr6')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Chummer Shadowrun 6' })).toHaveAttribute('href', '#/sr6')
  await signIn(page, 'ada')
  await expect(page.getByText('No runners yet.')).toBeVisible()
  expect(await menu(page).evaluateAll(as => as.map(a => a.getAttribute('aria-label')))).toEqual(['Your runners', 'NPCs & Critters', 'Compendiums', 'Campaigns', 'Books', 'Rules', 'Game data'])
  await expect(page.getByRole('link', { name: 'Your runners' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('button', { name: 'Ask the rules' })).toHaveCount(0)
  await page.screenshot({ path: `${SHOTS}/sr6-shell.png`, fullPage: true })
  await page.setViewportSize(PHONE)
  await fits(page)
  await page.screenshot({ path: `${SHOTS}/sr6-shell-phone.png`, fullPage: true })
  await page.setViewportSize({ width: 1400, height: 900 })
})

test('SR6 Books: empty, the upload is on', async ({ page }) => {
  await page.goto('/#/sr6')
  await signIn(page, 'ada')
  await page.getByRole('link', { name: 'Books' }).click()
  await expect(page).toHaveURL(/#\/sr6\/books$/)
  await expect(page.getByRole('heading', { name: 'Books', exact: true })).toBeVisible()
  await expect(page.getByText('No books uploaded yet.')).toBeVisible()
  await expect(page.getByLabel('Choose PDF files')).toBeEnabled()
  await expect(page.getByRole('link', { name: 'Books' })).toHaveAttribute('aria-current', 'page')
})

test('the header switch changes game and is remembered across reloads', async ({ page }) => {
  await page.goto('/#/sr6')
  await signIn(page, 'ada')
  const toCa2 = page.getByRole('link', { name: 'Switch to Shadowrun Anarchy' })
  await toCa2.hover()
  await expect(page.getByRole('tooltip')).toHaveText('Switch to Shadowrun Anarchy')
  await page.screenshot({ path: `${SHOTS}/header-switch-sr6.png`, clip: { x: 0, y: 0, width: 1400, height: 240 } })
  await toCa2.click()
  await expect(page).toHaveURL(/#\/$/)
  // wait for the Anarchy page itself: SR6's page has the same menu labels and New runner button, and the Anarchy page
  // shows no header while its game data loads, so a one-shot read of the menu must come after the brand link
  await expect(page.getByRole('link', { name: 'Chummer Anarchy 2.0' })).toHaveAttribute('href', '#/')
  await expect(page.getByRole('button', { name: 'New runner' })).toBeVisible()
  expect(await menu(page).evaluateAll(as => as.map(a => a.getAttribute('aria-label'))))
    .toEqual(['Your runners', 'NPCs & Critters', 'Compendiums', 'Campaigns', 'Books', 'Rules', 'Game data'])
  const toSr6 = page.getByRole('link', { name: 'Switch to Shadowrun 6' })
  await toSr6.hover()
  await page.screenshot({ path: `${SHOTS}/header-switch-anarchy.png`, clip: { x: 0, y: 0, width: 1400, height: 240 } })
  expect(await stored(page)).toBe('ca2')

  await page.reload()
  await expect(page.getByRole('button', { name: 'New runner' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Choose your game' })).toHaveCount(0)
  await toSr6.click()
  await expect(page.getByRole('link', { name: 'Chummer Shadowrun 6' })).toBeVisible()
  await expect(page.getByText('No runners yet.')).toBeVisible()
  await page.goto('/') // a bare address opens the remembered game
  await expect(page).toHaveURL(/#\/sr6$/)
  await expect(page.getByText('No runners yet.')).toBeVisible()
})

test('the games keep their runners apart; a deep link opens its own game', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Shadowrun Anarchy 2.0' }).click()
  await signIn(page, 'ada')
  expect(await stored(page)).toBe('ca2')
  await page.getByRole('button', { name: 'New runner' }).click()
  await page.getByRole('button', { name: 'Create runner' }).click()
  const saved = page.waitForResponse(r => r.request().method() === 'PUT' && !!r.request().postData()?.includes('streetName="Jinx"'))
  await page.getByLabel('Street name').fill('Jinx')
  expect((await saved).status()).toBeLessThan(300)
  runner = page.url().match(/#\/c\/([^/]+)/)![1]
  await page.goto('/#/')
  await expect(page.getByRole('link', { name: 'Jinx' })).toBeVisible()

  await page.getByRole('link', { name: 'Switch to Shadowrun 6' }).click()
  await expect(page.getByText('No runners yet.')).toBeVisible()
  await expect(page.getByText('Jinx')).toHaveCount(0)
  expect(await (await page.request.get('/api/sr6/characters')).json()).toEqual([])
  expect(JSON.stringify(await (await page.request.get('/api/characters')).json())).toContain(runner)

  expect(await stored(page)).toBe('sr6')
  await page.goto(`/#/c/${runner}`)
  await expect(page.getByLabel('Street name')).toHaveValue('Jinx')
  await expect(page.getByRole('link', { name: 'Chummer Anarchy 2.0' })).toBeVisible()
})

test('a player sees no SR6 Books', async ({ page }) => {
  await page.goto('/#/sr6/books')
  await signIn(page, 'pat')
  await expect(page.getByText('No runners yet.')).toBeVisible()
  expect(await menu(page).evaluateAll(as => as.map(a => a.getAttribute('aria-label')))).toEqual(['Your runners', 'Campaigns', 'Table rules', 'Game data'])
  await expect(page.getByLabel('Choose PDF files')).toHaveCount(0)
})
