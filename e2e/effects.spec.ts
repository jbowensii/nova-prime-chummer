import { test, expect } from '@playwright/test'

// Anarchy's narrative effect kinds in the Amp Builder (made-up catalog): an Advantage on a Test marks that skill's pool
// and Review lists it; "Counts" off keeps an effect listed, not counted.
test('an Advantage effect: picked with its Test, marked on the pool, listed in Review', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New runner' }).click()
  await page.getByRole('button', { name: 'Create runner' }).click()
  await page.getByLabel('Street name').fill('Keen')
  await page.getByRole('link', { name: 'Skills', exact: true }).click()
  await page.getByRole('button', { name: 'Raise Perception' }).click()
  await page.getByRole('link', { name: 'Shadow Amps' }).click()
  await page.getByRole('button', { name: 'Add an amp' }).click()
  await page.getByRole('button', { name: 'Trait', exact: true }).click()
  await page.getByLabel('Name').fill('Night owl')
  await page.getByLabel('Add an effect').selectOption('advantage')
  await page.getByLabel('Test', { exact: true }).selectOption('perception')
  await expect(page.getByLabel('How it is turned on')).toHaveValue('')
  await expect(page.getByRole('checkbox', { name: 'Counts' })).toBeChecked()
  await page.getByLabel('Add an effect').selectOption('rr-attr')
  await page.getByRole('checkbox', { name: 'Counts' }).nth(1).uncheck()
  await page.getByRole('button', { name: 'Add amp' }).click()

  await page.getByRole('link', { name: 'Skills', exact: true }).click()
  await expect(page.locator('tr', { hasText: 'Perception' }).first()).toContainText('Adv')
  await page.getByRole('link', { name: 'Review' }).click()
  const fx = page.locator('ul.effects')
  await expect(fx).toContainText('Advantage on Perception Tests (Night owl)')
  await expect(fx.locator('li.muted')).toContainText('not applied')
})
