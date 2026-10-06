import { test, expect, type Page } from '@playwright/test'
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { usersFile } from '../server/auth.mjs'
import { createServer } from '../server/server.mjs'

// Books → Re-import all, both games, on a server of its own with the stub worker: book folders holding only their PDF and
// upload record (made up), the first one slow so the second is seen waiting. Ada is the admin; runs in order.
// Screenshots (light and dark) go to ISSUES_SHOTS, else .extract/screenshots/issues (not committed).
const PW = 'ada-password-1'
const SHOTS = process.env.ISSUES_SHOTS ?? '.extract/screenshots/issues'
const CONFIRM = (n: number) => `Re-import all ${n} books? Each book’s catalog, rules and samples are rebuilt from its PDF. Your edits, runners and NPCs are kept. This can take a while.`
let server: ReturnType<typeof createServer>, base = ''

test.describe.configure({ mode: 'serial' })
test.use({ baseURL: async ({}, use) => use(base), storageState: { cookies: [], origins: [] }, viewport: { width: 1400, height: 900 } })

/** a book folder as an upload leaves it, never imported: original.pdf (made up; "slow": the stub takes 1.5 s) and upload.xml */
function book(lib: string, id: string, file: string, marker = '') {
  mkdirSync(join(lib, id), { recursive: true })
  writeFileSync(join(lib, id, 'original.pdf'), Buffer.concat([Buffer.from(`%PDF-1.4 ${marker}\n`), Buffer.alloc(512)]))
  writeFileSync(join(lib, id, 'upload.xml'), `<upload file="${file}" size="530" sha256="00" uploaded="2026-10-06T00:00:00Z"/>\n`)
}

test.beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ca2-reimport-all-e2e-')), library = join(dir, 'library')
  cpSync('tests/fixtures/mini/custom', join(dir, 'custom'), { recursive: true })
  book(library, 'a1-first', 'Made-up Gadgets.pdf', 'slow')
  book(library, 'a2-second', 'Made-up Gizmos.pdf')
  book(join(library, 'sr6'), 's1-first', 'Made-up Sixth.pdf', 'slow')
  book(join(library, 'sr6'), 's2-second', 'Made-up Sixth Again.pdf')
  mkdirSync(join(library, '.config'), { recursive: true })
  writeFileSync(join(library, '.config', 'users.xml'), await usersFile([{ username: 'ada', password: PW, name: 'Ada Admin' }]))
  server = createServer({ staticDir: 'dist', charDir: join(dir, 'characters'), customDir: join(dir, 'custom'), libraryDir: library,
    python: [process.execPath, 'tests/fixtures/stub-worker.mjs'] })
  await new Promise<void>((ok, fail) => server.once('error', fail).listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/`
  mkdirSync(SHOTS, { recursive: true })
})
test.afterAll(() => { server.stopJobs(); server.close() })

async function signIn(page: Page, path: string) {
  await page.goto(path)
  await page.getByLabel('Username').fill('ada')
  await page.getByLabel('Password', { exact: true }).fill(PW)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByLabel('Username')).toHaveCount(0)
}
async function shoot(page: Page, name: string) {
  for (const theme of ['light', 'dark']) {
    await page.evaluate(v => { document.documentElement.dataset.theme = v }, theme)
    await page.screenshot({ path: `${SHOTS}/${name}-${theme}.png` })
  }
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light' })
}
const row = (page: Page, name: string) => page.locator('.book', { hasText: name })

/** The confirm (Cancel queues nothing), then Re-import all: the first book importing, the second waiting, the progress
 *  line, then both imported. */
async function reimportAll(page: Page, game: string, first: string, second: string) {
  await expect(row(page, first).locator('.state')).toHaveText('Not imported yet')
  await page.getByRole('button', { name: 'Re-import all books' }).click()
  const dlg = page.getByRole('dialog', { name: 'Re-import all books' })
  await expect(dlg).toContainText(CONFIRM(2))
  await dlg.getByRole('button', { name: 'Cancel' }).click()
  await expect(dlg).toBeHidden()
  await expect(row(page, first).locator('.state')).toHaveText('Not imported yet') // nothing queued

  await page.getByRole('button', { name: 'Re-import all books' }).click()
  await dlg.getByRole('button', { name: 'Re-import all' }).click()
  const line = page.locator('.reimport-all')
  await expect(line).toContainText(`Re-importing all books: 0 of 2 done, now ${first}.`)
  await expect(row(page, second).locator('.state')).toHaveText('Waiting')
  await expect(row(page, first).locator('.state')).toContainText('Importing…')
  await expect(page.getByRole('button', { name: 'Re-import all books' })).toBeDisabled()
  await shoot(page, `${game}-reimport-all-progress`)
  await expect(line).toContainText('Re-imported 2 books.', { timeout: 15000 })
  await expect(line.locator('progress')).toHaveAttribute('value', '2')
  for (const name of [first, second]) await expect(row(page, name).locator('.state')).toHaveText('Imported')
  await shoot(page, `${game}-reimport-all-done`)
}

test('Anarchy: Re-import all books', async ({ page }) => {
  await signIn(page, '/#/books')
  await reimportAll(page, 'ca2', 'Made-up Gadgets.pdf', 'Made-up Gizmos.pdf')
})

test('Shadowrun 6: Re-import all books', async ({ page }) => {
  await signIn(page, '/#/sr6/books')
  await reimportAll(page, 'sr6', 'Made-up Sixth.pdf', 'Made-up Sixth Again.pdf')
})
