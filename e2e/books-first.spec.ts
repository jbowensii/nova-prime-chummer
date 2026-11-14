import { test, expect } from '@playwright/test'
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { usersFile } from '../server/auth.mjs'
import { createServer } from '../server/server.mjs'

// An admin's first visit to a game with no books and no game data opens its Books page (src/core/app/booksFirst.ts). The
// fixture custom folder has Anarchy's core data but no SR6 data and no books: SR6 redirects, Anarchy does not.
const PW = { ada: 'ada-password-1', pat: 'pat-password-1' }
let server: ReturnType<typeof createServer>,
  base = ''
test.describe.configure({ mode: 'serial' })
test.use({ baseURL: async ({}, use) => use(base), storageState: { cookies: [], origins: [] } })

test.beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ca2-books-first-')),
    config = join(dir, 'library', '.config')
  cpSync('tests/fixtures/mini/custom', join(dir, 'custom'), { recursive: true })
  mkdirSync(config, { recursive: true })
  writeFileSync(
    join(config, 'users.xml'),
    await usersFile([
      { username: 'ada', password: PW.ada, name: 'Ada Admin' },
      { username: 'pat', password: PW.pat, role: 'player', name: 'Pat Player' },
    ]),
  )
  server = createServer({ staticDir: 'dist', charDir: join(dir, 'characters'), customDir: join(dir, 'custom'), libraryDir: join(dir, 'library') })
  await new Promise<void>((ok, fail) => server.once('error', fail).listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/`
})
test.afterAll(() => {
  server.stopJobs()
  server.close()
})

async function signIn(page: import('@playwright/test').Page, who: keyof typeof PW) {
  await page.getByLabel('Username').fill(who)
  await page.getByLabel('Password', { exact: true }).fill(PW[who])
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test('a player is never sent to Books', async ({ page }) => {
  await page.goto('/#/sr6')
  await signIn(page, 'pat')
  await expect(page.getByRole('heading', { name: 'Your runners' })).toBeVisible()
  await expect(page).toHaveURL(/#\/sr6$/)
})

test('Anarchy has data: its admin stays home', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('chummer.game', 'ca2')) // no picker
  await page.goto('/#/')
  await signIn(page, 'ada')
  await expect(page.getByRole('heading', { name: 'Your runners' })).toBeVisible()
  await expect(page).toHaveURL(/#\/$/)
})

test('SR6 with nothing: the admin lands on Books once, then stays home', async ({ page }) => {
  await page.goto('/#/sr6')
  await signIn(page, 'ada')
  await expect(page).toHaveURL(/#\/sr6\/books$/)
  await expect(page.getByRole('heading', { name: 'Books', exact: true })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('chummer.booksSeen.sr6'))).toBe('1')
  await page.goto('/#/sr6')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Your runners' })).toBeVisible()
  await expect(page).toHaveURL(/#\/sr6$/)
})
