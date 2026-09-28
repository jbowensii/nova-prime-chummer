import { test, expect } from '@playwright/test'

// No core data (custom/imported/core/ missing, and the build ships none): the app opens on its setup screen, and the
// Books page, where the core rulebook is imported, still works.
test('without core data the app asks for the core rulebook and opens the Books page', async ({ page }) => {
  await page.route('**/custom/imported/core/**', r => r.fulfill({ status: 404, body: 'not found' }))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'The game data isn’t set up yet' })).toBeVisible()
  await expect(page.getByText('Import the core rulebook on the Books page, or upload a data pack.')).toBeVisible()
  await page.getByRole('link', { name: 'Open Books' }).click()
  await expect(page.getByRole('heading', { name: 'Books', exact: true })).toBeVisible()
  await expect(page.locator('.supported')).toContainText('Shadowrun Anarchy 2.0 Alternative Core Rulebook v1.8')
  await page.goto('/#/data')
  await expect(page.getByRole('heading', { name: 'The game data isn’t set up yet' })).toBeVisible()
})

test('a missing table that runners can be built without shows a banner, not the setup screen', async ({ page }) => {
  await page.route('**/custom/imported/core/lifestyles.xml', r => r.fulfill({ status: 404, body: 'not found' }))
  await page.goto('/')
  await expect(page.getByText('Some game data is missing: lifestyles.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'New runner' })).toBeVisible()
})
