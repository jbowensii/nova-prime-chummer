import { test, expect, type Page } from '@playwright/test'

// Catalog edits on the made-up fixture (tests/fixtures/mini/custom): the e2e server's stub worker writes
// custom/edits/ as the importer would. Every test puts back what it changed; other specs share the folder.

const dialog = (page: Page) => page.getByRole('dialog').last()

test('edit a rule’s description: saved, shown after a reload with Edited; restore the book version', async ({ page }) => {
  await page.goto('/#/rules')
  const rule = page.locator('.rule-list > div', { hasText: 'Risk Reduction (spec)' })
  await expect(rule.locator('.edited')).toHaveCount(0)
  await rule.getByRole('button', { name: 'Edit Risk Reduction (spec)' }).click()
  await dialog(page).getByLabel('Description', { exact: true }).fill('Reroll one die per point, made-up text.')
  await dialog(page).getByRole('button', { name: 'Save changes' }).click()
  await expect(page.locator('.toast', { hasText: 'Saved Risk Reduction (spec).' })).toBeVisible()
  await expect(rule.locator('dd')).toHaveText('Reroll one die per point, made-up text.')

  await page.reload()
  await expect(rule.locator('dd')).toHaveText('Reroll one die per point, made-up text.')
  await expect(rule.locator('.edited')).toHaveText('Edited')

  await rule.getByRole('button', { name: 'Edit Risk Reduction (spec)' }).click()
  await expect(dialog(page).getByText('Changed from the book')).toBeVisible()
  page.once('dialog', d => d.accept())
  await dialog(page).getByRole('button', { name: 'Restore book version' }).click()
  await expect(page.locator('.toast', { hasText: 'Restored the book’s version' })).toBeVisible()
  await expect(rule.locator('.edited')).toHaveCount(0)
  await expect(rule.locator('dd')).toHaveCount(0)
})

test('edit gear from the picker; a refused edit says why', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New runner' }).click()
  await page.getByRole('button', { name: 'Create runner' }).click()
  await page.getByRole('link', { name: 'Gear' }).click()
  await page.getByRole('button', { name: 'Add from the book' }).nth(2).click()
  await page.getByLabel('Search').fill('Nano Tape')
  const tape = page.locator('.picker li').filter({ has: page.locator('.booktag', { hasText: /^TEST$/ }) })
  await tape.getByRole('button', { name: 'Edit Nano Tape' }).click()
  const form = dialog(page)
  await form.getByLabel('Name', { exact: true }).fill('')
  await expect(form.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  await form.getByLabel('Name', { exact: true }).fill('REFUSE me')
  await form.getByRole('button', { name: 'Save changes' }).click()
  await expect(form.getByRole('alert')).toHaveText('Couldn’t save: unknown effect ref "stub-refusal". Fix it and save again.')
  await form.getByLabel('Name', { exact: true }).fill('Nano Tape')
  await form.getByLabel('Description', { exact: true }).fill('Sticks to anything, made-up text.')
  await form.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.locator('dialog[open] .toast', { hasText: 'Saved Nano Tape.' })).toBeVisible() // over the picker, not behind it
  await expect(tape.locator('.t')).toHaveText('Sticks to anything, made-up text.')
  await expect(tape.locator('.edited')).toBeVisible()
  await expect(page.locator('.picker li', { hasText: 'Nano Tape' })).toHaveCount(3) // the picker stays open, nothing was added

  await tape.getByRole('button', { name: 'Edit Nano Tape' }).click()
  page.once('dialog', d => d.accept())
  await dialog(page).getByRole('button', { name: 'Restore book version' }).click()
  await expect(tape.locator('.edited')).toHaveCount(0)
})

test('add a house-rule amp under a new source; it shows in the picker with its source', async ({ page }) => {
  await page.goto('/#/data')
  await page.getByRole('button', { name: 'Add an amp' }).click()
  const form = dialog(page)
  await form.getByLabel('House-rule source').selectOption('+')
  await form.getByLabel('Source id').fill('house')
  await form.getByLabel('Source name').fill('Our House Rules')
  await form.getByLabel('Page').fill('4')
  await form.getByLabel('Amp type').selectOption('quality')
  await form.getByLabel('Name', { exact: true }).fill('Four-leaf Clover')
  await form.getByLabel('Description', { exact: true }).fill('Luck follows you, made-up text.')
  await form.getByRole('button', { name: 'Save to the catalog' }).click()
  await expect(page.locator('.toast', { hasText: 'Added Four-leaf Clover.' })).toBeVisible()
  const row = page.locator('table.edits tr', { hasText: 'Four-leaf Clover' })
  await expect(row).toContainText('Added by you (house rule)')
  await expect(row.locator('.src')).toHaveText('HOUSE p.4')
  await expect(page.locator('table.data tr', { hasText: 'Our House Rules' })).toContainText('Non-canon')

  await page.goto('/')
  await page.getByRole('button', { name: 'New runner' }).click()
  await page.getByRole('button', { name: 'Create runner' }).click()
  await page.getByRole('link', { name: 'Shadow Amps' }).click()
  await page.getByRole('button', { name: 'Add an amp' }).click()
  await page.getByLabel('Search the book’s amps').fill('Four-leaf')
  const amp = page.locator('.picker li', { hasText: 'Four-leaf Clover' })
  await expect(amp.locator('.src')).toHaveText('HOUSE p.4')
  await expect(amp.locator('.noncanon')).toBeVisible()
  await expect(amp.locator('.t')).toHaveText('Luck follows you, made-up text.')
})

test('edit a book add-on from the amp picker; an unsaved runner change survives the catalog reload', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New runner' }).click()
  await page.getByRole('button', { name: 'Create runner' }).click()
  const saved = page.waitForResponse(r => r.request().method() === 'PUT' && r.url().includes('/api/characters/'))
  await page.getByLabel('Street name').fill('Before')
  await saved
  await page.route('**/api/characters/**', r => r.request().method() === 'PUT' ? r.abort() : r.continue()) // the next change stays unsaved
  await page.getByLabel('Street name').fill('After, unsaved')
  await expect(page.getByText(/Couldn’t reach tower04/)).toBeVisible()

  await page.getByRole('link', { name: 'Shadow Amps' }).click()
  await page.getByRole('button', { name: 'Add an amp' }).click()
  await page.getByLabel('Search the book’s amps').fill('Static Shroud')
  const shroud = page.locator('.picker li', { hasText: 'Static Shroud' })
  await expect(shroud).toHaveClass('off') // listed to be edited, not picked
  await expect(shroud).toContainText('Add-on for Equipment')
  await shroud.getByRole('button', { name: 'Edit Static Shroud' }).click()
  await dialog(page).getByLabel('Description', { exact: true }).fill('Hums quietly, made-up text.')
  await dialog(page).getByRole('button', { name: 'Save to the catalog' }).click()
  await expect(page.locator('dialog[open] .toast', { hasText: 'Saved Static Shroud.' })).toBeVisible()
  await expect(shroud.locator('.t')).toHaveText('Hums quietly, made-up text.')
  await expect(shroud.locator('.edited')).toBeVisible()

  await shroud.getByRole('button', { name: 'Edit Static Shroud' }).click()
  page.once('dialog', d => d.accept())
  await dialog(page).getByRole('button', { name: 'Restore book version' }).click()
  await expect(shroud.locator('.edited')).toHaveCount(0)
  await page.getByRole('button', { name: 'Close' }).click()
  await page.getByRole('link', { name: 'Concept' }).click()
  await expect(page.getByLabel('Street name')).toHaveValue('After, unsaved')
})
