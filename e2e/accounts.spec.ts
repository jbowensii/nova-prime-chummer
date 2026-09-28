import { test, expect, type Page } from '@playwright/test'
import { cpSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from '../server/server.mjs'

// Accounts end to end, on a server of its own that starts with no accounts (the shared e2e server already has its admin):
// setup makes the first admin, who adds a player and an editor; each role sees what it should. The tests run in order and
// build on each other; every one starts signed out.
const PORT = 4190 // 127.0.0.1 only: a dev tool may hold the same port on ::1, where "localhost" would go
const PW = { ada: 'ada-password-1', pat: 'pat-password-1', eve: 'eve-password-1', pat2: 'pat-password-2' }
let server: ReturnType<typeof createServer>, code = ''

test.describe.configure({ mode: 'serial' })
test.use({ baseURL: `http://127.0.0.1:${PORT}/`, storageState: { cookies: [], origins: [] } })

test.beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ca2-accounts-'))
  cpSync('tests/fixtures/mini/custom', join(dir, 'custom'), { recursive: true })
  const log = console.log
  console.log = (...a: unknown[]) => { code = String(a[0]).match(/Setup code for the first admin: (\S+)/)?.[1] ?? code } // the "container log"
  try {
    server = createServer({ staticDir: 'dist', charDir: join(dir, 'characters'), customDir: join(dir, 'custom'), libraryDir: join(dir, 'library'),
      python: [process.execPath, 'tests/fixtures/stub-worker.mjs'] })
  } finally { console.log = log }
  await new Promise<void>((ok, fail) => server.once('error', fail).listen(PORT, '127.0.0.1', ok))
})
test.afterAll(() => { server.stopJobs(); server.close() })

