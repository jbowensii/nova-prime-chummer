import { test, expect } from '@playwright/test'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { usersFile } from '../server/auth.mjs'
import { createServer } from '../server/server.mjs'
import { anarchyState } from './session'

// The AI review of core tables, end to end: a core rulebook import that couldn't read its weapons, metatypes and skills
// tables; the (stub) AI proposes made-up rows for them; the admin edits a metatype's ranges and a skill's specializations,
// accepts, and adds them to the core data; the Books page lists the tables read by AI and the app uses the new rows.
// On a server of its own (the tables it replaces would break the other specs), with the stub worker
// (tests/fixtures/stub-worker.mjs, marker "core-unread"); the importer's checks of these rows are importer/tests/test_crb_core.py's.
const PW = 'ada-password-1'
let server: ReturnType<typeof createServer>,
  base = '',
  dir = ''

test.describe.configure({ mode: 'serial' })
test.use({ baseURL: async ({}, use) => use(base), storageState: async ({}, use) => use(anarchyState(base)) })

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'ca2-coreai-'))
  cpSync('tests/fixtures/mini/custom', join(dir, 'custom'), { recursive: true })
  mkdirSync(join(dir, 'library', '.config'), { recursive: true })
  writeFileSync(join(dir, 'library', '.config', 'users.xml'), await usersFile([{ username: 'ada', password: PW, name: 'Ada Admin' }]))
  writeFileSync(
    join(dir, 'library', '.config', 'ai-keys.xml'), // a made-up key: the stub sends nothing anywhere
    '<ca2:aikeys xmlns:ca2="urn:chummer-anarchy2:config:1" version="1"><key provider="anthropic">sk-ant-e2e-not-a-real-key</key></ca2:aikeys>\n',
  )
  server = createServer({
    staticDir: 'dist',
    charDir: join(dir, 'characters'),
    customDir: join(dir, 'custom'),
    libraryDir: join(dir, 'library'),
    python: [process.execPath, 'tests/fixtures/stub-worker.mjs'],
  })
  await new Promise<void>((ok, fail) => server.once('error', fail).listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/`
})
test.afterAll(() => {
  server.stopJobs()
  server.close()
})

test('unread core tables: the AI proposes rows, the admin edits nested rows and accepts, the tables go live', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Username').fill('ada')
  await page.getByLabel('Password', { exact: true }).fill(PW)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Your runners' })).toBeVisible()

  await page.goto('/#/books')
  await page
    .getByLabel('Choose PDF files')
    .setInputFiles({ name: 'Made-up Core.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 core-unread\n%%EOF\n') })
  const row = page.locator('.book', { hasText: 'Made-up Core' })
  await expect(row).toContainText('Couldn’t read these core tables: weapons, metatypes, skills. Read them with AI, or upload a data pack.', { timeout: 10000 })
  await row.getByRole('button', { name: 'Read the tables with AI' }).click()
  await page.getByRole('button', { name: 'Send to Anthropic' }).click()
  await row.getByRole('link', { name: 'Review' }).click({ timeout: 10000 })

  await expect(page.locator('tr', { hasText: 'Glimmerkin' })).toContainText('Metatype')
  await expect(page.getByText('These rows replace the weapons, metatypes, skills tables')).toBeVisible()

  // a metatype's ranges: a minimum above the maximum can't be saved; a fixed one can
  await page.getByRole('button', { name: 'Edit Glimmerkin' }).click()
  const form = page.getByRole('dialog')
  await expect(form.getByLabel('Brawn min')).toHaveValue('1')
  await form.getByLabel('Brawn min').fill('5')
  await expect(form.getByRole('alert')).toHaveText('The str range needs a maximum of at least 1, and no lower than its minimum.')
  await expect(form.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  await form.getByLabel('Brawn min').fill('2')
  await form.getByLabel('Brawn max').fill('4')
  await form.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.locator('tr', { hasText: 'Glimmerkin' })).toContainText('Edited')

  // a skill's specializations: rename one, remove one, add one (a blank name can't be saved)
  await page.getByRole('button', { name: 'Edit Tinkering' }).click()
  await expect(form.getByLabel('Specialization 1 name')).toHaveValue('Gadgets')
  await form.getByLabel('Specialization 1 name').fill('Gizmos')
  await form.getByRole('button', { name: 'Remove specialization 2' }).click()
  await form.getByRole('button', { name: 'Add a specialization' }).click()
  await expect(form.getByRole('alert')).toHaveText('Each specialization needs a name.')
  await expect(form.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  await form.getByLabel('Specialization 2 name').fill('Wind-up Toys')
  await form.getByLabel('Specialization 2 attribute').selectOption({ label: 'Finesse' })
  await form.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.locator('tr', { hasText: 'Tinkering' })).toContainText('Edited')

  await page.locator('tr', { hasText: 'Pea Shooter' }).getByRole('button', { name: 'Accept' }).click()
  await expect(page.locator('tr', { hasText: 'Pea Shooter' })).toContainText('Accepted')
  await page.getByRole('button', { name: 'Add to the core data' }).click()

  // which tables came from AI
  await expect(row).toContainText('Read by AI from this book: weapons, metatypes, skills. Check them against the book.', { timeout: 10000 })
  await expect(row).not.toContainText('Couldn’t read these core tables')
  const core = (f: string) => readFileSync(join(dir, 'custom', 'imported', 'core', f), 'utf8')
  expect(core('metatypes.xml')).toContain('<range attr="str" min="2" max="4"/>')
  expect(core('skills.xml')).toContain(
    '<spec id="tinkering.gadgets" attr="log">Gizmos</spec><spec id="tinkering.wind-up-toys" attr="agi">Wind-up Toys</spec></skill>',
  )
  expect(core('skills.xml')).not.toContain('Clocks')

  // live: a new runner can be a Glimmerkin, with the edited range
  await page.goto('/')
  await page.getByRole('button', { name: 'New runner' }).click()
  await page.getByRole('dialog').getByLabel('Metatype').selectOption({ label: 'Glimmerkin' })
  await page.getByRole('button', { name: 'Create runner' }).click()
  await expect(page.getByText('Glimmerkin: STR 2–4, AGI 2–7')).toBeVisible()
})
