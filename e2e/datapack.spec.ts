import { test, expect } from '@playwright/test'
import { existsSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'

// Books → Core data against the e2e server's stub worker (its "zip" is JSON behind a zip header; the real one is exercised
// in tests/server/datapack-python.test.ts). The core files are moved away on the server's own folder (playwright.config.ts sets
// where) and the pack brings them back; the moved copy is put back if the test fails half-way.
test('download a data pack, lose the core data, upload the pack from the setup screen, build a runner', async ({ page }, info) => {
  const core = join(process.env.CA2_E2E_DIR!, 'custom', 'imported', 'core'), away = `${core}-away`
  await page.goto('/#/books')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download data pack' }).click()])
  expect(download.suggestedFilename()).toMatch(/^chummer-anarchy2-datapack-\d{4}-\d{2}-\d{2}\.zip$/)
  const zip = info.outputPath('datapack.zip')
  await download.saveAs(zip)
  await expect(page.getByText('The data pack is ready.')).toBeVisible()

  renameSync(core, away)
  try {
    await page.goto('/')
    await page.reload()
    await expect(page.getByRole('heading', { name: 'The game data isn’t set up yet' })).toBeVisible()
    await page.getByRole('link', { name: 'Upload data pack' }).click()
    await expect(page.getByLabel('Upload data pack')).toBeFocused()

    await page.getByLabel('Upload data pack').setInputFiles({ name: 'notes.zip', mimeType: 'application/zip', buffer: Buffer.from('not a zip') })
    await expect(page.getByRole('alert')).toHaveText('This file can’t be loaded: this file isn’t a data pack (not a zip file). Choose a data pack made by this app.')

    await page.getByLabel('Upload data pack').setInputFiles(zip)
    await expect(page.getByText('Data pack loaded: 12 core tables replaced.')).toBeVisible()
    await page.getByRole('link', { name: 'Your runners' }).click()
    await page.getByRole('button', { name: 'New runner' }).click()
    await expect(page.getByRole('button', { name: 'Create runner' })).toBeVisible()
  } finally {
    if (existsSync(away)) {
      if (existsSync(core)) rmSync(core, { recursive: true })
      renameSync(away, core)
    }
  }
})
