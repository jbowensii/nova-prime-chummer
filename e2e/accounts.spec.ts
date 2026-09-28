import { test, expect, type Page } from '@playwright/test'
import { cpSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from '../server/server.mjs'

// Accounts end to end, on a server of its own that starts with no accounts (the shared e2e server already has its admin):
// setup makes the first admin, who adds a player and an editor; each role sees what it should. The tests run in order and
// build on each other; every one starts signed out.
const PW = { ada: 'ada-password-1', pat: 'pat-password-1', eve: 'eve-password-1', pat2: 'pat-password-2' }
let server: ReturnType<typeof createServer>, code = '', base = ''

test.describe.configure({ mode: 'serial' })
// a free port on 127.0.0.1 (a dev tool may hold one on ::1, where "localhost" would go), known once beforeAll has run
test.use({ baseURL: async ({}, use) => use(base), storageState: { cookies: [], origins: [] } })

test.beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ca2-accounts-'))
  cpSync('tests/fixtures/mini/custom', join(dir, 'custom'), { recursive: true })
  const log = console.log
  console.log = (...a: unknown[]) => { code = String(a[0]).match(/Setup code for the first admin: (\S+)/)?.[1] ?? code } // the "container log"
  try {
    server = createServer({ staticDir: 'dist', charDir: join(dir, 'characters'), customDir: join(dir, 'custom'), libraryDir: join(dir, 'library'),
      python: [process.execPath, 'tests/fixtures/stub-worker.mjs'] })
  } finally { console.log = log }
  await new Promise<void>((ok, fail) => server.once('error', fail).listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/`
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
const PHONE = { width: 390, height: 844 }
/** No sideways scrolling of the page itself. */
async function fits(page: Page, what: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${what} scrolls sideways`).toBeLessThanOrEqual(0)
}

