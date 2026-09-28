import { test, expect, type Page } from '@playwright/test'

// The e2e server runs the real Books API with a stub worker (tests/fixtures/stub-worker.mjs): any PDF
// imports as the made-up book STUB (one amp, "Stub Amp"); a PDF containing "needs-ai" matches no recipe,
// and the stub "AI" proposes Lucky Charm (an amp) and Tin Spoon (gear).

const pdf = (name: string, marker = '') => ({ name, mimeType: 'application/pdf', buffer: Buffer.from(`%PDF-1.4 ${marker}\n%%EOF\n`) })

async function pickAmp(page: Page, name: string) {
  await page.goto('/')
  await page.getByRole('button', { name: 'New runner' }).click()
  await page.getByRole('button', { name: 'Create runner' }).click()
  await page.getByRole('link', { name: 'Shadow Amps' }).click()
  await page.getByRole('button', { name: 'Add an amp' }).click()
  await page.getByLabel('Search the book’s amps').fill(name)
  return page.locator('.picker li').filter({ has: page.locator('b', { hasText: name }) })
}

test('a fresh library points to the Books page', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Upload your books to add amps, spells and gear')).toBeVisible()
})

test('upload a book, use its amps, remove it', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Books', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Books', exact: true })).toBeVisible()
  await expect(page.locator('.supported')).toContainText('Shadowrun Anarchy 2.0 Alternative Core Rulebook v1.8')

  await page.getByLabel('Choose PDF files').setInputFiles(pdf('Stub Book.pdf'))
  const row = page.locator('.book', { hasText: 'Stub Book' })
  await expect(row).toContainText('Imported', { timeout: 10000 })
  await expect(row).toContainText('1 amp')

  await expect(await pickAmp(page, 'Stub Amp')).toHaveCount(1)

  await page.goto('/#/books')
  // the server drops out: the list stays, a banner says so, polling carries on and recovers
  await expect(page.locator('.book', { hasText: 'Stub Book' })).toContainText('Imported')
  await page.route('**/api/books', r => r.abort())
  await page.locator('.book', { hasText: 'Stub Book' }).getByRole('button', { name: 'Re-import' }).click()
  await expect(page.getByText('The server can’t be reached — retrying.')).toBeVisible()
  await expect(page.locator('.book', { hasText: 'Stub Book' })).toBeVisible()
  await page.unroute('**/api/books')
  await expect(page.getByText('The server can’t be reached — retrying.')).toHaveCount(0, { timeout: 10000 })
  await expect(page.locator('.book', { hasText: 'Stub Book' })).toContainText('Imported', { timeout: 10000 })
  await page.locator('.book', { hasText: 'Stub Book' }).getByRole('button', { name: 'Remove' }).click()
  await page.getByLabel('Also delete the PDF and its text').check()
  await page.getByRole('button', { name: 'Remove book' }).click()
  await expect(page.locator('.book', { hasText: 'Stub Book' })).toHaveCount(0, { timeout: 10000 })

  await expect(await pickAmp(page, 'Stub Amp')).toHaveCount(0)
})

