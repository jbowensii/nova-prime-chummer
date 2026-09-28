import { test, expect } from '@playwright/test'

// The e2e custom folder has one imported sample runner (custom/imported/samples.xml): the made-up
// "Test Face" the pregen recipe's tests build. Imported samples replace the bundled ones.
test('load sample characters: the imported books’ runners', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Load sample characters' }).click()
  await expect(page.getByRole('status')).toHaveText('Added 1 sample characters.')
  await expect(page.getByRole('link', { name: 'Test Face' })).toBeVisible()
  await page.getByRole('button', { name: 'Load sample characters' }).click()
  await expect(page.getByRole('status')).toHaveText('The sample characters are already in your library.')
})
