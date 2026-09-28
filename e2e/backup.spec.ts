import { test, expect, type Page } from '@playwright/test'
import { signIn, STATE } from './session'

/** Type the street name, wait for the server save, then go back to the runner list. */
async function rename(page: Page, name: string) {
  const saved = page.waitForResponse(r => r.request().method() === 'PUT' && !!r.request().postData()?.includes(`streetName="${name}"`))
  await page.getByLabel('Street name').fill(name)
  await saved
  await page.getByRole('link', { name: /Chummer/ }).click()
}

// Settings → Backup against the e2e server's stub worker (its "zip" is JSON behind a zip header; the real one is
// exercised in tests/server/backup-python.test.ts). A restore replaces everything, so this puts back what it saved.
test('download a backup, change a runner, restore, see it back', async ({ page }, info) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New runner' }).click()
  await page.getByRole('button', { name: 'Create runner' }).click()
  await rename(page, 'Backed Up')
  await expect(page.getByRole('link', { name: 'Backed Up' })).toBeVisible()

  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByLabel('Include my API keys').check()
  await expect(page.getByText('Anyone with the file can use your keys')).toBeVisible()
  await page.getByLabel('Include my API keys').uncheck()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download backup' }).click()])
  expect(download.suggestedFilename()).toMatch(/^chummer-anarchy2-backup-\d{4}-\d{2}-\d{2}\.zip$/)
  const zip = info.outputPath('backup.zip')
  await download.saveAs(zip)
  await expect(page.getByRole('group', { name: 'Backup' }).getByRole('status')).toContainText('The backup is ready')
  await page.getByRole('button', { name: 'Close' }).click()

  await page.getByRole('link', { name: 'Backed Up' }).click()
  await rename(page, 'Changed Since')
  await expect(page.getByRole('link', { name: 'Changed Since' })).toBeVisible()

  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByLabel('Restore from backup').setInputFiles({ name: 'notes.zip', mimeType: 'application/zip', buffer: Buffer.from('not a zip') })
  await expect(page.getByRole('group', { name: 'Backup' }).getByRole('alert')).toHaveText('This file can’t be restored: this file isn’t a backup (not a zip file).')
  await expect(page.getByLabel('Restore from backup')).toBeFocused()

  await page.getByLabel('Restore from backup').setInputFiles(zip)
  await expect(page.getByRole('heading', { name: 'Restore this backup?' })).toBeFocused()
  await expect(page.locator('.restore-preview')).toContainText('API keysNot included')
  await page.getByRole('button', { name: 'Replace everything on the server' }).click()
  await expect(page.getByText('Restored. Reloading the app…')).toBeVisible()
  // a restore ends every session: sign in again (the app's sign-in page comes with the accounts UI), and the tests after
  // this one start with the new session
  await signIn(page.request)
  await page.context().storageState({ path: STATE })
  await page.reload()
  await expect(page.getByRole('link', { name: 'Backed Up' })).toBeVisible({ timeout: 15000 }) // after the reload
  await expect(page.getByRole('link', { name: 'Changed Since' })).toHaveCount(0)
})
