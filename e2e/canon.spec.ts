import { test, expect } from '@playwright/test'

test('non-canon content: badge in the picker, flagged when the runner is canon only', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New runner' }).click()
  await page.getByRole('button', { name: 'Create runner' }).click()
  await page.getByLabel('Street name').fill('Purist')
  await page.getByRole('link', { name: 'Shadow Amps' }).click()
  await page.getByRole('button', { name: 'Add an amp' }).click()
  await page.getByLabel('Search the book’s amps').fill('Gun fu')
  const row = page.locator('.picker li', { hasText: 'Gun fu' })
  await expect(row.locator('.noncanon')).toHaveText('Non-canon')
  await row.click()
  await page.getByRole('button', { name: 'Add amp' }).click()
  await expect(page.locator('tr', { hasText: 'Gun fu' }).locator('.noncanon')).toBeVisible()

  await page.getByRole('link', { name: 'Review' }).click()
  await expect(page.getByText(/isn’t canon/)).toHaveCount(0)
  await page.getByRole('link', { name: 'Concept' }).click()
  await page.getByLabel(/Allow non-canon content/).uncheck()
  await page.getByRole('link', { name: 'Review' }).click()
  await expect(page.getByText(/Gun fu isn’t canon/).first()).toBeVisible()
})

test('rules reference: search the quick-reference sheets', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Rules' }).click()
  await expect(page.getByRole('heading', { name: 'Rules reference' })).toBeVisible()
  await page.getByLabel('Search the rules').fill('hot-sim')
  await expect(page.locator('.rule-list dt', { hasText: 'VR hot-sim' })).toBeVisible()
  await expect(page.locator('.rule-list dt', { hasText: 'Dice Pool' })).toHaveCount(0)
  await page.getByLabel('Search the rules').fill('')
  await page.getByLabel('Sheet').selectOption('magic')
  await expect(page.locator('.rule-list dt', { hasText: 'Astral Projection' })).toBeVisible()
  await expect(page.locator('.rule-list dt', { hasText: 'Brute Force' })).toHaveCount(0)
})

test('game data lists each source and whether it is canon', async ({ page }) => {
  await page.goto('/#/data')
  const table = page.locator('table', { hasText: 'Publisher' })
  await expect(table.locator('tr', { hasText: 'CRB' })).toContainText('Canon')
  await expect(table.locator('tr', { hasText: 'DHSA' }).locator('.noncanon')).toBeVisible()
})
