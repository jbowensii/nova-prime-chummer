import { test, expect } from '@playwright/test'

// 0.5.8 runner list markers: "User defined" on a runner the player made, a red "Error" on an overspent one.
test('runner list: User defined on your own runner, none on an example; Error while overspent', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New runner' }).click()
  await page.getByRole('button', { name: 'Create runner' }).click()
  await page.getByLabel('Street name').fill('Marker Mike')
  await page.getByRole('link', { name: 'Gear & spells', exact: true }).click()
  await page
    .locator('section', { has: page.getByRole('heading', { name: 'Equipment' }) })
    .getByRole('button', { name: 'Custom' })
    .click()
  await page.getByLabel('Name', { exact: true }).fill('Made-up yacht')
  await page.getByLabel(/Price set by the GM/).fill('900000')
  await page.getByRole('button', { name: 'Add item' }).click()
  await expect(page.getByRole('status', { name: 'Save status' })).toContainText('All changes saved')
  await page.goto('/#/')
  const mine = page.locator('.dossier', { hasText: 'Marker Mike' })
  await expect(mine.getByText('User defined', { exact: true })).toBeVisible()
  await expect(mine.getByLabel(/overspent by/i)).toHaveText('Error')
  await page.screenshot({ path: '.extract/screenshots/0.5.8/markers-light.png' })

  await page.goto(`/#/c/${(await mine.locator('a.title').getAttribute('href'))!.split('/')[2]}/gear`)
  await page.locator('tr', { hasText: 'Made-up yacht' }).getByRole('button', { name: 'Remove' }).click()
  await expect(page.getByRole('status', { name: 'Save status' })).toContainText('All changes saved')
  await page.goto('/#/')
  await expect(page.locator('.dossier', { hasText: 'Marker Mike' }).getByLabel(/overspent by/i)).toHaveCount(0)

  await page.getByRole('button', { name: 'Load example characters' }).click()
  await expect(page.locator('.dossier').nth(1)).toBeVisible()
  const examples = page.locator('.dossier', { hasText: 'Test Face' }) // an example; other specs leave their own runners in the list
  await expect(examples.first()).toBeVisible()
  await expect(examples.getByText('User defined')).toHaveCount(0)
})
