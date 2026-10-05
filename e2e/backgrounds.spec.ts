import { test, expect, type Page } from '@playwright/test'
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { usersFile } from '../server/auth.mjs'
import { createServer } from '../server/server.mjs'
import { makePng, stripes } from '../tests/png'
import { anarchyState } from './session'

// Background art end to end, on a server of its own: Ada (admin) uploads a generated test image (no artwork is committed)
// in Settings; it shows faintly behind the pages for her and for Pat (a player), never when printing, and not in a browser
// that hides it; disabled, it's gone; deleted after a confirm. Screenshots go to .extract/ (not committed). Runs in order.
const PW = { ada: 'ada-password-1', pat: 'pat-password-1' }
const SHOTS = '.extract/screenshots/0.5.1'
const PHONE = { width: 390, height: 844 }
let server: ReturnType<typeof createServer>, base = ''

test.describe.configure({ mode: 'serial' })
test.use({ baseURL: async ({}, use) => use(base), storageState: async ({}, use) => use(anarchyState(base)) })

test.beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ca2-backgrounds-')), config = join(dir, 'library', '.config')
  cpSync('tests/fixtures/mini/custom', join(dir, 'custom'), { recursive: true })
  cpSync('tests/fixtures/sr6/custom', join(dir, 'custom', 'sr6'), { recursive: true }) // the made-up SR6 catalog
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
  const ids: string[] = []
  try {
    ids.push(await up('pick-one.png', [200, 40, 40]))
    ids.push(await up('pick-two.png', [40, 40, 200]))
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
    const dlg = page.getByRole('dialog', { name: 'Background' }), open = () => page.getByRole('button', { name: 'Background', exact: true }).click()
    await runner('Pick A')
    await open()
    await expect(picker.getByRole('radio', { name: 'Same as the app' })).toBeChecked()
    await expect(picker.getByRole('radio')).toHaveCount(1 + enabled.length)
    await picker.getByRole('radio', { name: 'Background image 2' }).check()
    await expect(layer).toHaveAttribute('style', new RegExp(enabled[1]))
    await page.reload()
    await open()
    await expect(picker.getByRole('radio', { name: 'Background image 2' })).toBeChecked()
    await expect(layer).toHaveAttribute('style', new RegExp(enabled[1]))
    await dlg.getByLabel('Background art', { exact: true }).uncheck()
    await expect(picker).toHaveCount(0)
    await dlg.getByLabel('Background art', { exact: true }).check()
    await page.keyboard.press('Escape')
    await runner('Pick B')
    await open()
    await expect(picker.getByRole('radio', { name: 'Same as the app' })).toBeChecked()
  } finally {
    for (const id of ids) await page.evaluate(id => fetch(`./api/backgrounds/${id}`, { method: 'DELETE' }), id)
  }
})

