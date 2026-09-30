import { test, expect, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

// 0.5.2: one Knowledge & languages list (free keyword and skill-4+ entries, paid ones) and the sheet grouping. Screenshots go to .extract/ (not committed).
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

test('knowledge & languages: free keyword and skill entries, rename a free slot, add a language, sheet groups them', async ({ page }) => {
  await newRunner(page, 'Polyglot')
  await page.getByLabel('keywords 1').fill('Tinkerer')
  await page.getByRole('link', { name: 'Skills' }).click()
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Raise Electronics' }).click()
  const list = page.getByRole('table', { name: 'Knowledge' })
  const langs = page.getByRole('table', { name: 'Languages' })
  await expect(list.getByRole('row', { name: /Tinkerer.*Free: keyword/ })).toBeVisible()
  await expect(list.getByRole('row', { name: /Free: Electronics 4\+/ })).toBeVisible()

  // rename the skill's free slot: still free
  const left = await page.locator('.receipt .peek').textContent()
  const slot = list.getByLabel('Name of Electronics')
  await slot.fill('Gadget blogs')
  await slot.press('Enter')
  await expect(list.getByLabel('Name of Gadget blogs')).toBeVisible()
  await expect(page.locator('.receipt .peek')).toHaveText(left!)

  // the first language is the free native one; a second one is paid
  await page.getByLabel('New language').fill('Made-up tongue')
  await page.getByRole('button', { name: /^Add language \(native, free\)/ }).click()
  await expect(langs.getByRole('row', { name: /Made-up tongue.*Free: native language/ })).toBeVisible()
  await expect(page.locator('.receipt .peek')).toHaveText(left!)
  await page.getByLabel('New language').fill('Other tongue')
  await page.getByRole('button', { name: /^Add language/ }).click()
  await expect(langs.getByRole('row', { name: /Other tongue.*Paid/ })).toBeVisible()
  await expect(page.locator('.receipt .peek')).not.toHaveText(left!)

  // dropping Electronics below 4 asks first, then the renamed entry is paid (and flagged)
  page.once('dialog', d => { expect(d.message()).toContain('“Gadget blogs” is no longer free'); void d.accept() })
  await page.getByRole('button', { name: 'Lower Electronics' }).click()
  await expect(list.getByRole('row', { name: /Gadget blogs.*Paid \(Electronics below 4\)/ })).toBeVisible()
  await page.getByRole('button', { name: 'Raise Electronics' }).click()
  await expect(list.getByRole('row', { name: /Free: Electronics 4\+/ })).toBeVisible()
  await list.scrollIntoViewIfNeeded()
  await shots(page, 'knowledge')

  await expect(status(page)).toContainText('All changes saved')
  const id = page.url().match(/#\/c\/([^/]+)\//)![1]
  await page.goto(`/#/c/${id}/print`)
  const sheet = page.locator('.s-know')
  await expect(sheet.locator('h3', { hasText: 'Languages' }).locator('+ ul li')).toHaveText(['Made-up tongue (native)', 'Other tongue'])
  await expect(sheet.locator('h3', { hasText: 'Knowledge' }).locator('+ ul li')).toHaveText(['Gadget blogs', 'Tinkerer']) // A–Z
})
