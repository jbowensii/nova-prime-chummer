import { test, expect } from '@playwright/test'

// Create a Runner, finalize, earn, advance, print. Budget math on the made-up core data (455,000 for a runner):
// attributes 5 x 3 x 12,000 = 180,000; skills 5 x 2 x 3,000 = 30,000; the Vest 4 x 3,000 = 12,000 -> 233,000 left.
// + 50,000 earned - 3,000 (Stealth 2 -> 3) = 280,000; removing the Vest gives 12,000 back = 292,000.
test('create, finalize, earn, advance, print', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New runner' }).click()
  await page.getByRole('button', { name: 'Create runner' }).click()
  await page.getByLabel('Street name').fill('Smoke Test')

  await page.getByRole('link', { name: 'Attributes' }).click()
  for (const a of ['Brawn', 'Finesse', 'Resolve', 'Wits', 'Presence'])
    for (let i = 0; i < 2; i++) await page.getByRole('button', { name: `Raise ${a}` }).click()

  await page.getByRole('link', { name: 'Skills', exact: true }).click()
  for (const s of ['Athletics', 'Stealth', 'Perception', 'Influence', 'Network'])
    for (let i = 0; i < 2; i++) await page.getByRole('button', { name: `Raise ${s}` }).click()

  await page.getByRole('link', { name: 'Gear & spells' }).click()
  await page.getByRole('button', { name: 'Add from the book' }).first().click()
  await page.getByRole('listitem').filter({ hasText: 'Vest' }).click()

  await expect(page.locator('.receipt .left')).toHaveText('233,000¥')

  await page.getByRole('link', { name: 'Review' }).click()
  await page.getByRole('button', { name: 'Finalize runner' }).click()
  await page.getByRole('button', { name: 'Finalize', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Ledger' })).toBeVisible()

  await page.getByLabel('Nuyen earned').fill('50000')
  await page.getByLabel('Run', { exact: true }).fill('Smoke run')
  await page.getByRole('button', { name: 'Record earnings' }).click()
  await page.getByRole('button', { name: 'Record it' }).click()

  // 0.5.5: nothing is locked; a change applies at once and the ledger logs it with its price
  await page.getByRole('link', { name: 'Skills', exact: true }).click()
  await page.getByRole('button', { name: 'Raise Stealth' }).click()
  await expect(page.locator('.receipt .left')).toHaveText('280,000¥')
  await page.getByRole('link', { name: 'Gear & spells' }).click()
  await page.locator('tr', { hasText: 'Vest' }).getByRole('button', { name: 'Remove' }).click()
  await expect(page.locator('.receipt .left')).toHaveText('292,000¥') // the Vest's 12,000 back
  await page.getByRole('link', { name: 'Ledger' }).click()
  const ledger = page.locator('table.data tbody')
  await expect(ledger.locator('tr').nth(0)).toContainText('Creation finished · 233,000¥ left')
  await expect(ledger.locator('tr', { hasText: 'Stealth: 2 → 3' })).toContainText('−3,000¥')
  await expect(ledger.locator('tr', { hasText: /Removed .*Vest/ })).toContainText('12,000¥')
  await expect(page.locator('table.data tfoot')).toContainText('292,000¥')

  await page.getByRole('link', { name: 'Print' }).click()
  for (const h of ['Skills', 'Shadow Amps', 'Keywords', 'Wounds']) await expect(page.getByRole('heading', { name: h, exact: true })).toBeVisible()
})
