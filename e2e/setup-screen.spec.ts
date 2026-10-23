import { test, expect } from '@playwright/test'

// The Setup screen (#/setup): Configuration writes options.json and shows each value's source; Backups lists safety
// backups and holds the backup/restore controls. (The e2e server runs the old layout: Setup works the same on it.)
test('Configuration: edit a setting, see it from options.json, then put it back', async ({ page }) => {
  await page.goto('/#/setup')
  await expect(page.getByRole('heading', { name: 'Setup' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Configuration' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByLabel('upnp')).toBeVisible()
  await expect(page.getByText('takes effect in a later phase').first()).toBeVisible()
  await page.getByLabel('language', { exact: true }).fill('de')
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByRole('status')).toContainText('Saved to Config/options.json')
  await expect(page.getByText('Now: de (from options.json)')).toBeVisible()
  await page
    .locator('.field', { has: page.getByLabel('language', { exact: true }) })
    .getByRole('button', { name: 'Use default' })
    .click()
  await expect(page.getByText('Now: en (from default)')).toBeVisible()
})

test('Backups, Updates and Game Systems tabs', async ({ page }) => {
  await page.goto('/#/setup/backups')
  await expect(page.getByRole('heading', { name: 'Safety backups' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Download backup' })).toBeVisible()
  await page.getByRole('link', { name: 'Updates' }).click()
  await expect(page.getByRole('button', { name: 'Check for updates' })).toBeDisabled()
  await page.getByRole('link', { name: 'Game Systems' }).click()
  await expect(page.getByText('Installing, enabling and disabling systems comes in a later phase')).toBeHidden() // legacy layout: no systems
})
