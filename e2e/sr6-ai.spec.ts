// Each game's own AI (server/books.mjs ai(), src/features/ai-assist/AskRules.tsx, AiSettings.tsx), on a server of its own with the stub
// worker and the made-up SR6 fixture: SR6's AI settings at #/sr6/books/ai, then SR6's Ask the rules in the header and its
// AI search on Rules and Game data; Anarchy's AI stays unset meanwhile (no Ask there, no key on its settings page).
import { test, expect, type Page } from '@playwright/test'
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { usersFile } from '../server/auth.mjs'
import { createServer } from '../server/server.mjs'

const PW = 'ada-password-1'
let server: ReturnType<typeof createServer>,
  base = ''

test.use({ baseURL: async ({}, use) => use(base), storageState: { cookies: [], origins: [] }, viewport: { width: 1400, height: 900 } })

test.beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ca2-sr6-ai-e2e-'))
  cpSync('tests/fixtures/mini/custom', join(dir, 'custom'), { recursive: true })
  cpSync('tests/fixtures/sr6/custom', join(dir, 'custom', 'sr6'), { recursive: true })
  mkdirSync(join(dir, 'library', '.config'), { recursive: true })
  writeFileSync(join(dir, 'library', '.config', 'users.xml'), await usersFile([{ username: 'ada', password: PW, role: 'admin', name: 'Ada Admin' }]))
  server = createServer({
    staticDir: 'dist',
    charDir: join(dir, 'characters'),
    customDir: join(dir, 'custom'),
    libraryDir: join(dir, 'library'),
    python: [process.execPath, 'tests/fixtures/stub-worker.mjs'],
  })
  await new Promise<void>((ok, fail) => server.once('error', fail).listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/`
})
test.afterAll(() => {
  server.stopJobs()
  server.close()
})

async function signIn(page: Page) {
  await page.goto('/#/sr6/books')
  await page.getByLabel('Username').fill('ada')
  await page.getByLabel('Password', { exact: true }).fill(PW)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByLabel('Username')).toHaveCount(0)
}

test('SR6’s own AI: its settings, Ask the rules, and the AI search on Rules and Game data; Anarchy’s untouched', async ({ page }) => {
  await signIn(page)
  await expect(page.getByRole('button', { name: 'Ask the rules' })).toHaveCount(0) // not set up yet
  await page.getByRole('link', { name: 'AI settings' }).click()
  await expect(page).toHaveURL(/#\/sr6\/books\/ai$/)
  await expect(page.locator('main')).toContainText('Shadowrun 6’s own AI answers Ask the rules')
  const anthropic = page.locator('fieldset', { hasText: 'Anthropic' })
  await expect(anthropic).toContainText('No key saved')
  await anthropic.getByLabel('Turn on').check()
  await page.getByLabel('Provider to use').selectOption('anthropic')
  await anthropic.getByLabel('API key').fill('sk-ant-e2e-sr6-not-real')
  await anthropic.getByRole('button', { name: 'Save key' }).click()
  await expect(anthropic).toContainText('Key saved')
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByRole('status')).toHaveText('Settings saved.')

  // SR6's Ask the rules, in the header
  await page.reload()
  await page.getByRole('button', { name: 'Ask the rules' }).click()
  const drawer = page.getByRole('dialog', { name: 'Ask the rules' })
  await expect(drawer.getByRole('textbox')).toHaveAttribute('placeholder', 'Ask the rules, e.g. how does Edge work?')
  await drawer.getByRole('textbox').fill('What happens when I vault a puddle?')
  await drawer.getByRole('textbox').press('Enter')
  await expect(drawer.getByText('Invented SR6 answer [ZZ p.61].')).toBeVisible()
  await drawer.getByRole('button', { name: 'Close' }).click()

  // the Rules page's AI search asks the rules only
  await page.getByRole('link', { name: 'Rules', exact: true }).click()
  const rules = page.getByRole('search', { name: 'Ask AI about the rules' })
  await rules.getByRole('textbox').fill('How do I vault a puddle?')
  await rules.getByRole('button', { name: 'Search' }).click()
  await expect(page.getByText('Invented SR6 answer (rules only) [ZZ p.61].')).toBeVisible()
  await expect(page.getByRole('list', { name: 'Found' })).toContainText('Puddle jumping ZZ p.61') // not an SR6 rule here: text only

  // Game data's: a find searches the catalog for it
  await page.getByRole('link', { name: 'Game data' }).click()
  const data = page.getByRole('search', { name: 'Ask AI to find entries' })
  await data.getByRole('textbox').fill('boots for a puddle')
  await data.getByRole('button', { name: 'Search' }).click()
  await expect(page.getByText('Invented SR6 answer [ZZ p.61].')).toBeVisible()
  await page.getByRole('list', { name: 'Found' }).getByRole('button', { name: 'Puddle jumping' }).click()
  await expect(page.getByLabel('Search the catalog')).toHaveValue('Puddle jumping')

  // Anarchy's AI is its own: still not set up
  await page.goto('/#/rules')
  await expect(page.getByRole('heading', { name: 'Rules', level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ask the rules' })).toHaveCount(0)
  await expect(page.getByRole('search', { name: 'Ask AI about the rules' })).toHaveCount(0)
  await page.goto('/#/books/ai')
  await expect(page.locator('main')).toContainText('These settings are Shadowrun Anarchy’s')
  await expect(page.locator('fieldset', { hasText: 'Anthropic' })).toContainText('No key saved')
  await expect(page.locator('body')).not.toContainText('sk-ant-e2e-sr6')
})