test('AI settings, extract with AI, review and add', async ({ page }) => {
  await page.goto('/#/books')
  await page.getByRole('link', { name: 'AI settings' }).click()
  const anthropic = page.locator('fieldset', { hasText: 'Anthropic' })
  await expect(anthropic).toContainText('No key saved')
  await anthropic.getByLabel('Turn on').check()
  await page.getByLabel('Provider to use').selectOption('anthropic')
  // saving the key first must not throw away the unsaved choices above
  await anthropic.getByLabel('API key').fill('sk-ant-e2e-not-a-real-key')
  await anthropic.getByRole('button', { name: 'Save key' }).click()
  await expect(anthropic).toContainText('Key saved')
  await expect(anthropic.getByLabel('API key')).toHaveValue('')
  await expect(anthropic.getByLabel('Turn on')).toBeChecked()
  await expect(page.getByLabel('Provider to use')).toHaveValue('anthropic')
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByRole('status')).toHaveText('Settings saved.')
  await page.reload()
  await expect(anthropic.getByLabel('Turn on')).toBeChecked()
  await expect(page.locator('body')).not.toContainText('sk-ant-e2e')

  await page.getByRole('link', { name: 'Books', exact: true }).click()
  await page.getByLabel('Choose PDF files').setInputFiles(pdf('Odd Book.pdf', 'needs-ai'))
  const row = page.locator('.book', { hasText: 'Odd Book.pdf' })
  await expect(row).toContainText('Needs AI', { timeout: 10000 })
  await row.getByRole('button', { name: 'Extract with AI' }).click()
  await expect(page.getByRole('dialog')).toContainText('This sends the book’s text to Anthropic. Continue?')
  await expect(page.getByRole('dialog')).toContainText('4 parts')
  await page.getByRole('button', { name: 'Send to Anthropic' }).click()
  await expect(row).toContainText('Ready to review', { timeout: 10000 })
  await row.getByRole('link', { name: 'Review' }).click()

  const lucky = page.locator('tr', { hasText: 'Lucky Charm' })
  await expect(page.locator('tr', { hasText: 'Tin Spoon' })).toContainText('no price given')
  await lucky.getByRole('button', { name: 'Edit' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Lucky Charms')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.locator('tr', { hasText: 'Lucky Charms' })).toContainText('Edited')
  await page.locator('tr', { hasText: 'Tin Spoon' }).getByRole('button', { name: 'Drop' }).click()
  await expect(page.locator('tr', { hasText: 'Tin Spoon' })).toContainText('Dropped')

  await page.getByLabel('Source id').fill('LUCKY')
  await page.getByLabel('Book title').fill('The Lucky Book')
  await page.getByRole('button', { name: 'Add accepted entries' }).click()
  await expect(page.locator('.book', { hasText: 'The Lucky Book' })).toContainText('Imported', { timeout: 10000 })

  const picked = await pickAmp(page, 'Lucky Charms')
  await expect(picked).toHaveCount(1)
  await expect(picked.locator('.src')).toHaveText('LUCKY p.3')
})

// the stub worker lists a few made-up model ids for a saved key, and refuses a key containing "bad"
test('load a provider’s models, pick one, save; a failed list keeps the text box', async ({ page }) => {
  await page.goto('/#/books/ai')
  const gemini = page.locator('fieldset', { hasText: 'Gemini' })
  await expect(gemini.getByRole('button', { name: 'Load models' })).toBeDisabled()
  await gemini.getByLabel('API key').fill('AIza-e2e-not-a-real-key')
  await gemini.getByRole('button', { name: 'Save key' }).click()
  await gemini.getByRole('button', { name: 'Load models' }).click()
  const model = gemini.getByRole('combobox', { name: 'Model' })
  await expect(model.locator('option')).toHaveText(['Default: gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-pro', 'Type a model name instead'])
  await model.selectOption('Type a model name instead')
  await expect(gemini.getByRole('textbox', { name: 'Model' })).toBeVisible()
  await gemini.getByRole('button', { name: 'Load models' }).click()
  await model.selectOption('gemini-2.5-flash')
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByRole('status')).toHaveText('Settings saved.')
  await page.reload()
  await expect(gemini.getByRole('textbox', { name: 'Model' })).toHaveValue('gemini-2.5-flash')

  await page.setViewportSize({ width: 375, height: 800 })
  const openai = page.locator('fieldset', { hasText: 'OpenAI' })
  await openai.getByLabel('API key').fill('sk-bad-e2e-key')
  await openai.getByRole('button', { name: 'Save key' }).click()
  await openai.getByRole('button', { name: 'Load models' }).click()
  await expect(openai.getByRole('alert')).toHaveText('Couldn’t load the model list: stub.example answered HTTP 401: invalid key [key]. You can type a model name.')
  await expect(openai.getByRole('textbox', { name: 'Model' })).toBeEditable()
  await expect(page.locator('body')).not.toContainText('sk-bad-e2e')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
})
