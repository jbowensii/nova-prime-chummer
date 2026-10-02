// 0.8.2: a token picture of its own beside the portrait (the same dialog, round), "Same as portrait" by default, and the
// Foundry export's runners[].token.
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

test('token: same as portrait by default; its own picture framed in the round dialog; exported for Foundry', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New runner' }).click()
  await page.getByRole('button', { name: 'Create runner' }).click()
  await page.getByLabel('Street name').fill('Token Test')
  await page.getByRole('button', { name: 'Add a portrait…' }).click()
  const pd = page.getByRole('dialog', { name: 'Portrait' })
  await pd.getByLabel('Portrait file').setInputFiles('unraid/icon.png')
  await expect(pd.locator('.pe-stage img')).toBeVisible()
  await pd.getByRole('button', { name: 'Save portrait' }).click()
  // no token yet: the round one shows the portrait
  const token = page.locator('.portrait-row img.tokenface'), portrait = page.locator('.portrait-row img.face')
  await expect(token).toHaveCSS('border-radius', '50%')
  expect(await token.getAttribute('src')).toBe(await portrait.getAttribute('src'))
  await expect(page.getByText('Token: same as portrait')).toBeVisible()

  await page.getByRole('button', { name: 'Set a token…' }).click()
  const td = page.getByRole('dialog', { name: 'Token' })
  const same = td.getByRole('checkbox', { name: 'Same as portrait' })
  await expect(same).toBeChecked()
  await expect(td.locator('.pe-stage')).toHaveCSS('border-radius', '50%')
  await expect(td.getByLabel('Zoom')).toBeDisabled()
  await same.uncheck() // frame the portrait's picture for the circle
  await td.getByLabel('Zoom').fill('2')
  await td.getByRole('button', { name: 'Save token' }).click()
  await expect(page.getByText('Token: its own picture')).toBeVisible()
  await expect.poll(() => token.evaluate(e => (e as HTMLImageElement).naturalWidth)).toBe(384)
  expect(await token.getAttribute('src')).not.toBe(await portrait.getAttribute('src'))
  await expect(page.getByRole('status', { name: 'Save status' })).toContainText('All changes saved')

  const dl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export for Foundry' }).click()
  const r = JSON.parse(readFileSync((await (await dl).path())!, 'utf8')).runners[0]
  expect(r.token).toMatch(/^data:image\/(png|jpeg);base64,/)
  expect(r.token).not.toBe(r.portrait)

  // back to the portrait: the token of its own is dropped
  await page.getByRole('button', { name: 'Change token…' }).click()
  await td.getByRole('checkbox', { name: 'Same as portrait' }).check()
  await td.getByRole('button', { name: 'Save token' }).click()
  await expect(page.getByText('Token: same as portrait')).toBeVisible()
  expect(await token.getAttribute('src')).toBe(await portrait.getAttribute('src'))
})