test('setup makes the first admin, who is signed in', async ({ page }) => {
  expect(code).toMatch(/^\w{4}-\w{4}-\w{4}$/)
  await page.setViewportSize(PHONE)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Set up the first admin' })).toBeVisible()
  await fits(page, 'the setup page')
  await page.setViewportSize({ width: 1400, height: 900 })
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
  const puts: string[] = []
  page.on('request', r => { if (r.method() === 'PUT') puts.push(r.url()) })
  await page.getByRole('link', { name: 'Pat Runner' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Read only' })).toContainText('Read only — Pat Player’s runner.')
  await expect(page.getByLabel('Street name')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0)
  await page.getByRole('link', { name: 'Print', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Print or save as PDF' })).toBeVisible()
  await page.goto('/') // leaving flushes an editor's last change: someone else's runner has none
  await expect(page.getByRole('heading', { name: 'My runners' })).toBeVisible()
  expect(puts).toEqual([])

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
  // signing out straight after a change: it is saved before the session ends
  await page.getByRole('link', { name: 'Pat Runner' }).click()
  await page.getByLabel('Street name').fill('Pat Runner One')
  await menu(page, 'Pat Player').click()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await page.getByLabel('Username').fill('pat')
  await page.getByLabel('Password', { exact: true }).fill(PW.pat)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toHaveText('Wrong username or password.')
  await page.getByLabel('Password', { exact: true }).fill(PW.pat2)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('link', { name: 'Pat Runner One' })).toBeVisible()
})

test('an ended session asks to sign in again over the page and keeps the unsaved change', async ({ page, context }) => {
  await signIn(page, 'pat', PW.pat2)
  await page.getByRole('link', { name: 'Pat Runner One' }).click()
  await expect(page.getByLabel('Street name')).toHaveValue('Pat Runner One')
  await context.clearCookies()
  await page.getByLabel('Street name').fill('Pat Runner Two')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByText('You were signed out')).toBeVisible()
  await expect(page.getByText('Signing in as someone else discards this page’s unsaved changes.')).toBeVisible()
  const saved = page.waitForResponse(r => r.request().method() === 'PUT' && !!r.request().postData()?.includes('streetName="Pat Runner Two"') && r.ok())
  await page.getByLabel('Username').fill('pat')
  await page.getByLabel('Password', { exact: true }).fill(PW.pat2)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await saved
  await expect(page.getByRole('heading', { name: 'Sign in' })).toHaveCount(0)
  await expect(page.getByLabel('Street name')).toHaveValue('Pat Runner Two')
})

test('someone else signing in over the page: the unsaved change is never sent', async ({ page, context }) => {
  await signIn(page, 'pat', PW.pat2)
  await page.getByRole('link', { name: 'Pat Runner Two' }).click()
  await expect(page.getByLabel('Street name')).toHaveValue('Pat Runner Two')
  await context.clearCookies()
  const sent: string[] = []
  page.on('request', r => { if (r.method() === 'PUT' && r.postData()?.includes('Pat Unsaved')) sent.push(r.url()) })
  await page.getByLabel('Street name').fill('Pat Unsaved')
  await expect(page.getByText('Signing in as someone else discards this page’s unsaved changes.')).toBeVisible()
  expect(sent).toHaveLength(1) // the one that found the session gone (401)
  await page.getByLabel('Username').fill('ada')
  await page.getByLabel('Password', { exact: true }).fill(PW.ada)
  await page.getByRole('button', { name: 'Sign in' }).click()
  // a fresh page, as Ada: Pat's runner, read-only, as it was saved
  await expect(page.getByText('Read only — Pat Player’s runner.')).toBeVisible()
  await expect(page.getByLabel('Street name')).toHaveValue('Pat Runner Two')
  await page.waitForTimeout(500)
  expect(sent).toHaveLength(1)
})

test('the sign-in form comes up over an open dialog; keyboard and phone both get through', async ({ page, context }) => {
  for (const size of [{ width: 1400, height: 900 }, PHONE]) {
    await page.setViewportSize(size)
    await context.clearCookies() // signed out from the round before
    await signIn(page, 'pat', PW.pat2)
    await menu(page, 'Pat Player').click()
    await page.getByRole('button', { name: 'Change password' }).click()
    const d = page.getByRole('dialog', { name: 'Change password' })
    await d.getByLabel('Current password').fill(PW.pat2)
    await d.getByLabel('New password', { exact: true }).fill('pat-password-3')
    await d.getByLabel('New password again').fill('pat-password-3')
    await context.clearCookies()
    await d.getByRole('button', { name: 'Change password' }).click()
    const over = page.getByRole('dialog', { name: 'Sign in again' })
    await expect(over.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await expect(over.getByLabel('Username')).toBeFocused()
    if (size === PHONE) {
      await fits(page, 'the sign-in form over the page')
      await page.keyboard.press('Escape') // it can't be dismissed
      await expect(over).toBeVisible()
      await over.getByLabel('Username').click()
      await over.getByLabel('Username').fill('pat')
      await over.getByLabel('Password', { exact: true }).fill(PW.pat2)
      await over.getByRole('button', { name: 'Sign in' }).click()
    } else {
      await page.keyboard.type('pat')
      await page.keyboard.press('Tab')
      await page.keyboard.type(PW.pat2)
      await page.keyboard.press('Enter')
    }
    await expect(over).toHaveCount(0)
    await expect(d.getByRole('alert')).toBeVisible() // the refused change is still there to try again
    await d.getByRole('button', { name: 'Cancel' }).click()
    await expect(d).toHaveCount(0)
  }
})

test('phone width: the accounts screens don’t scroll sideways', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await fits(page, 'sign-in')
  await page.goto('/#/setup/reset')
  await expect(page.getByRole('heading', { name: 'Reset a password' })).toBeVisible()
  await fits(page, 'recovery')
  await signIn(page, 'ada', PW.ada)
  await menu(page, 'Ada Admin').click()
  await fits(page, 'the account menu')
  await page.getByRole('link', { name: 'Users' }).click()
  await expect(page.getByRole('cell', { name: 'Pat Player', exact: true })).toBeVisible()
  await fits(page, 'Users')
  await page.getByRole('button', { name: 'Edit Pat Player' }).click()
  await fits(page, 'the edit dialog')
  await page.goto('/')
  await page.getByRole('link', { name: 'Pat Runner Two' }).click()
  await expect(page.getByText('Read only —')).toBeVisible()
  await fits(page, 'a read-only runner')
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
