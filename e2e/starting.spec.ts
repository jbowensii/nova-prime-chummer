import { test, expect, type Locator, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

// 0.5.3: free starting gear, the real SIN box, two knowledge lists (drag and keyboard order, hide, native).
// Made-up names; the SINner quality is the made-up one in tests/fixtures/mini (TEST2). Screenshots go to .extract/.
const SHOTS = '.extract/screenshots/0.5.3'

async function newRunner(page: Page, name: string) {
  await page.goto('/')
  await page.getByRole('button', { name: 'New runner' }).click()
  await page.getByRole('button', { name: 'Create runner' }).click()
  await expect(page.getByLabel('Street name')).toBeVisible()
  await page.getByLabel('Street name').fill(name)
}
const status = (page: Page) => page.getByRole('status', { name: 'Save status' })
const tab = (page: Page, name: string) => page.getByRole('link', { name, exact: true }).click()
/** the names in a knowledge list, top to bottom (a paid entry's name is in its text field) */
const names = (t: Locator) => t.locator('tbody tr').evaluateAll(trs => trs.map(tr => {
  const cell = (tr as HTMLTableRowElement).cells[1]
  return cell?.querySelector('input')?.value ?? cell?.querySelector('b')?.textContent ?? ''
}))

async function shots(page: Page, name: string, at?: Locator) {
  mkdirSync(SHOTS, { recursive: true })
  const theme = (t: string) => page.evaluate(t => { localStorage.setItem('ca2.settings.v1', JSON.stringify({ theme: t })); document.documentElement.dataset.theme = t }, t)
  await theme('light')
  await page.screenshot({ path: `${SHOTS}/${name}-light.png` })
  await theme('dark')
  await page.screenshot({ path: `${SHOTS}/${name}-dark.png` })
  await page.setViewportSize({ width: 390, height: 844 })
  await at?.scrollIntoViewIfNeeded()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${name} scrolls sideways`).toBeLessThanOrEqual(0)
  await page.screenshot({ path: `${SHOTS}/${name}-phone.png` })
  await page.setViewportSize({ width: 1400, height: 900 })
  await theme('light')
}

test('starting gear is free and locked; a real SIN adds its entry and the book’s SINner, and goes again', async ({ page }) => {
  await newRunner(page, 'Paper Trail')
  const left = await page.locator('.receipt .peek').textContent()
  await tab(page, 'Gear & spells')
  for (const n of ['Commlink (with trodes)', 'Fake SIN']) {
    const row = page.locator('tr.starting', { has: page.getByLabel(`Name of ${n}`) })
    await expect(row).toContainText('Free (starting gear)')
    await expect(row).toContainText('CRB p.84')
    await expect(row.getByRole('button', { name: 'Remove' })).toHaveCount(0)
  }
  const fake = page.getByLabel('Name of Fake SIN')
  await fake.fill('Fake SIN: Jane Roe')
  await fake.press('Enter')
  await page.getByLabel('Description of Fake SIN: Jane Roe').fill('Made-up nation, rating unknown')
  await expect(page.locator('.receipt .peek')).toHaveText(left!)
  await page.locator('tr.starting').first().scrollIntoViewIfNeeded()
  await shots(page, 'starting-gear', page.locator('tr.starting').first())

  await tab(page, 'Concept')
  const box = page.getByRole('checkbox', { name: /Has a real SIN/ })
  await expect(page.getByText(/and the SINner quality from Test Book Two/)).toBeVisible()
  await box.check()
  await box.scrollIntoViewIfNeeded()
  await shots(page, 'real-sin', box)
  await tab(page, 'Gear & spells')
  await expect(page.getByLabel('Name of Real SIN')).toBeVisible()
  await expect(page.locator('tr.starting', { has: page.getByLabel('Name of Real SIN') })).toContainText('Free (real SIN)')
  await tab(page, 'Shadow Amps')
  await expect(page.getByText('SINner', { exact: true }).first()).toBeVisible()
  await expect(page.locator('.receipt .peek')).toHaveText(left!)
  await tab(page, 'Concept')
  await box.uncheck()
  await tab(page, 'Gear & spells')
  await expect(page.getByLabel('Name of Real SIN')).toHaveCount(0)
  await tab(page, 'Shadow Amps')
  await expect(page.getByText('SINner', { exact: true })).toHaveCount(0)

  await expect(status(page)).toContainText('All changes saved')
  const id = page.url().match(/#\/c\/([^/]+)\//)![1]
  await page.goto(`/#/c/${id}/print`)
  await expect(page.locator('.s-cols').locator('h2', { hasText: 'Equipment' }).locator('+ p'))
    .toHaveText('Fake SIN: Jane Roe (Made-up nation, rating unknown), Commlink (with trodes).')
})

