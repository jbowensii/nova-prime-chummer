import { test, expect, type Page } from '@playwright/test'
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { usersFile } from '../server/auth.mjs'
import { createServer } from '../server/server.mjs'
import { makePng, stripes } from '../tests/png'

// Background art end to end, on a server of its own: Ada (admin) uploads a generated test image (no artwork is committed)
// in Settings; it shows faintly behind the pages for her and for Pat (a player), never when printing, and not in a browser
// that hides it; disabled, it's gone; deleted after a confirm. Screenshots go to .extract/ (not committed). Runs in order.
const PW = { ada: 'ada-password-1', pat: 'pat-password-1' }
const SHOTS = '.extract/screenshots/0.5.1'
const PHONE = { width: 390, height: 844 }
let server: ReturnType<typeof createServer>, base = ''

test.describe.configure({ mode: 'serial' })
test.use({ baseURL: async ({}, use) => use(base), storageState: { cookies: [], origins: [] } })

test.beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ca2-backgrounds-')), config = join(dir, 'library', '.config')
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
  await page.context().clearCookies()
  await page.goto('/')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password', { exact: true }).fill(PW[username])
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Your runners' })).toBeVisible()
}
const settings = async (page: Page) => { await page.getByRole('button', { name: 'Settings' }).click(); return page.getByRole('dialog', { name: 'Settings' }) }
const art = (page: Page) => page.locator('.bg-art')
const artVisible = (page: Page) => page.evaluate(() => { const e = document.querySelector('.bg-art'); return !!e && getComputedStyle(e).display !== 'none' })
async function shots(page: Page, name: string) {
  const theme = (t: string) => page.evaluate(t => { localStorage.setItem('ca2.settings.v1', JSON.stringify({ theme: t })); document.documentElement.dataset.theme = t }, t)
  await theme('light')
  await page.screenshot({ path: `${SHOTS}/${name}-light.png` })
  await theme('dark')
  await page.screenshot({ path: `${SHOTS}/${name}-dark.png` })
  await page.setViewportSize(PHONE)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${name} scrolls sideways`).toBeLessThanOrEqual(0)
  await page.screenshot({ path: `${SHOTS}/${name}-phone.png` })
  await page.setViewportSize({ width: 1400, height: 900 })
  await theme('light')
}

test('the admin uploads an image; it shows behind every page, never printed', async ({ page }) => {
  await signIn(page, 'ada')
  await expect(art(page)).toHaveCount(0) // none yet
  let d = await settings(page)
  const section = d.getByRole('group', { name: 'Background art' })
  await expect(section.getByText(/none are on now/)).toBeVisible()
  await section.getByLabel('Upload background images').setInputFiles({ name: 'not-art.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') })
  await expect(section.getByRole('alert')).toContainText('not-art.svg isn’t a PNG, JPEG or WebP image')
  await section.getByLabel('Upload background images').setInputFiles({ name: 'test-stripes.png', mimeType: 'image/png', buffer: stripes() })
  await expect(section.getByRole('status')).toContainText('Added the image.')
  await expect(section.getByText('test-stripes.png')).toBeVisible()
  await expect(section.getByText(/the one that’s on always shows/)).toBeVisible()
  await expect(art(page)).toHaveCount(1) // the page picked it up without a reload
  await d.getByRole('button', { name: 'Close' }).click()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Your runners' })).toBeVisible()
  await expect(art(page).locator('div')).toHaveAttribute('style', /api\/backgrounds\/[0-9a-f]{12}/)
  expect(await artVisible(page)).toBe(true)
  await page.emulateMedia({ media: 'print' })
  expect(await artVisible(page)).toBe(false)
  await page.emulateMedia({ media: 'screen' })

  // a runner, for the screenshots: the list and the builder, light, dark and phone
  await page.getByRole('button', { name: 'New runner' }).click()
  await page.getByRole('button', { name: 'Create runner' }).click()
  const saved = page.waitForResponse(r => r.request().method() === 'PUT')
  await page.getByLabel('Street name').fill('Test Pattern')
  expect((await saved).status()).toBeLessThan(300)
  await shots(page, 'builder')
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Your runners' })).toBeVisible()
  await shots(page, 'library')
  d = await settings(page)
  await d.screenshot({ path: `${SHOTS}/settings-light.png` })

  // this browser hides it
  await d.getByLabel('Plain page').check()
  expect(await artVisible(page)).toBe(false)
  await d.getByLabel('Show background art').check()
  expect(await artVisible(page)).toBe(true)
  // disabled for everyone
  await d.getByRole('checkbox', { name: 'Show test-stripes.png' }).uncheck()
  await expect(d.getByRole('group', { name: 'Background art' }).getByRole('status')).toContainText('test-stripes.png no longer shows.')
  await expect(art(page)).toHaveCount(0)
  await d.getByRole('checkbox', { name: 'Show test-stripes.png' }).check()
  await expect(art(page)).toHaveCount(1)
})

test('a player sees it too, and can hide it in their browser; only the admin manages it', async ({ page }) => {
  await signIn(page, 'pat')
  expect(await artVisible(page)).toBe(true)
  const d = await settings(page)
  await expect(d.getByLabel('Upload background images')).toHaveCount(0)
  await d.getByLabel('Plain page').check()
  await d.getByRole('button', { name: 'Close' }).click()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Your runners' })).toBeVisible()
  expect(await artVisible(page)).toBe(false)
  // signed out: no image
  await page.context().clearCookies()
  expect((await page.request.get('/api/backgrounds')).status()).toBe(401)
})

test('the admin deletes it after a confirm', async ({ page }) => {
  await signIn(page, 'ada')
  const d = await settings(page)
  await d.getByRole('button', { name: 'Delete test-stripes.png' }).click()
  const c = page.getByRole('dialog', { name: 'Delete test-stripes.png?' })
  await c.getByRole('button', { name: 'Cancel' }).click()
  await expect(d.getByText('test-stripes.png')).toBeVisible()
  await d.getByRole('button', { name: 'Delete test-stripes.png' }).click()
  await c.getByRole('button', { name: 'Delete' }).click()
  await expect(d.getByRole('group', { name: 'Background art' }).getByRole('status')).toContainText('Deleted test-stripes.png.')
  await expect(art(page)).toHaveCount(0)
})

test('the sheet lets the player choose the background image, remembered per runner', async ({ page }) => {
  await signIn(page, 'ada')
  const up = (name: string, rgb: number[]) => page.evaluate(async ([n, png]) => (await (await fetch('./api/backgrounds', { method: 'POST', body: new Uint8Array(png as number[]),
    headers: { 'Content-Type': 'image/png', 'X-Filename': n as string } })).json()).id as string, [name, [...makePng(8, 8, () => rgb)]] as const)
  const ids = [await up('pick-one.png', [200, 40, 40]), await up('pick-two.png', [40, 40, 200])]
  try {
    const enabled: string[] = await page.evaluate(async () => (await (await fetch('./api/backgrounds')).json()).enabled)
    const runner = async (name: string) => {
      await page.goto('/')
      await page.getByRole('button', { name: 'New runner' }).click()
      await page.getByRole('button', { name: 'Create runner' }).click()
      await page.getByLabel('Street name').fill(name)
      await page.waitForTimeout(600)
      await page.getByRole('link', { name: 'Print' }).click()
    }
    const picker = page.getByRole('group', { name: 'Background image' }), layer = page.locator('.sheet-art > div')
    await runner('Pick A')
    await expect(picker.getByRole('radio', { name: 'Same as the app' })).toBeChecked()
    await expect(picker.getByRole('radio')).toHaveCount(1 + enabled.length)
    await picker.getByRole('radio', { name: 'Background image 2' }).check()
    await expect(layer).toHaveAttribute('style', new RegExp(enabled[1]))
    await page.reload()
    await expect(picker.getByRole('radio', { name: 'Background image 2' })).toBeChecked()
    await expect(layer).toHaveAttribute('style', new RegExp(enabled[1]))
    await page.getByLabel('Background art', { exact: true }).uncheck()
    await expect(picker).toHaveCount(0)
    await page.getByLabel('Background art', { exact: true }).check()
    await runner('Pick B')
    await expect(picker.getByRole('radio', { name: 'Same as the app' })).toBeChecked()
  } finally {
    for (const id of ids) await page.evaluate(id => fetch(`./api/backgrounds/${id}`, { method: 'DELETE' }), id)
  }
})
