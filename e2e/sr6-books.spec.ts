import { test, expect } from '@playwright/test'
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { usersFile } from '../server/auth.mjs'
import { createServer } from '../server/server.mjs'

// The SR6 Books page's calm states, as the importer leaves them (importer/sr6/run.py): a known file with nothing to
// import (skipped) and an older printing of a book a newer one is loaded for (superseded). Made-up names; Ada the admin.
const PW = 'ada-password-1'
let server: ReturnType<typeof createServer>, base = ''

test.use({ baseURL: async ({}, use) => use(base), storageState: { cookies: [], origins: [] } })

test.beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ca2-sr6-books-')), config = join(dir, 'library', '.config')
  cpSync('tests/fixtures/mini/custom', join(dir, 'custom'), { recursive: true })
  mkdirSync(config, { recursive: true })
  writeFileSync(join(config, 'users.xml'), await usersFile([{ username: 'ada', password: PW, name: 'Ada Admin' }]))
  const book = (id: string, state: string, message: string, imp: string) => {
    const d = join(dir, 'library', 'sr6', id)
    mkdirSync(d, { recursive: true })
    writeFileSync(join(d, 'status.xml'), `<status state="${state}" updated="2026-10-05T00:00:00Z">${message}</status>\n`)
    writeFileSync(join(d, 'import.xml'), `<import ${imp}><files/><report/></import>\n`)
  }
  book('a-errata', 'skipped', 'Nothing to import: errata (applied with its book)', 'file="made-up-errata.pdf" sha256="00"')
  book('b-older', 'superseded', 'Superseded by City Edition Made-Up (CAT00000M, 2099)',
    'file="made-up-older.pdf" sha256="01" recipe="crb" source="CRB" name="Shadowrun, Sixth World Core Rulebook"')
  book('c-unknown', 'failed', 'no SR6 recipe matched this book', 'file="made-up-other.pdf" sha256="02"')
  server = createServer({ staticDir: 'dist', charDir: join(dir, 'characters'), customDir: join(dir, 'custom'), libraryDir: join(dir, 'library'),
    python: [process.execPath, 'tests/fixtures/stub-worker.mjs'] })
  await new Promise<void>((ok, fail) => server.once('error', fail).listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/`
})
test.afterAll(() => { server.stopJobs(); server.close() })

test('SR6 Books: skipped and superseded files are calm, an unknown one fails', async ({ page }) => {
  await page.goto('/#/sr6/books')
  await page.getByLabel('Username').fill('ada')
  await page.getByLabel('Password', { exact: true }).fill(PW)
  await page.getByRole('button', { name: 'Sign in' }).click()

  const errata = page.locator('.book', { hasText: 'made-up-errata.pdf' })
  await expect(errata.locator('.state')).toHaveText('Skipped')
  await expect(errata.locator('.muted')).toHaveText('Nothing to import: errata (applied with its book)')
  await expect(errata.locator('.err')).toHaveCount(0)
  await expect(errata.getByRole('button', { name: 'Remove' })).toBeVisible()

  const older = page.locator('.book', { hasText: 'made-up-older.pdf' })
  await expect(older.locator('.state')).toHaveText('Superseded')
  await expect(older.locator('.muted')).toHaveText('Superseded by City Edition Made-Up (CAT00000M, 2099)')
  await expect(older.locator('.err')).toHaveCount(0)
  await expect(older.getByRole('button', { name: 'Remove' })).toBeVisible()
  await expect(older.getByRole('button', { name: 'Re-import' })).toBeVisible()
  await expect(page.locator('.supported li', { hasText: /\bCRB\b(?!-)/ })).not.toContainText('Imported') // not loaded

  const other = page.locator('.book', { hasText: 'made-up-other.pdf' })
  await expect(other.locator('.state')).toHaveText('Failed')
  await expect(other.locator('.err')).toHaveText('no SR6 recipe matched this book')
})
