// 0.6.0: runners and book data download as Chummer Anarchy export v1 for the Foundry importer.
import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

async function newRunner(page: Page, name: string) {
  await page.goto('/')
  await page.getByRole('button', { name: 'New runner' }).click()
  await page.getByRole('button', { name: 'Create runner' }).click()
  await page.getByLabel('Street name').fill(name)
  await expect(page.getByRole('status', { name: 'Save status' })).toContainText('All changes saved')
}
const json = async (p: Promise<import('@playwright/test').Download>) => JSON.parse(readFileSync((await (await p).path())!, 'utf8'))

test('a runner downloads for Foundry from its editor', async ({ page }) => {
  await newRunner(page, 'Export Me')
  const dl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export for Foundry' }).click()
  expect((await dl).suggestedFilename()).toMatch(/^runners-\d{4}-\d{2}-\d{2}\.ca2foundry\.json$/)
  const f = await json(dl)
  expect(f).toMatchObject({ format: 'chummer-anarchy2-export', version: 1, kind: 'runners' })
  expect(f.runners.map((r: { streetName: string }) => r.streetName)).toEqual(['Export Me'])
})

test('several runners download together from the runner list', async ({ page }) => {
  await newRunner(page, 'Pick One')
  await newRunner(page, 'Pick Two')
  await page.goto('/')
  await page.getByRole('button', { name: 'Export for Foundry…' }).click()
  const dlg = page.getByRole('dialog', { name: 'Export runners for Foundry' })
  await dlg.getByRole('button', { name: 'None' }).click()
  await dlg.getByRole('checkbox', { name: 'Pick One' }).check()
  await dlg.getByRole('checkbox', { name: 'Pick Two' }).check()
  const dl = page.waitForEvent('download')
  await dlg.getByRole('button', { name: 'Download 2 runners' }).click()
  const f = await json(dl)
  expect(f.runners.map((r: { streetName: string }) => r.streetName).sort()).toEqual(['Pick One', 'Pick Two'])
})
