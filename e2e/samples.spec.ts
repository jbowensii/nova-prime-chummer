import { test, expect, type Page } from '@playwright/test'
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { usersFile } from '../server/auth.mjs'
import { createServer } from '../server/server.mjs'

// Example characters on a server of its own, all made up (tests/fixtures/mini/custom): "Test Face" comes from a canon
// book (TESTC), a non-canon one (PREGENS; both in custom/imported/samples.xml), the first-release built-in set
// (custom/samples/builtin/, canon, no set.xml) and a non-canon house set (custom/samples/house/set.xml); "Old Timer" only
// from the built-in set. One copy per character and canon-ness: TESTC's and PREGENS's Test Face, and Old Timer.
// Ada is the admin, Pat a player. Runs in order.
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
const load = (page: Page) => page.getByRole('button', { name: 'Load example characters' }).click()
const faces = (page: Page) => page.getByRole('link', { name: 'Test Face', exact: true })
const own = (who: string) => readdirSync(join(dir, 'characters', who)).filter(f => f.endsWith('.xml'))
  .map(f => readFileSync(join(dir, 'characters', who, f), 'utf8'))
const put = (page: Page, id: string, body: string) => page.request.put(`${base}api/characters/${id}`,
  { data: body, headers: { 'Content-Type': 'application/xml', Origin: base.replace(/\/$/, '') } })

test('load example characters: one canon and one non-canon copy of each, once', async ({ page }) => {
  await signIn(page, 'ada')
  await load(page)
  await expect(page.getByRole('status')).toHaveText('Added 3 example characters.')
  await expect(faces(page)).toHaveCount(2)
  await expect(page.getByRole('link', { name: 'Old Timer', exact: true })).toHaveCount(1)
  expect(own('ada').map(x => x.match(/sampleKey="([^"]*)"/)?.[1]).sort()).toEqual(['old-timer|canon', 'test-face|canon', 'test-face|noncanon'])
  expect(own('ada').filter(x => x.includes('origin="TESTC"'))).toHaveLength(1) // the canon book's, not the built-in set's
  await load(page)
  await expect(page.getByRole('status')).toHaveText('The example characters are already in your library.')
  await expect(faces(page)).toHaveCount(2)
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
  await expect(page.getByRole('status')).toHaveText('The example characters are already in your library.')
  await expect(faces(page)).toHaveCount(2)
})

test('each account gets copies of its own', async ({ page }) => {
  await signIn(page, 'pat')
  await load(page)
  await expect(page.getByRole('status')).toHaveText('Added 3 example characters.')
  await expect(faces(page)).toHaveCount(2)
  expect(own('pat')).toHaveLength(3)
  expect(own('ada')).toHaveLength(3)
  await load(page)
  await expect(page.getByRole('status')).toHaveText('The example characters are already in your library.')
})

test('tidy-up: extra copies go to the trash; the book’s version and an edited copy stay', async ({ page }) => {
  await signIn(page, 'ada')
  // an old library: the first-release built-in Test Face (canon), 0.4.0's PREGENS copies under the ids re-imports gave
  // it (non-canon), and one of those that Ada changed
  const legacy = readFileSync(join(dir, 'custom', 'samples', 'builtin', 'sample-test-face.xml'), 'utf8')
  const xml = readFileSync(join(dir, 'old-sample.xml'), 'utf8'), as = (id: string) => xml.replace('id="pregens.test-face"', `id="${id}"`)
  expect((await put(page, 'sample-test-face', legacy)).status()).toBe(201)
  for (const id of ['pregens.test-face', 'pregens.test-face-2']) expect((await put(page, id, as(id))).status()).toBe(201)
  const edited = as('pregens.test-face-3').replace('updatedAt="2026-09-27T00:00:00.000Z"', 'updatedAt="2026-09-28T10:00:00.000Z"')
    .replace('</background>', '</background><notes>Ada’s own notes.</notes>')
  expect((await put(page, 'pregens.test-face-3', edited)).status()).toBe(201)
  await page.reload()
  await expect(page.getByText('4 example characters are extra copies, unchanged since they were loaded.')).toBeVisible()
  await page.getByRole('button', { name: 'Tidy up' }).click()
  const dialog = page.getByRole('dialog', { name: 'Tidy up the example characters' })
  await expect(dialog.getByRole('listitem')).toHaveCount(4)
  await expect(dialog.getByRole('listitem').filter({ hasText: 'Test Face (built-in, first release)' })).toHaveCount(1)
  await dialog.getByRole('button', { name: 'Move to trash' }).click()
  await expect(page.getByRole('status')).toHaveText('Moved to your trash: Test Face, Test Face, Test Face, Test Face.')
  await expect(page.getByRole('button', { name: 'Tidy up' })).toHaveCount(0)
  expect(readdirSync(join(dir, 'characters', 'ada', '.trash'))).toHaveLength(4)
  const kept = own('ada')
  expect(kept).toHaveLength(3) // Old Timer, TESTC's Test Face, the edited copy
  expect(kept.filter(x => x.includes('origin="TESTC"'))).toHaveLength(1)
  expect(kept.filter(x => x.includes('Ada’s own notes.'))).toHaveLength(1)
  expect(own('pat')).toHaveLength(3) // never another account's
  await load(page)
  await expect(page.getByRole('status')).toHaveText('The example characters are already in your library.')
})

test('tidy-up that fails halfway says what moved and what didn’t, and closes', async ({ page }) => {
  await signIn(page, 'ada')
  const legacy = readFileSync(join(dir, 'custom', 'samples', 'builtin', 'sample-old-timer.xml'), 'utf8')
  for (const id of ['sample-old-timer', 'sample-old-timer-2'])
    expect((await put(page, id, legacy.replace('id="sample-old-timer"', `id="${id}"`))).status()).toBe(201)
  await page.reload()
  let deletes = 0
  await page.route('**/api/characters/**', r => r.request().method() === 'DELETE' && ++deletes === 2
    ? r.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'a restore is running; try again when it’s done' }) })
    : r.continue())
  await page.getByRole('button', { name: 'Tidy up' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Move to trash' }).click()
  await expect(page.getByRole('status')).toHaveText('Moved to your trash: Old Timer. Couldn’t move the last copy: a restore is running; try again when it’s done. Try Tidy up again in a moment.')
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page.getByText('An example character is in your library twice, unchanged since they were loaded.')).toBeVisible()
  await page.unroute('**/api/characters/**')
  await page.getByRole('button', { name: 'Tidy up' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Move to trash' }).click()
  await expect(page.getByRole('status')).toHaveText('Moved to your trash: Old Timer.')
  await expect(page.getByRole('button', { name: 'Tidy up' })).toHaveCount(0)
})

test('when the example sets can’t be read, the books’ examples still load and the error is shown', async ({ page }) => {
  const mine = readdirSync(join(dir, 'characters', 'pat')).find(f => readFileSync(join(dir, 'characters', 'pat', f), 'utf8').includes('origin="PREGENS"'))!
  renameSync(join(dir, 'characters', 'pat', mine), join(dir, 'pat-pregens-copy.xml')) // Pat's PREGENS copy is gone
  await signIn(page, 'pat')
  await page.route('**/api/samples', r => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'server error' }) }))
  await load(page)
  await expect(page.getByRole('status')).toHaveText('Added 1 example character. Couldn’t read the server’s example sets: server error.')
  expect(own('pat').filter(x => x.includes('origin="PREGENS"'))).toHaveLength(1)
})
