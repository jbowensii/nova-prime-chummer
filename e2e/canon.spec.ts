import { test, expect } from '@playwright/test'

// Made-up imported books (tests/fixtures/mini/custom): TEST is non-canon, its rules sheet is "test".

test('non-canon content: badge in the picker, flagged when the table is canon only', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New runner' }).click()
  await page.getByRole('button', { name: 'Create runner' }).click()
  await page.getByLabel('Street name').fill('Purist')
  await page.getByRole('link', { name: 'Shadow Amps' }).click()
  await page.getByRole('button', { name: 'Add an amp' }).click()
  await page.getByLabel('Search the book’s amps').fill('Hawk Instinct')
  const row = page.locator('.picker li', { hasText: 'Hawk Instinct' })
  await expect(row.locator('.noncanon')).toHaveText('Non-canon')
  await row.click()
  await page.getByRole('button', { name: 'Add amp' }).click()
  await expect(page.locator('tr', { hasText: 'Hawk Instinct' }).locator('.noncanon')).toBeVisible()

  await page.getByRole('link', { name: 'Review' }).click()
  await expect(page.getByText(/isn’t canon/)).toHaveCount(0)
  const runner = page.url()
  const nonCanon = async (on: boolean) => {
    await page.goto('/#/table')
    const sw = page.getByRole('region', { name: 'Table rules' }).getByRole('switch', { name: 'Non-canon content allowed' })
    if (await sw.isChecked() !== on) await sw.click() // saved first, then shown
    await expect(page.getByRole('region', { name: 'Table rules' }).getByRole('status')).toHaveText(`Non-canon content allowed is ${on ? 'on' : 'off'}.`)
  }
  await nonCanon(false)
  try {
    await page.goto(runner)
    await expect(page.getByText(/Hawk Instinct isn’t canon \(.*\); this table is canon only/).first()).toBeVisible()
  } finally { await nonCanon(true) }
})

test('rules reference: search the quick-reference sheets', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Rules', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Rules reference' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Table rules' })).toHaveCount(0) // book content only: the switches are on Table setup
  await page.getByLabel('Search the rules').fill('spec')
  await expect(page.locator('.rule-list dt', { hasText: 'Risk Reduction (spec)' })).toBeVisible()
  await page.getByLabel('Search the rules').fill('no such rule')
  await expect(page.locator('.rule-list dt')).toHaveCount(0)
  await page.getByLabel('Search the rules').fill('')
  await page.getByLabel('Sheet').selectOption('test')
  await expect(page.getByRole('heading', { name: 'Test' })).toBeVisible()
})

test('game data lists each source and whether it is canon', async ({ page }) => {
  await page.goto('/#/data')
  const table = page.locator('table', { hasText: 'Publisher' })
  await expect(table.locator('tr', { hasText: 'CRB' })).toContainText('Canon')
  await expect(table.locator('tr', { hasText: 'DHSA' }).locator('.noncanon')).toBeVisible()
})
