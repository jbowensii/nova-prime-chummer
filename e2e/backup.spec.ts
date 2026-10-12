import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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
  expect(download.suggestedFilename()).toMatch(/^nova-prime-chummer-backup-\d{4}-\d{2}-\d{2}\.zip$/)
  const zip = info.outputPath('backup.zip')
  await download.saveAs(zip)
  await expect(page.getByRole('group', { name: 'Backup' }).getByRole('status')).toContainText('The backup is ready')
  await page.getByRole('button', { name: 'Close' }).click()

  await page.getByRole('link', { name: 'Backed Up' }).click()
  await rename(page, 'Changed Since')
  await expect(page.getByRole('link', { name: 'Changed Since' })).toBeVisible()

  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByLabel('Restore from backup').setInputFiles({ name: 'notes.zip', mimeType: 'application/zip', buffer: Buffer.from('not a zip') })
  await expect(page.getByRole('group', { name: 'Backup' }).getByRole('alert')).toHaveText(
    'This file can’t be restored: this file isn’t a backup (not a zip file).',
  )
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

test('a restore brings back the backup’s accounts: a player added since is gone, the admin signs in again', async ({ page }, info) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Settings' }).click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download backup' }).click()])
  const zip = info.outputPath('accounts.zip')
  await download.saveAs(zip)
  await page.goto('/#/users')
  await page.getByRole('button', { name: 'Add account' }).click()
  const form = page.getByRole('dialog')
  await form.getByLabel('Name', { exact: true }).fill('Pat Player')
  await form.getByLabel('Username').fill('pat')
  await form.getByLabel('Password', { exact: true }).fill('pat-password-1')
  await form.getByRole('button', { name: 'Add account' }).click()
  await expect(page.getByRole('row', { name: /Pat Player/ })).toBeVisible()

  await page.goto('/')
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByLabel('Restore from backup').setInputFiles(zip)
  const preview = page.locator('.restore-preview')
  await expect(preview).toContainText('Accounts1 account')
  await expect(preview).toContainText('Authelia client secretNot included')
  await expect(preview).toContainText('Everyone is signed out, you too.')
  await page.getByRole('button', { name: 'Replace everything on the server' }).click()
  // the reload lands on the sign-in page, which says why
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole('status')).toHaveText('The server was restored from a backup. Sign in with the accounts in that backup.')
  const admin = JSON.parse(readFileSync(join(process.env.CA2_E2E_DIR!, 'e2e-admin.json'), 'utf8'))
  await page.getByLabel('Username').fill(admin.username)
  await page.getByLabel('Password', { exact: true }).fill(admin.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Your runners' })).toBeVisible()
  await page.context().storageState({ path: STATE })
  await page.goto('/#/users')
  await expect(page.getByRole('row', { name: /admin/ })).toBeVisible()
  await expect(page.getByRole('row', { name: /Pat Player/ })).toHaveCount(0)
})
