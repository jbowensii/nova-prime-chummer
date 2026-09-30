import { test, expect, type Locator, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

// 0.5.3: free starting gear, the real SIN box, two knowledge lists (drag and keyboard order, hide, native).
// Made-up names; the SINner quality is the made-up one in tests/fixtures/mini (TEST2). Screenshots go to .extract/.
const SHOTS = '.extract/screenshots/0.5.4'

async function newRunner(page: Page, name: string) {
  await page.goto('/')
  await page.getByRole('button', { name: 'New runner' }).click()
  await page.getByRole('button', { name: 'Create runner' }).click()
  await expect(page.getByLabel('Street name')).toBeVisible()
  await page.getByLabel('Street name').fill(name)
}
/** Adds the made-up book's SINner quality on the Shadow Amps tab. */
async function addSinner(page: Page) {
  await page.getByRole('button', { name: 'Add an amp' }).click()
  await page.getByLabel('Search the book’s amps').fill('SINner')
  await page.getByText('SINner', { exact: true }).click()
  await page.getByRole('button', { name: 'Add amp' }).click()
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

test('starting gear is free and locked; the SINner quality brings a free Real SIN entry, and takes it away', async ({ page }) => {
  await newRunner(page, 'Paper Trail')
  const left = await page.locator('.receipt .peek').textContent()
  await tab(page, 'Gear & spells')
  for (const n of ['Commlink (with trodes)', 'Fake SIN']) {
    const row = page.locator('tr.starting', { has: page.locator('b', { hasText: n }) }) // named like any gear (0.5.4)
    await expect(row).toContainText('Free (starting gear)')
    await expect(row).toContainText('CRB p.85')
    await expect(row.getByRole('button', { name: 'Remove' })).toHaveCount(0)
    await expect(row.getByLabel(`Name of ${n}`)).toHaveCount(0) // the fields open with Rename
  }
  await page.getByRole('button', { name: 'Rename Fake SIN' }).click()
  const fake = page.getByLabel('Name of Fake SIN')
  await fake.fill('Fake SIN: Jane Roe')
  await fake.press('Enter')
  await page.getByLabel('Description of Fake SIN: Jane Roe').fill('Made-up nation, rating unknown')
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.locator('tr.starting').filter({ hasText: 'Fake SIN: Jane Roe' })).toContainText('Made-up nation, rating unknown')
  await expect(page.locator('.receipt .peek')).toHaveText(left!)
  await page.locator('tr.starting').first().scrollIntoViewIfNeeded()
  await shots(page, 'starting-gear', page.locator('tr.starting').first())

  await tab(page, 'Shadow Amps')
  await addSinner(page)
  await tab(page, 'Gear & spells')
  const real = page.locator('tr.starting').filter({ hasText: 'Real SIN' })
  await expect(real).toContainText('Free (real SIN)')
  await real.scrollIntoViewIfNeeded()
  await shots(page, 'real-sin', real)
  await expect(page.locator('.receipt .peek')).toHaveText(left!)
  await tab(page, 'Shadow Amps')
  await page.locator('tr', { hasText: 'SINner' }).getByRole('button', { name: 'Remove' }).click()
  await expect(page.getByText('SINner', { exact: true })).toHaveCount(0)
  await tab(page, 'Gear & spells')
  await expect(real).toHaveCount(0)

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
  await know.locator('tbody tr').nth(2).locator('.grip').dragTo(know.locator('tbody tr').first()) // Charlie, last A–Z
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
  const sheet = page.locator('.s-know') // at the bottom of the sheet, in the player's order, hidden ones left off
  await expect(sheet.locator('h3', { hasText: 'Knowledge' }).locator('+ ul li')).toHaveText(['Bravo lore', 'Charlie lore'])
  await expect(sheet.locator('h3', { hasText: 'Languages' }).locator('+ ul li')).toHaveText(['Made-up tongue (native)', 'Zed tongue'])

  // Sort A–Z puts the list back
  await page.goto(`/#/c/${id}/skills`)
  await page.getByRole('button', { name: 'Sort A–Z' }).click()
  await expect.poll(() => names(page.getByRole('table', { name: 'Knowledge' }))).toEqual(['Alpha lore', 'Bravo lore', 'Charlie lore'])
  await expect(page.getByRole('button', { name: 'Sort A–Z' })).toHaveCount(0)
})

test('a SINner added by hand keeps its Real SIN entry when opened again', async ({ page }) => {
  await newRunner(page, 'Early Adopter')
  await tab(page, 'Shadow Amps')
  await addSinner(page)
  await expect(status(page)).toContainText('All changes saved')
  await page.reload()
  await tab(page, 'Gear & spells')
  await expect(page.locator('tr.starting').filter({ hasText: 'Real SIN' })).toHaveCount(1)
  await tab(page, 'Concept')
  await expect(page.getByRole('checkbox', { name: /Has a real SIN|Allow non-canon/ })).toHaveCount(0) // the GM's, on the Rules page
})

test('once finalized, a SINner can still be added and the ledger logs it with its Real SIN (0.5.5: nothing is locked)', async ({ page }) => {
  await newRunner(page, 'Late Paperwork')
  await tab(page, 'Review')
  await page.getByRole('button', { name: 'Finalize runner' }).click()
  await page.getByRole('button', { name: 'Finalize', exact: true }).click()
  await expect(page.locator('.topbar .runstate')).toHaveText('Finalized')
  const left = await page.locator('.receipt .peek').textContent()
  await tab(page, 'Shadow Amps')
  await addSinner(page)
  await expect(page.locator('.receipt .peek')).toHaveText(left!)
  await tab(page, 'Ledger')
  await expect(page.locator('table.data tbody tr', { hasText: 'Added SINner' })).toContainText('Added Real SIN')
})

test('over budget reads as such; adding or removing a priced item says what it cost or gave back', async ({ page }) => {
  await newRunner(page, 'Tight Wallet')
  await tab(page, 'Gear & spells')
  const receipt = page.locator('.receipt')
  await page.locator('section', { has: page.getByRole('heading', { name: 'Equipment' }) }).getByRole('button', { name: 'Custom' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Made-up yacht')
  await page.getByLabel(/Price set by the GM/).fill('900000')
  await page.getByRole('button', { name: 'Add item' }).click()
  await expect(receipt.getByRole('status')).toHaveText('+900,000¥: Made-up yacht added')
  await expect(receipt.locator('.err', { hasText: /^Over budget by / })).toBeVisible()
  await receipt.scrollIntoViewIfNeeded()
  await shots(page, 'over-budget', receipt)
  await page.locator('tr', { hasText: 'Made-up yacht' }).getByRole('button', { name: 'Remove' }).click()
  await expect(receipt.getByRole('status')).toHaveText('−900,000¥: Made-up yacht removed')
  await expect(receipt).not.toContainText('Over budget by')
})
