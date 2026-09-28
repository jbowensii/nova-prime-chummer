import { test, expect, type Page } from '@playwright/test'
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { usersFile } from '../server/auth.mjs'
import { createServer } from '../server/server.mjs'
import { fakeIssuer } from '../tests/fixtures/fake-issuer.mjs'

// Sign in with Authelia end to end, against the made-up issuer (tests/fixtures/fake-issuer.mjs) on a server of its own:
// the admin sets it up in Settings → Sign-in, then Kim (an Authelia account) signs in through it; someone without an
// account comes back to the sign-in page with a plain message. Runs in order; every test starts signed out.
const ADMIN_PW = 'ada-password-1'
let server: ReturnType<typeof createServer>, issuer: Awaited<ReturnType<typeof fakeIssuer>>, base = ''

test.describe.configure({ mode: 'serial' })
test.use({ baseURL: async ({}, use) => use(base), storageState: { cookies: [], origins: [] } })

test.beforeAll(async () => {
  issuer = await fakeIssuer()
  const dir = mkdtempSync(join(tmpdir(), 'ca2-oidc-e2e-'))
  cpSync('tests/fixtures/mini/custom', join(dir, 'custom'), { recursive: true })
  mkdirSync(join(dir, 'library', '.config'), { recursive: true })
  writeFileSync(join(dir, 'library', '.config', 'users.xml'), await usersFile([{ username: 'ada', password: ADMIN_PW, name: 'Ada Admin' },
    { username: 'kim', method: 'authelia', role: 'player', name: 'Kim Player' }]))
  server = createServer({ staticDir: 'dist', charDir: join(dir, 'characters'), customDir: join(dir, 'custom'), libraryDir: join(dir, 'library'),
    python: [process.execPath, 'tests/fixtures/stub-worker.mjs'] })
  await new Promise<void>((ok, fail) => server.once('error', fail).listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/`
})
test.afterAll(() => { server.stopJobs(); server.close(); issuer.close() })

async function noViolations(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { violations: string[] }
    w.violations = []
    document.addEventListener('securitypolicyviolation', e => w.violations.push(`${e.violatedDirective} ${e.blockedURI}`))
  })
  return async () => expect(await page.evaluate(() => (window as unknown as { violations: string[] }).violations)).toEqual([])
}

test('the admin sets up Sign in with Authelia in Settings', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Sign in with Authelia' })).toHaveCount(0)
  await page.getByLabel('Username').fill('ada')
  await page.getByLabel('Password', { exact: true }).fill(ADMIN_PW)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Your runners' })).toBeVisible()
  await page.getByRole('button', { name: 'Settings' }).click()
  const box = page.getByRole('group', { name: 'Sign-in' })
  await expect(box.getByText(`${base}api/auth/oidc/callback`)).toBeVisible()
  await box.getByLabel('Issuer address').fill(`${issuer.base}/`)
  await box.getByRole('button', { name: 'Test' }).click()
  await expect(box.getByRole('alert')).toHaveText(`The issuer calls itself ${issuer.base}: enter exactly that address.`)
  await box.getByLabel('Issuer address').fill(issuer.base)
  await box.getByRole('button', { name: 'Test' }).click()
  await expect(box.getByRole('status')).toHaveText('Found the issuer: it signs ID tokens with RS256 or ES256.')
  await box.getByLabel('Client ID').fill(issuer.clientId)
  await box.getByLabel('Show “Sign in with Authelia” on the sign-in page').check()
  await box.getByRole('button', { name: 'Save sign-in settings' }).click()
  await expect(box.getByRole('alert')).toHaveText('Enter the issuer address, client ID and client secret before turning it on.')
  await box.getByLabel('Client secret', { exact: true }).fill(issuer.secret)
  await box.getByRole('button', { name: 'Save sign-in settings' }).click()
  await expect(box.getByRole('status')).toHaveText('Saved. The sign-in page shows “Sign in with Authelia”.')
  await expect(box.getByLabel('Client secret', { exact: true })).toHaveValue('') // write-only
  await expect(box.getByLabel('Client secret', { exact: true })).toHaveAttribute('placeholder', 'Saved (type a new one to replace it)')
})

test('Kim signs in with Authelia; the sign-in page and the round trip break no CSP rule', async ({ page }) => {
  const check = await noViolations(page)
  await page.goto('/')
  await page.getByRole('link', { name: 'Sign in with Authelia' }).click()
  await expect(page.getByRole('heading', { name: 'Your runners' })).toBeVisible()
  expect(new URL(page.url()).search).toBe('')
  await page.getByRole('button', { name: 'Kim Player' }).click()
  await expect(page.getByText('Player · kim')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Change password' })).toHaveCount(0) // an Authelia account has no app password
  await check()
})

test('no account here: back on the sign-in page with a plain message, nothing in the address', async ({ page }) => {
  const keep = issuer.user
  issuer.user = { sub: 'u-x', preferred_username: 'stranger', email: 'stranger@example.test', email_verified: true }
  try {
    await page.goto('/')
    await page.getByRole('link', { name: 'Sign in with Authelia' }).click()
    await expect(page.getByRole('alert')).toHaveText('Authelia knows you, but this app has no account for you. Ask the admin for an account.')
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    expect(new URL(page.url()).search).toBe('')
  } finally { issuer.user = keep }
})

test('Users: an Authelia account shows no password actions', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Username').fill('ada')
  await page.getByLabel('Password', { exact: true }).fill(ADMIN_PW)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.goto('/#/users')
  await expect(page.getByRole('button', { name: 'Edit Kim Player' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reset Kim Player’s password' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Reset Ada Admin’s password' })).toBeVisible()
})
