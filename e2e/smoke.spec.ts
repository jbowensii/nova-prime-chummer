import { test, expect } from '@playwright/test'

// Create a Runner, finalize, earn, advance, print. Budget math:
// attributes 5 x 3 = 150,000; skills 5 x 2 = 25,000; light armor 7,500 -> 192,500 left.
// + 50,000 earned - 2,500 (Stealth 2 -> 3) = 240,000.
test('create, finalize, earn, advance, print', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New runner' }).click()
  await page.getByRole('button', { name: 'Create runner' }).click()
  await page.getByLabel('Street name').fill('Smoke Test')

  await page.getByRole('link', { name: 'Attributes' }).click()
  for (const a of ['Strength', 'Agility', 'Willpower', 'Logic', 'Charisma'])
    for (let i = 0; i < 2; i++) await page.getByRole('button', { name: `Raise ${a}` }).click()

  await page.getByRole('link', { name: 'Skills', exact: true }).click()
  for (const s of ['Athletics', 'Stealth', 'Perception', 'Influence', 'Network'])
    for (let i = 0; i < 2; i++) await page.getByRole('button', { name: `Raise ${s}` }).click()

  await page.getByRole('link', { name: 'Gear & spells' }).click()
  await page.getByRole('button', { name: 'Add from the book' }).first().click()
  await page.getByRole('listitem').filter({ hasText: 'Light armor' }).click()

  await expect(page.locator('.receipt .left')).toHaveText('192,500¥')

  await page.getByRole('link', { name: 'Review' }).click()
  await page.getByRole('button', { name: 'Finalize runner' }).click()
  await page.getByRole('button', { name: 'Finalize', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Ledger' })).toBeVisible()

  await page.getByLabel('Nuyen earned').fill('50000')
  await page.getByLabel('Run').fill('Smoke run')
  await page.getByRole('button', { name: 'Record earnings' }).click()
  await page.getByRole('button', { name: 'Record it' }).click()

  await page.getByRole('link', { name: 'Skills', exact: true }).click()
  await page.getByRole('button', { name: 'Raise Stealth' }).click()
  await page.getByRole('button', { name: 'Record it' }).click()
  await expect(page.locator('.receipt .left')).toHaveText('240,000¥')

  await page.getByRole('link', { name: 'Print' }).click()
  for (const h of ['Skills', 'Shadow Amps', 'Keywords', 'Wounds']) await expect(page.getByRole('heading', { name: h, exact: true })).toBeVisible()
})
