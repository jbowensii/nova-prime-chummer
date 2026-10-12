import { test, expect, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { savedOnServer } from './session'

// 0.5.2 runner list: A–Z by default (Z–A, Recently edited; remembered), search, Draft / Finalized badges, and a file the
// app can't read listed with why, downloadable and repairable. Screenshots go to .extract/ (not committed).
const SHOTS = '.extract/screenshots/0.5.2'
const list = (page: Page) => page.locator('.lib .dossier .title')

async function newRunner(page: Page, name: string) {
  await page.goto('/')
  await page.getByRole('button', { name: 'New runner' }).click()
  await page.getByRole('button', { name: 'Create runner' }).click()
  await page.getByLabel('Street name').fill(name)
  await savedOnServer(page, `streetName="${name}"`) // the next page.goto('/') reloads the page
}

test('A–Z by default, then Recently edited puts a new runner on top; search; Draft and Finalized badges', async ({ page }) => {
  await newRunner(page, 'Zulu Last')
  await newRunner(page, "Father O'Neil")
  await page.getByRole('link', { name: 'Review' }).click()
  await page.getByRole('button', { name: 'Finalize runner' }).click()
  await page.getByRole('button', { name: 'Finalize', exact: true }).click()
  await expect(page.locator('.topbar .runstate')).toHaveText('Finalized')
  await expect(page.locator('.topbar .runstate')).toHaveAttribute('title', 'Finalized: every change is logged in the ledger')
  await newRunner(page, 'Aardvark')
  await page.getByRole('link', { name: /Nova Prime Chummer Anarchy/ }).click()
  await expect(page.getByRole('link', { name: 'Aardvark' })).toBeVisible()

  const titles = await list(page).allTextContents()
  const at = (n: string) => titles.indexOf(n)
  expect(at('Aardvark')).toBeLessThan(at("Father O'Neil"))
  expect(at("Father O'Neil")).toBeLessThan(at('Zulu Last'))
  const row = (n: string) => page.locator('.dossier', { has: page.getByRole('link', { name: n, exact: true }) })
  await expect(row("Father O'Neil").locator('.runstate')).toHaveText('Finalized')
  await expect(row('Aardvark').locator('.runstate')).toHaveText('Draft')
  await expect(row("Father O'Neil").locator('.face')).toHaveText('F')

  await page.getByLabel('Sort').selectOption('recent')
  await expect(list(page).first()).toHaveText('Aardvark')
  await page.reload()
  await expect(page.getByLabel('Sort')).toHaveValue('recent') // remembered in this browser
  await page.getByLabel('Sort').selectOption('az')

  await page.getByLabel('Search runners').fill("o'ne")
  await expect(list(page)).toHaveText(["Father O'Neil"])
  await page.getByLabel('Search runners').fill('nobody here')
  await expect(page.getByText('No runner’s name contains “nobody here”.')).toBeVisible()
  await page.getByLabel('Search runners').fill('')
})

test('a file the app can’t read is listed with why; download it, repair it', async ({ page }) => {
  const dir = join(process.env.CA2_E2E_DIR!, 'characters', 'admin')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'pasted.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<ca2:character xmlns:ca2="urn:chummer-anarchy2:character:1" formatVersion="1" rev="4" id="pasted-1" streetName="Pasted Pete" metatype="human" level="runner" package="free" updatedAt="2026-09-20T00:00:00.000Z">\n  <background>From a PDF${String.fromCharCode(12)}page</background>\n  <build><attributes str="1" agi="1" wil="1" log="1" cha="1"/></build>\n</ca2:character>\n`,
  )
  await page.goto('/')
  const row = page.locator('.dossier.unreadable', { hasText: 'Couldn’t open Pasted Pete' })
  await expect(row).toContainText('in <background>: character U+000C isn’t allowed in XML')
  mkdirSync(SHOTS, { recursive: true })
  await row.scrollIntoViewIfNeeded()
  const theme = (t: string) =>
    page.evaluate(t => {
      localStorage.setItem('ca2.settings.v1', JSON.stringify({ theme: t }))
      document.documentElement.dataset.theme = t
    }, t)
  await theme('light')
  await page.screenshot({ path: `${SHOTS}/library-light.png` })
  await theme('dark')
  await page.screenshot({ path: `${SHOTS}/library-dark.png` })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
  await page.screenshot({ path: `${SHOTS}/library-phone.png` })
  await page.setViewportSize({ width: 1400, height: 900 })
  await theme('light')

  const download = page.waitForEvent('download')
  await row.getByRole('button', { name: 'Download file' }).click()
  expect((await download).suggestedFilename()).toBe('pasted.xml')

  await row.getByRole('button', { name: 'Try to repair' }).click()
  const dialog = page.getByRole('dialog', { name: 'Repair Pasted Pete?' })
  await expect(dialog).toContainText('Removed 1 character XML can’t hold (U+000C).')
  await dialog.getByRole('button', { name: 'Save repaired runner' }).click()
  await expect(page.getByRole('status')).toContainText('Repaired Pasted Pete.')
  await expect(page.locator('.dossier.unreadable')).toHaveCount(0)
  await page.getByRole('link', { name: 'Pasted Pete' }).click()
  await expect(page.getByLabel('Street name')).toHaveValue('Pasted Pete')
})
