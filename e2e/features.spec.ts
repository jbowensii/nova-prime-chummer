import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

async function newRunner(page: Page, name: string) {
  await page.goto('/')
  await page.getByRole('button', { name: 'New runner' }).click()
  await page.getByRole('button', { name: 'Create runner' }).click()
  await page.getByLabel('Street name').fill(name)
}

test('export a runner, delete it, import the file back', async ({ page }) => {
  await newRunner(page, 'Roundtrip')
  await page.getByRole('link', { name: 'Attributes' }).click()
  await page.getByRole('button', { name: 'Raise Agility' }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export file' }).click()
  const file = await (await download).path()
  expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ formatVersion: 1, identity: { streetName: 'Roundtrip' }, build: { attributes: { agi: 2 } } })

  await page.goto('/')
  await page.getByRole('button', { name: 'Delete' }).first().click()
  await page.getByRole('button', { name: 'Delete from this browser' }).click()
  await expect(page.getByText('Roundtrip')).toHaveCount(0)
  await page.locator('input[type=file]').setInputFiles({ name: 'Roundtrip.ca2.json', mimeType: 'application/json', buffer: readFileSync(file) })
  await expect(page.getByRole('status')).toContainText('Imported Roundtrip')
  await expect(page.getByRole('link', { name: 'Roundtrip' })).toBeVisible()
})

test('a broken import file is refused with a reason', async ({ page }) => {
  await page.goto('/')
  await page.locator('input[type=file]').setInputFiles({ name: 'bad.ca2.json', mimeType: 'application/json', buffer: Buffer.from('{"nope": true}') })
  await expect(page.getByRole('status')).toContainText('bad.ca2.json: Missing formatVersion')
})

test('portrait upload is downscaled and shown in the library', async ({ page }) => {
  await newRunner(page, 'Portrait')
  await page.getByLabel('Portrait').setInputFiles('unraid/icon.png')
  await page.waitForTimeout(600)
  await page.goto('/')
  const img = page.locator('.dossier img.face').first()
  await expect(img).toBeVisible()
  expect(await img.getAttribute('src')).toMatch(/^data:image\/jpeg;base64,/)
})

test('phone width: the receipt collapses to a bar and opens on tap', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await newRunner(page, 'Phone')
  const receipt = page.locator('.receipt')
  await expect(receipt.locator('.peek')).toContainText('Left to spend')
  const closed = (await receipt.boundingBox())!.height
  expect(closed).toBeLessThan(80)
  await receipt.locator('.peek').click()
  expect((await receipt.boundingBox())!.height).toBeGreaterThan(300)
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth
    && [...document.querySelectorAll('.work p')].every(p => p.getBoundingClientRect().right <= innerWidth + 1))
  expect(await fits()).toBe(true) // no sideways page scroll, no clipped text
  await page.locator('.receipt .peek').click()
  for (const tab of ['Attributes', 'Skills', 'Shadow Amps', 'Gear & spells', 'Review']) {
    await page.getByRole('link', { name: tab, exact: true }).click()
    expect(await fits(), tab).toBe(true)
  }
})

test('light and dark themes both apply', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  const light = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  await page.emulateMedia({ colorScheme: 'dark' })
  const dark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(light).toBe('rgb(214, 216, 210)')
  expect(dark).toBe('rgb(27, 30, 33)')
})

test('Finalize can be undone from the ledger until the first entry', async ({ page }) => {
  await newRunner(page, 'Oops')
  await page.getByRole('link', { name: 'Review' }).click()
  await page.getByRole('button', { name: 'Finalize runner' }).click()
  await page.getByRole('button', { name: 'Finalize', exact: true }).click()
  await expect(page.locator('.mode')).toHaveText('Career')
  await page.getByRole('button', { name: 'Reopen creation' }).click()
  await expect(page.locator('.mode')).toHaveText('Creation')
})

test('technomancer: Emerged amp, Tasking skill, living persona', async ({ page }) => {
  await newRunner(page, 'Resonance')
  await page.getByRole('link', { name: 'Attributes' }).click()
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Raise Willpower' }).click()
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Raise Charisma' }).click()
  await page.getByRole('link', { name: 'Shadow Amps' }).click()
  await page.getByRole('button', { name: 'Add an amp' }).click()
  await page.getByRole('button', { name: 'Emerged', exact: true }).click()
  await page.getByLabel('Name').fill('Emerged')
  await page.getByRole('button', { name: 'Add amp' }).click()
  await expect(page.locator('.receipt')).toContainText('Living persona FW / Att')
  await expect(page.locator('.receipt')).toContainText('4 / 3')
  await page.getByRole('link', { name: 'Skills', exact: true }).click()
  await page.getByRole('button', { name: 'Raise Tasking' }).click()
  await page.getByRole('link', { name: 'Review' }).click()
  await expect(page.getByText('Tasking needs the Emerged amp')).toHaveCount(0)
})

test('Amp Builder: apply a book add-on to a vehicle', async ({ page }) => {
  await newRunner(page, 'Rigger')
  await page.getByRole('link', { name: 'Shadow Amps' }).click()
  await page.getByRole('button', { name: 'Add an amp' }).click()
  await page.getByRole('button', { name: 'Vehicle or drone', exact: true }).click()
  await page.getByLabel('Name').fill('Drone')
  const before = await page.locator('.ampfoot b').first().textContent()
  await page.getByLabel('Apply a book add-on').selectOption('mod-flying')
  const after = await page.locator('.ampfoot b').first().textContent()
  expect(Number(after)).toBe(Number(before) + 1)
  await expect(page.getByText(/\(flying\)/)).toBeVisible()
})
