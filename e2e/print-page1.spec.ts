import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { disc } from '../tests/png'

// 0.5.8 print page 1: Languages & knowledge under Skills, a bigger portrait, the logo on the paint swish.
const SHOTS = '.extract/screenshots/0.5.8'
test('print sheet page 1: knowledge under Skills, bigger portrait, logo on the swish', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true })
  await page.goto('/')
  await page.getByRole('button', { name: 'New runner' }).click()
  await page.getByRole('button', { name: 'Create runner' }).click()
  await page.getByLabel('Street name').fill('Page One')
  await page.getByRole('button', { name: 'Add a portrait…' }).click()
  const dlg = page.getByRole('dialog', { name: 'Portrait' })
  await dlg.getByLabel('Portrait file').setInputFiles({ name: 'test-disc.png', mimeType: 'image/png', buffer: disc() })
  const saved = page.waitForResponse(r => r.request().method() === 'PUT')
  await dlg.getByRole('button', { name: 'Save portrait' }).click()
  expect((await saved).status()).toBeLessThan(300)
  const id = page.url().match(/#\/c\/([^/]+)/)![1]
  await page.goto(`/#/c/${id}/print`)
  await expect(page.locator('.sheet h1')).toHaveText('Page One')

  const check = async () => {
    const first = page.locator('.s-page1')
    await expect(first.locator('.s-know')).toHaveCount(1)
    const order = await page.locator('.sheet h2').evaluateAll(hs => hs.map(h => h.textContent))
    expect(order.indexOf('Languages & knowledge')).toBe(order.indexOf('Skills') + 1)
    const skills = await first.getByRole('heading', { name: 'Skills' }).boundingBox()
    const know = await first.locator('.s-know').boundingBox()
    expect(know!.y).toBeGreaterThan(skills!.y)
    expect((await page.locator('.s-top > img.portrait').boundingBox())!.width).toBeGreaterThanOrEqual(144) // 9rem
    const logo = page.locator('.s-head .brand b')
    await expect(logo).toHaveText('Anarchy')
    expect(await logo.evaluate(e => getComputedStyle(e).backgroundImage)).toContain('url(')
    expect(await logo.evaluate(e => getComputedStyle(e).getPropertyValue('print-color-adjust'))).toBe('exact')
  }
  for (const t of ['light', 'dark']) {
    await page.evaluate(t => { document.documentElement.dataset.theme = t }, t)
    await check()
    await page.screenshot({ path: `${SHOTS}/print-page1-${t}.png`, fullPage: true })
  }
  await page.evaluate(t => { document.documentElement.dataset.theme = 'light' }, 0)
  await page.emulateMedia({ media: 'print' })
  await check()
  await page.screenshot({ path: `${SHOTS}/print-page1-print.png`, fullPage: true })
})
