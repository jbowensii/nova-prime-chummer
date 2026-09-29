import { test, expect, type Page } from '@playwright/test'

// The e2e server serves a copy of tests/fixtures/mini/custom: made-up imported books TEST and TEST2
// (non-canon) and TESTC (canon), with duplicate "Rush", "Keen Eye" and "Nano Tape".

async function newRunner(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'New runner' }).click()
  await page.getByRole('button', { name: 'Create runner' }).click()
  await page.getByLabel('Street name').fill('Sourced')
}

const rows = (page: Page, name: RegExp) => page.locator('.picker li').filter({ has: page.locator('b', { hasText: name }) })

test('amp picker: every entry shows its source; duplicates are told apart', async ({ page }) => {
  await newRunner(page)
  await page.getByRole('link', { name: 'Shadow Amps' }).click()
  await page.getByRole('button', { name: 'Add an amp' }).click()
  const search = page.getByLabel('Search the book’s amps')

  await search.fill('Rush')
  const rush = rows(page, /^Rush( \(Equipment\))?$/)
  await expect(rush).toHaveCount(2)
  await expect(rush.locator('.noncanon')).toHaveCount(1)
  await expect(rush.locator('.booktag')).toHaveCount(0)
  await expect(rush.filter({ has: page.locator('.noncanon') }).locator('.src')).toHaveText('TEST p.8')
  await expect(rush.filter({ has: page.locator('.noncanon') }).locator('.src'))
    .toHaveAttribute('title', 'Test Book One — Test Publisher — file test-book.pdf')

  await search.fill('TESTC')
  await expect(page.locator('.picker li .src')).toHaveText(['TESTC p.8'])

  await search.fill('Keen eye')
  const keen = rows(page, /^Keen eye$/i)
  await expect(keen).toHaveCount(2)
  await expect(keen.locator('.booktag')).toHaveText(['TEST', 'TEST2'])
  await expect(keen.locator('.booktag').first()).toHaveAttribute('title', 'Test Book One')

  await page.getByRole('button', { name: 'Trait', exact: true }).click()
  await page.getByLabel('Name', { exact: true }).fill('Lucky streak')
  await page.getByRole('button', { name: 'Add amp' }).click()
  await expect(page.locator('tr', { hasText: 'Lucky streak' })).toContainText('Built by you')
})

test('gear picker labels Nano Tape by book; game data shows imported files', async ({ page }) => {
  await newRunner(page)
  await page.getByRole('link', { name: 'Gear' }).click()
  await page.getByRole('button', { name: 'Add from the book' }).nth(2).click()
  await page.getByLabel('Search').fill('Nano Tape')
  const tape = rows(page, /^Nano Tape$/)
  await expect(tape).toHaveCount(3)
  await expect(tape.locator('.noncanon')).toHaveCount(2)
  await expect(tape.locator('.booktag')).toHaveText(['TEST', 'TEST2'])

  await page.goto('/#/data')
  const row = page.locator('table', { hasText: 'Publisher' }).locator('tr', { hasText: 'Test Book One' })
  await expect(row).toContainText('test-book.pdf')
  await expect(row).toContainText('1111111111')
})