test('Shadowrun 6 has its own art: uploaded on an SR6 page, the only art its pages and sheets show; Anarchy’s sheets never show it', async ({ page }) => {
  await signIn(page, 'ada')
  const anarchy: string = await page.evaluate(async png => (await (await fetch('./api/backgrounds', { method: 'POST', body: new Uint8Array(png),
    headers: { 'Content-Type': 'image/png', 'X-Filename': 'anarchy.png' } })).json()).id, [...makePng(8, 8, () => [200, 40, 40])])
  let sr6 = ''
  try {
    await page.goto('/#/sr6')
    await expect(page.getByRole('button', { name: 'New runner' })).toBeVisible() // the SR6 catalog loaded (the page header stays put)
    // SR6's gallery starts with our circuit board (Anarchy's image isn't SR6's); the admin deletes it like any upload
    await expect(art(page).locator('div')).toHaveAttribute('style', /api\/sr6\/backgrounds\/[0-9a-f]{12}/)
    const d = await settings(page), section = d.getByRole('group', { name: 'Background art (Shadowrun 6)' })
    await expect(section.getByText('Circuit board (default)')).toBeVisible()
    await page.screenshot({ path: `${SHOTS}/sr6-default-art-light.png` })
    await section.getByRole('button', { name: 'Delete Circuit board (default)' }).click()
    await page.getByRole('dialog', { name: 'Delete Circuit board (default)?' }).getByRole('button', { name: 'Delete' }).click()
    await expect(section.getByRole('status')).toContainText('Deleted Circuit board (default).')
    await expect(art(page)).toHaveCount(0)
    await expect(section.getByText(/none are on now/)).toBeVisible()
    await expect(section.getByText('anarchy.png')).toHaveCount(0)
    await section.getByLabel('Upload background images').setInputFiles({ name: 'sr6-stripes.png', mimeType: 'image/png', buffer: stripes() })
    await expect(section.getByRole('status')).toContainText('Added the image.')
    await expect(art(page).locator('div')).toHaveAttribute('style', /api\/sr6\/backgrounds\/[0-9a-f]{12}/)
    sr6 = (await page.evaluate(async () => (await (await fetch('./api/sr6/backgrounds')).json()).enabled))[0]
    await page.screenshot({ path: `${SHOTS}/settings-sr6-light.png` })
    await d.getByRole('button', { name: 'Close' }).click()

    // the SR6 sheet: its picker offers SR6's images only
    await page.getByRole('button', { name: 'New runner' }).click()
    await page.getByRole('dialog', { name: 'New runner' }).getByLabel('Street name').fill('Art Check')
    await page.getByRole('button', { name: 'Create runner' }).click()
    await expect(page).toHaveURL(/#\/sr6\/c\/[^/]+\/concept$/)
    await page.getByRole('navigation', { name: 'Character sections' }).getByRole('link', { name: 'Print' }).click()
    await expect(page.locator('.sheet-art > div')).toHaveAttribute('style', new RegExp(`sr6/backgrounds/${sr6}`))
    const sr6Sheet = page.url()
    await page.getByRole('button', { name: 'Background', exact: true }).click()
    const picker = page.getByRole('group', { name: 'Background image' })
    await expect(picker.getByRole('radio')).toHaveCount(2)
    await expect(picker.locator('img')).toHaveAttribute('src', new RegExp(`sr6/backgrounds/${sr6}$`))
    await page.keyboard.press('Escape')

    // back on Anarchy: its own image, and its gallery
    await page.goto('/#/')
    await expect(page.getByRole('heading', { name: 'Your runners' })).toBeVisible()
    await expect(art(page).locator('div')).toHaveAttribute('style', new RegExp(`api/backgrounds/${anarchy}`))
    const a = await settings(page)
    await expect(a.getByRole('group', { name: 'Background art (Shadowrun 6)' })).toHaveCount(0)
    await expect(a.getByText('sr6-stripes.png')).toHaveCount(0)
    await expect(a.getByText('anarchy.png')).toBeVisible()
    await a.getByRole('button', { name: 'Close' }).click()

    // the sheets' art is each game's own too: the SR6 sheet's switch off leaves Anarchy's sheet showing Anarchy's image,
    // its picker offering only Anarchy's; back on SR6, the switch is still off and only SR6's image is offered
    const layer = page.locator('.sheet-art'), dlg = page.getByRole('dialog', { name: 'Background' })
    const imgs = () => picker.locator('img').evaluateAll(es => es.map(e => e.getAttribute('src')))
    await page.goto('/')
    await page.getByRole('button', { name: 'New runner' }).click()
    await page.getByRole('button', { name: 'Create runner' }).click()
    await page.getByLabel('Street name').fill('Art Check Anarchy')
    await page.waitForTimeout(600)
    const anarchySheet = page.url().replace(/\/[^/]+$/, '/print')
    await page.getByRole('link', { name: 'Print' }).click()
    await expect(layer.locator('div')).toHaveAttribute('style', new RegExp(`api/backgrounds/${anarchy}`))
    await page.goto(sr6Sheet)
    await expect(layer.locator('div')).toHaveAttribute('style', new RegExp(`sr6/backgrounds/${sr6}`))
    await page.getByRole('button', { name: 'Background', exact: true }).click()
    await dlg.getByLabel('Background art', { exact: true }).uncheck()
    await expect(layer).toHaveClass(/no-screen/)
    await page.keyboard.press('Escape')
    await page.goto(anarchySheet)
    await expect(layer).not.toHaveClass(/no-screen/)
    await expect(layer.locator('div')).toHaveAttribute('style', new RegExp(`api/backgrounds/${anarchy}`))
    await page.getByRole('button', { name: 'Background', exact: true }).click()
    await expect(dlg.getByLabel('Background art', { exact: true })).toBeChecked()
    expect((await imgs()).length).toBeGreaterThan(0)
    expect((await imgs()).every(s => /\/api\/backgrounds\//.test(s ?? ''))).toBe(true)
    await page.keyboard.press('Escape')
    await page.goto(sr6Sheet)
    await expect(layer).toHaveClass(/no-screen/)
    await expect(layer.locator('div')).not.toHaveAttribute('style', /api\/backgrounds\//)
    await page.getByRole('button', { name: 'Background', exact: true }).click()
    await dlg.getByLabel('Background art', { exact: true }).check()
    expect(await imgs()).toEqual([expect.stringMatching(new RegExp(`/api/sr6/backgrounds/${sr6}$`))])
    await page.keyboard.press('Escape')
  } finally {
    await page.evaluate(([a, s]) => Promise.all([fetch(`./api/backgrounds/${a}`, { method: 'DELETE' }), s && fetch(`./api/sr6/backgrounds/${s}`, { method: 'DELETE' })]), [anarchy, sr6])
  }
})
