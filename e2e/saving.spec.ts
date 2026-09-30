import { test, expect, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

// 0.5.2: the editor's save line (saved / saving / not saved with Retry), Save, Save and close, the leave warning. Screenshots go to .extract/ (not committed).
const SHOTS = '.extract/screenshots/0.5.2'

async function newRunner(page: Page, name?: string) {
  await page.goto('/')
  await page.getByRole('button', { name: 'New runner' }).click()
  await page.getByRole('button', { name: 'Create runner' }).click()
  await expect(page.getByLabel('Street name')).toBeVisible()
  if (name) await page.getByLabel('Street name').fill(name)
}
const status = (page: Page) => page.getByRole('status', { name: 'Save status' })

async function shots(page: Page, name: string) {
  mkdirSync(SHOTS, { recursive: true })
  const theme = (t: string) => page.evaluate(t => { localStorage.setItem('ca2.settings.v1', JSON.stringify({ theme: t })); document.documentElement.dataset.theme = t }, t)
  await theme('light')
  await page.screenshot({ path: `${SHOTS}/${name}-light.png` })
  await theme('dark')
  await page.screenshot({ path: `${SHOTS}/${name}-dark.png` })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${name} scrolls sideways`).toBeLessThanOrEqual(0)
  await page.screenshot({ path: `${SHOTS}/${name}-phone.png` })
  await page.setViewportSize({ width: 1400, height: 900 })
  await theme('light')
}

test('the concept page saves: status line, leave and come back, Save and close, an unnamed runner is listed', async ({ page }) => {
  await newRunner(page)
  await expect(status(page)).toContainText('All changes saved')
  await page.getByLabel('Real name').fill('Half typed')
  await page.getByLabel('keywords 1').fill('Night owl')
  await page.getByRole('link', { name: /Chummer Anarchy/ }).click() // straight away, before the autosave
  await expect(page.getByRole('heading', { name: 'Your runners' })).toBeVisible()
  await page.getByRole('link', { name: 'Half typed' }).click()
  await expect(page.getByLabel('Real name')).toHaveValue('Half typed')
  await expect(page.getByLabel('keywords 1')).toHaveValue('Night owl')
  await shots(page, 'save-status')

  await page.getByLabel('Real name').fill('')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(status(page)).toContainText(/All changes saved · \d/)
  await page.getByRole('button', { name: 'Save and close' }).click()
  await expect(page.getByRole('link', { name: 'Unnamed runner' }).first()).toBeVisible()
})

test('a failed save says so in red with the server’s reason; Retry sends it', async ({ page }) => {
  await newRunner(page, 'Flaky')
  await page.route('**/api/characters/*', r => r.request().method() === 'PUT'
    ? r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'the disk is full (test)' }) }) : r.fallback())
  await page.getByLabel('Real name').fill('Retry me')
  await expect(status(page)).toContainText('Not saved — the disk is full (test)')
  await expect(status(page)).toHaveCSS('color', /rgb\(164, 39, 27\)/)
  await shots(page, 'save-failed')
  // leaving now asks first; staying keeps the change
  page.once('dialog', d => void d.dismiss())
  await page.getByRole('link', { name: /Chummer Anarchy/ }).click()
  await expect(page.getByLabel('Real name')).toHaveValue('Retry me')
  await page.unroute('**/api/characters/*')
  await status(page).getByRole('button', { name: 'Retry' }).click()
  await expect(status(page)).toContainText('All changes saved')
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Flaky' })).toBeVisible()
  await page.getByRole('link', { name: 'Flaky' }).click()
  await expect(page.getByLabel('Real name')).toHaveValue('Retry me')
})