test('knowledge and languages: two A–Z lists, drag and keyboard order, Sort A–Z, hide, one native language', async ({ page }) => {
  await newRunner(page, 'Bookworm')
  await tab(page, 'Skills')
  const know = page.getByRole('table', { name: 'Knowledge' }), langs = page.getByRole('table', { name: 'Languages' })
  for (const n of ['Charlie lore', 'Alpha lore', 'Bravo lore']) {
    await page.getByLabel('New knowledge skill').fill(n)
    await page.getByRole('button', { name: /^Add knowledge skill/ }).click()
  }
  await expect.poll(() => names(know)).toEqual(['Alpha lore', 'Bravo lore', 'Charlie lore'])

  // drag Charlie onto Alpha's row: it takes the top
  await know.locator('.grip[data-key="knowledge:Charlie lore"]').dragTo(know.locator('tbody tr').first())
  await expect.poll(() => names(know)).toEqual(['Charlie lore', 'Alpha lore', 'Bravo lore'])
  await expect(page.getByRole('button', { name: 'Sort A–Z' })).toBeVisible()

  // keyboard: Move down twice, the focus staying on the moved row's button
  await page.getByRole('button', { name: 'Move Charlie lore down' }).focus()
  await page.keyboard.press('Enter')
  await expect.poll(() => names(know)).toEqual(['Alpha lore', 'Charlie lore', 'Bravo lore'])
  await expect(page.getByRole('button', { name: 'Move Charlie lore down' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect.poll(() => names(know)).toEqual(['Alpha lore', 'Bravo lore', 'Charlie lore'])
  await page.getByRole('button', { name: 'Move Bravo lore up' }).click()
  await expect.poll(() => names(know)).toEqual(['Bravo lore', 'Alpha lore', 'Charlie lore'])

  // hide: dimmed with Show, still counted
  const left = await page.locator('.receipt .peek').textContent()
  await page.getByRole('button', { name: 'Hide Alpha lore' }).click()
  await expect(know.locator('tr.dim')).toContainText('(hidden)')
  await expect(page.getByRole('button', { name: 'Show Alpha lore' })).toBeVisible()
  await expect(page.locator('.receipt .peek')).toHaveText(left!)

  // languages: the first is native and free; marking another moves the mark
  await page.getByLabel('New language').fill('Zed tongue')
  await page.getByRole('button', { name: 'Add language (native, free)' }).click()
  await page.getByLabel('New language').fill('Made-up tongue')
  await page.getByRole('button', { name: /^Add language/ }).click()
  await expect(langs.getByRole('row', { name: /Zed tongue.*Free: native language/ })).toBeVisible()
  await expect.poll(() => names(langs)).toEqual(['Made-up tongue', 'Zed tongue'])
  await langs.getByRole('checkbox', { name: 'Made-up tongue is the native language' }).check()
  await expect(langs.getByRole('checkbox', { name: 'Zed tongue is the native language' })).not.toBeChecked()
  await expect(langs.getByRole('row', { name: /Zed tongue.*Paid/ })).toBeVisible()
  await expect(langs.getByRole('row', { name: /Made-up tongue.*Free: native language/ })).toBeVisible()
  await know.scrollIntoViewIfNeeded()
  await shots(page, 'knowledge-lists', langs)

  // all of it persists
  await expect(status(page)).toContainText('All changes saved')
  await page.reload()
  await expect.poll(() => names(page.getByRole('table', { name: 'Knowledge' }))).toEqual(['Bravo lore', 'Alpha lore', 'Charlie lore'])
  await expect(page.getByRole('button', { name: 'Show Alpha lore' })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Made-up tongue is the native language' })).toBeChecked()

  const id = page.url().match(/#\/c\/([^/]+)\//)![1]
  await page.goto(`/#/c/${id}/print`)
  const sheet = page.locator('.s-cols')
  await expect(sheet.locator('h3', { hasText: 'Knowledge skills' }).locator('+ p')).toHaveText('Bravo lore, Charlie lore')
  await expect(sheet.locator('h3', { hasText: 'Languages' }).locator('+ p')).toHaveText('Made-up tongue (native), Zed tongue')

  // Sort A–Z puts the list back
  await page.goto(`/#/c/${id}/skills`)
  await page.getByRole('button', { name: 'Sort A–Z' }).click()
  await expect.poll(() => names(page.getByRole('table', { name: 'Knowledge' }))).toEqual(['Alpha lore', 'Bravo lore', 'Charlie lore'])
  await expect(page.getByRole('button', { name: 'Sort A–Z' })).toHaveCount(0)
})

test('a SINner added by hand ticks the real SIN box and brings its entry; unticking asks, then removes it', async ({ page }) => {
  await newRunner(page, 'Early Adopter')
  await tab(page, 'Shadow Amps')
  await page.getByRole('button', { name: 'Add an amp' }).click()
  await page.getByLabel('Search the book’s amps').fill('SINner')
  await page.getByText('SINner', { exact: true }).click()
  await page.getByRole('button', { name: 'Add amp' }).click()
  // saved and opened again: the box is on and the free entry has come along
  await expect(status(page)).toContainText('All changes saved')
  await page.reload()
  await tab(page, 'Gear & spells')
  await expect(page.getByLabel('Name of Real SIN')).toBeVisible()
  await tab(page, 'Concept')
  const box = page.getByRole('checkbox', { name: /Has a real SIN/ })
  await expect(box).toBeChecked()
  // unticking asks first: cancelled, nothing changes
  page.once('dialog', d => { expect(d.message()).toContain('SINner quality you added'); void d.dismiss() })
  await box.click()
  await expect(box).toBeChecked()
  page.once('dialog', d => void d.accept())
  await box.click()
  await expect(box).not.toBeChecked()
  await tab(page, 'Shadow Amps')
  await expect(page.getByText('SINner', { exact: true })).toHaveCount(0)
  await tab(page, 'Gear & spells')
  await expect(page.getByLabel('Name of Real SIN')).toHaveCount(0)
  await tab(page, 'Concept')
  await box.check()
  await tab(page, 'Shadow Amps')
  await expect(page.getByText('SINner', { exact: true })).toHaveCount(1)
})
