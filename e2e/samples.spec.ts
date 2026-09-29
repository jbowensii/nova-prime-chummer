import { test, expect, type Page } from '@playwright/test'
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { usersFile } from '../server/auth.mjs'
import { createServer } from '../server/server.mjs'

// Sample characters on a server of its own: the made-up imported books (tests/fixtures/mini/custom) bring one sample
// runner, "Test Face" (custom/imported/samples.xml). Ada is the admin, Pat a player. Runs in order.
const PW = { ada: 'ada-password-1', pat: 'pat-password-1' }
let server: ReturnType<typeof createServer>, base = '', dir = ''

test.describe.configure({ mode: 'serial' })
test.use({ baseURL: async ({}, use) => use(base), storageState: { cookies: [], origins: [] } })

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'ca2-samples-'))
  cpSync('tests/fixtures/mini/custom', join(dir, 'custom'), { recursive: true })
  mkdirSync(join(dir, 'library', '.config'), { recursive: true })
  writeFileSync(join(dir, 'library', '.config', 'users.xml'), await usersFile([{ username: 'ada', password: PW.ada, name: 'Ada Admin' },
    { username: 'pat', password: PW.pat, role: 'player', name: 'Pat Player' }]))
  server = createServer({ staticDir: 'dist', charDir: join(dir, 'characters'), customDir: join(dir, 'custom'), libraryDir: join(dir, 'library'),
    python: [process.execPath, 'tests/fixtures/stub-worker.mjs'] })
  await new Promise<void>((ok, fail) => server.once('error', fail).listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/`
})
test.afterAll(() => { server.stopJobs(); server.close() })

async function signIn(page: Page, username: 'ada' | 'pat') {
  await page.goto('/')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password', { exact: true }).fill(PW[username])
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Your runners' })).toBeVisible()
}
const load = (page: Page) => page.getByRole('button', { name: 'Load sample characters' }).click()
const faces = (page: Page) => page.getByRole('link', { name: 'Test Face', exact: true })

test('load sample characters: the imported books’ runners, once', async ({ page }) => {
  await signIn(page, 'ada')
  await load(page)
  await expect(page.getByRole('status')).toHaveText('Added 1 sample characters.')
  await expect(faces(page)).toHaveCount(1)
  await load(page)
  await expect(page.getByRole('status')).toHaveText('The sample characters are already in your library.')
})

test('a re-import gives the sample a new id and file: loading again still adds no copy', async ({ page }) => {
  // what the owner saw: the samples were loaded, a re-import renamed the sample's file and id, "Load" added them again
  const imported = join(dir, 'custom', 'imported'), list = join(imported, 'samples.xml')
  const old = join(imported, 'pregens', 'samples', 'pregens.test-face.xml'), moved = join(imported, 'pregens', 'samples', 'pregens.test-face-2.xml')
  writeFileSync(moved, readFileSync(old, 'utf8').replace('id="pregens.test-face"', 'id="pregens.test-face-2"'))
  renameSync(old, join(dir, 'old-sample.xml'))
  writeFileSync(list, readFileSync(list, 'utf8').replace('pregens.test-face.xml', 'pregens.test-face-2.xml'))
  await signIn(page, 'ada')
  await load(page)
  await expect(page.getByRole('status')).toHaveText('The sample characters are already in your library.')
  await expect(faces(page)).toHaveCount(1)
})

test('each account gets copies of its own', async ({ page }) => {
  await signIn(page, 'pat')
  await load(page)
  await expect(page.getByRole('status')).toHaveText('Added 1 sample characters.')
  await expect(faces(page)).toHaveCount(1)
  expect(readdirSync(join(dir, 'characters', 'pat'))).toHaveLength(1)
  expect(readdirSync(join(dir, 'characters', 'ada'))).toHaveLength(1)
})

test('tidy-up: unmodified duplicates from before sample keys move to the trash; an edited copy stays', async ({ page }) => {
  await signIn(page, 'ada')
  // a library from 0.4.0: the sample loaded twice more under the ids re-imports gave it, and a copy Ada changed
  const xml = readFileSync(join(dir, 'old-sample.xml'), 'utf8')
  const put = (id: string, body: string) => page.request.put(`${base}api/characters/${id}`,
    { data: body.replace('id="pregens.test-face"', `id="${id}"`), headers: { 'Content-Type': 'application/xml', Origin: base.replace(/\/$/, '') } })
  for (const [id, body] of [['pregens.test-face', xml], ['pregens.test-face-2', xml], ['pregens.test-face-3', xml.replace('</background>', '</background><notes>Ada’s own notes.</notes>')]])
    expect((await put(id, body)).status()).toBe(201)
  await page.reload()
  await expect(faces(page)).toHaveCount(5) // and Pat’s, which the admin also sees
  await expect(page.getByText('2 sample characters are extra copies, unchanged since they were loaded.')).toBeVisible()
  await page.getByRole('button', { name: 'Tidy up' }).click()
  const dialog = page.getByRole('dialog', { name: 'Tidy up the sample characters' })
  await expect(dialog.getByRole('listitem')).toHaveText(['Test Face', 'Test Face'])
  await dialog.getByRole('button', { name: 'Move to trash' }).click()
  await expect(page.getByRole('status')).toHaveText('Moved to your trash: Test Face, Test Face.')
  await expect(faces(page)).toHaveCount(3)
  await expect(page.getByRole('button', { name: 'Tidy up' })).toHaveCount(0)
  expect(readdirSync(join(dir, 'characters', 'ada', '.trash'))).toHaveLength(2)
  const kept = readdirSync(join(dir, 'characters', 'ada')).filter(f => f.endsWith('.xml')).map(f => readFileSync(join(dir, 'characters', 'ada', f), 'utf8'))
  expect(kept.filter(x => x.includes('Ada’s own notes.'))).toHaveLength(1) // the edited copy
  await load(page)
  await expect(page.getByRole('status')).toHaveText('The sample characters are already in your library.')
})

test('tidy-up that fails halfway says what moved and what didn’t, and closes', async ({ page }) => {
  await signIn(page, 'ada')
  const xml = readFileSync(join(dir, 'old-sample.xml'), 'utf8')
  for (const id of ['pregens.test-face-4', 'pregens.test-face-5'])
    expect((await page.request.put(`${base}api/characters/${id}`, { data: xml.replace('id="pregens.test-face"', `id="${id}"`),
      headers: { 'Content-Type': 'application/xml', Origin: base.replace(/\/$/, '') } })).status()).toBe(201)
  await page.reload()
  let deletes = 0
  await page.route('**/api/characters/**', r => r.request().method() === 'DELETE' && ++deletes === 2
    ? r.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'a restore is running; try again when it’s done' }) })
    : r.continue())
  await page.getByRole('button', { name: 'Tidy up' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Move to trash' }).click()
  await expect(page.getByRole('status')).toHaveText('Moved to your trash: Test Face. Couldn’t move the last copy: a restore is running; try again when it’s done. Try Tidy up again in a moment.')
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page.getByText('A sample character is in your library twice, unchanged since they were loaded.')).toBeVisible()
  await page.unroute('**/api/characters/**')
  await page.getByRole('button', { name: 'Tidy up' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Move to trash' }).click()
  await expect(page.getByRole('status')).toHaveText('Moved to your trash: Test Face.')
  await expect(page.getByRole('button', { name: 'Tidy up' })).toHaveCount(0)
})