async function signIn(page: Page, username: string, password: string) {
  await page.goto('/')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password', { exact: true }).fill(password)
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

const menu = (page: Page, name: string) => page.getByRole('button', { name, exact: true })

test('setup makes the first admin, who is signed in', async ({ page }) => {
  expect(code).toMatch(/^\w{4}-\w{4}-\w{4}$/)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Set up the first admin' })).toBeVisible()
  await page.getByLabel('Setup code').fill('AAAA-BBBB-CCCC')
  await page.getByLabel('Your name').fill('Ada Admin')
  await page.getByLabel('Username').fill('ada')
  await page.getByLabel('Password', { exact: true }).fill(PW.ada)
  await page.getByLabel('Password again').fill(PW.ada)
  await page.getByRole('button', { name: 'Create admin account' }).click()
  await expect(page.getByRole('alert')).toHaveText('That setup code is wrong: use the one in the server log.')
  await page.getByLabel('Setup code').fill(code)
  await page.getByRole('button', { name: 'Create admin account' }).click()
  await expect(page.getByRole('heading', { name: 'Your runners' })).toBeVisible()
  await menu(page, 'Ada Admin').click()
  await expect(page.getByText('Admin · ada')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByText('Admin · ada')).toBeHidden()
  await expect(menu(page, 'Ada Admin')).toBeFocused()
  await newRunner(page, 'Ada Runner')
})

test('the admin adds a player and an editor; the last admin can’t be disabled', async ({ page }) => {
  await signIn(page, 'ada', PW.ada)
  await expect(page.getByRole('link', { name: 'Books', exact: true })).toBeVisible()
  await menu(page, 'Ada Admin').click()
  await page.getByRole('link', { name: 'Users' }).click()
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()
  for (const [name, username, role] of [['Pat Player', 'pat', 'player'], ['Eve Editor', 'eve', 'editor']]) {
    await page.getByRole('button', { name: 'Add account' }).click()
    const form = page.getByRole('dialog')
    await form.getByLabel('Name', { exact: true }).fill(name)
    await form.getByLabel('Username').fill(username)
    await form.getByLabel('Role').selectOption(role)
    await form.getByLabel('Password', { exact: true }).fill(PW[username as 'pat' | 'eve'])
    await form.getByRole('button', { name: 'Add account' }).click()
    await expect(page.getByRole('status')).toHaveText(`Added ${name}. They can sign in as ${username}.`)
    await expect(page.getByRole('row', { name: new RegExp(name) })).toContainText(role === 'player' ? 'Player' : 'Editor')
  }
  await page.getByRole('button', { name: 'Disable Ada Admin' }).click()
  await expect(page.getByRole('alert')).toHaveText('Couldn’t disable Ada Admin. There must always be an enabled admin: make another account admin first.')
  await page.getByRole('button', { name: 'Delete Ada Admin' }).click()
  await expect(page.getByRole('dialog')).toContainText('still has 1 runner')
})

test('a player sees only their own runners and no Books, Users or Edit', async ({ page }) => {
  await signIn(page, 'pat', PW.pat)
  await expect(page.getByRole('link', { name: 'Books', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Ada Runner' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'My runners' })).toHaveCount(0)
  await menu(page, 'Pat Player').click()
  await expect(page.getByText('Player · pat')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Users' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await newRunner(page, 'Pat Runner')
  await expect(page.getByRole('link', { name: 'Pat Runner' })).toBeVisible()
  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByRole('dialog')).not.toContainText('Backup')
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()

  await page.goto('/#/rules')
  await expect(page.getByRole('heading', { name: 'Rules reference' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add a rule' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Edit / })).toHaveCount(0)
  for (const hash of ['#/books', '#/users']) {
    await page.goto(`/${hash}`)
    await expect(page.getByRole('heading', { name: 'Your runners' })).toBeVisible()
  }

  // no core data: the setup screen tells a player to wait for the admin, with no way into Books
  await page.route('**/custom/imported/core/**', r => r.fulfill({ status: 404, body: 'not found' }))
  await page.goto('/')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'The game data isn’t set up yet' })).toBeVisible()
  await expect(page.getByText('The admin hasn’t set up the game data yet.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open Books' })).toHaveCount(0)
  await expect(menu(page, 'Pat Player')).toBeVisible() // they can still sign out
})

test('an editor edits an entry and reads the player’s runner read-only', async ({ page }) => {
  await signIn(page, 'eve', PW.eve)
  await expect(page.getByRole('link', { name: 'Books', exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'My runners' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Pat Player’s runners' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Ada Admin’s runners' })).toBeVisible()
  await page.getByRole('link', { name: 'Pat Runner' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Read only' })).toContainText('Read only — Pat Player’s runner.')
  await expect(page.getByLabel('Street name')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0)
  await page.getByRole('link', { name: 'Print', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Print or save as PDF' })).toBeVisible()

  await page.goto('/#/rules')
  const rule = page.locator('.rule-list > div', { hasText: 'Risk Reduction (spec)' })
  await rule.getByRole('button', { name: 'Edit Risk Reduction (spec)' }).click()
  await page.getByRole('dialog').last().getByLabel('Description', { exact: true }).fill('Reroll a die, made-up text.')
  await page.getByRole('dialog').last().getByRole('button', { name: 'Save changes' }).click()
  await expect(page.locator('.toast', { hasText: 'Saved Risk Reduction (spec).' })).toBeVisible()
  await expect(rule.locator('dd')).toHaveText('Reroll a die, made-up text.')
})

test('change password, sign out, sign in with the new one', async ({ page }) => {
  await signIn(page, 'pat', PW.pat)
  await menu(page, 'Pat Player').click()
  await page.getByRole('button', { name: 'Change password' }).click()
  const d = page.getByRole('dialog')
  await d.getByLabel('Current password').fill(PW.pat)
  await d.getByLabel('New password', { exact: true }).fill(PW.pat2)
  await d.getByLabel('New password again').fill(PW.pat2)
  await d.getByRole('button', { name: 'Change password' }).click()
  await expect(d.getByRole('status')).toContainText('Password changed.')
  await d.getByRole('button', { name: 'Done' }).click()
  await menu(page, 'Pat Player').click()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await page.getByLabel('Username').fill('pat')
  await page.getByLabel('Password', { exact: true }).fill(PW.pat)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toHaveText('Wrong username or password.')
  await page.getByLabel('Password', { exact: true }).fill(PW.pat2)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('link', { name: 'Pat Runner' })).toBeVisible()
})

test('an ended session asks to sign in again over the page and keeps the unsaved change', async ({ page, context }) => {
  await signIn(page, 'pat', PW.pat2)
  await page.getByRole('link', { name: 'Pat Runner' }).click()
  await expect(page.getByLabel('Street name')).toHaveValue('Pat Runner')
  await context.clearCookies()
  await page.getByLabel('Street name').fill('Pat Runner Two')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByText('You were signed out')).toBeVisible()
  const saved = page.waitForResponse(r => r.request().method() === 'PUT' && !!r.request().postData()?.includes('streetName="Pat Runner Two"') && r.ok())
  await page.getByLabel('Username').fill('pat')
  await page.getByLabel('Password', { exact: true }).fill(PW.pat2)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await saved
  await expect(page.getByRole('heading', { name: 'Sign in' })).toHaveCount(0)
  await expect(page.getByLabel('Street name')).toHaveValue('Pat Runner Two')
})

test('too many wrong passwords pause sign-in', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Username').fill('eve')
  for (let i = 0; i < 5; i++) {
    await page.getByLabel('Password', { exact: true }).fill('not-the-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('alert')).toHaveText('Wrong username or password.')
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue('')
  }
  await page.getByLabel('Password', { exact: true }).fill(PW.eve)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toHaveText('Too many tries, so this is paused. Try again in 15 minutes.')
})
