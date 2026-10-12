// Accessories on their host (src/sr6/engine/categories.ts, budgets.ts hostBonus), on the made-up SR6 fixture: a
// Torqlimb accessory goes on the Torqlimb arm (the picker marks another host's), its bonus lands on the arm only (the
// line, the sheet's line and Review's derived values show the arm's own Strength; the runner's stays).
import { test, expect, type Page } from '@playwright/test'
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { usersFile } from '../server/auth.mjs'
import { createServer } from '../server/server.mjs'

const PW = 'pat-password-1'
let server: ReturnType<typeof createServer>,
  base = ''

test.use({ baseURL: async ({}, use) => use(base), storageState: { cookies: [], origins: [] }, viewport: { width: 1400, height: 900 } })

test.beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ca2-sr6-acc-e2e-'))
  cpSync('tests/fixtures/mini/custom', join(dir, 'custom'), { recursive: true })
  cpSync('tests/fixtures/sr6/custom', join(dir, 'custom', 'sr6'), { recursive: true })
  mkdirSync(join(dir, 'library', '.config'), { recursive: true })
  writeFileSync(join(dir, 'library', '.config', 'users.xml'), await usersFile([{ username: 'pat', password: PW, role: 'player', name: 'Pat Player' }]))
  server = createServer({ staticDir: 'dist', charDir: join(dir, 'characters'), customDir: join(dir, 'custom'), libraryDir: join(dir, 'library') })
  await new Promise<void>((ok, fail) => server.once('error', fail).listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/`
})
test.afterAll(() => {
  server.stopJobs()
  server.close()
})

async function signIn(page: Page) {
  await page.goto('/#/sr6')
  await page.getByLabel('Username').fill('pat')
  await page.getByLabel('Password', { exact: true }).fill(PW)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByLabel('Username')).toHaveCount(0)
}

test('a cyberlimb accessory goes on the arm, and its bonus is the arm’s only', async ({ page }) => {
  await signIn(page)
  await page.getByRole('button', { name: 'New runner' }).click()
  const nr = page.getByRole('dialog', { name: 'New runner' })
  await nr.getByLabel('Street name').fill('Chrome Arm')
  await nr.getByRole('button', { name: 'Create runner' }).click()
  await expect(page).toHaveURL(/#\/sr6\/c\/[^/]+\/concept$/)
  const tabs = page.getByRole('navigation', { name: 'Character sections' }).getByRole('link')
  const work = page.locator('main.work'),
    dlg = page.getByRole('dialog')

  // Review before: the runner's Strength
  await tabs.filter({ hasText: 'Review' }).click()
  const strength = page.locator('.sr6-derived div', { hasText: /^Strength/ }).locator('dd')
  const str = Number(await strength.innerText())

  // the arm, shown with its category
  await tabs.filter({ hasText: 'Augmentations' }).click()
  await work.getByRole('button', { name: 'Add an augmentation…' }).click()
  await dlg.getByPlaceholder('Search').fill('torqlimb')
  await dlg.getByText('Torqlimb: Limb (synthetic)').click()
  if (await dlg.getByRole('button', { name: 'Add', exact: true }).count()) await dlg.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(dlg).toHaveCount(0)
  await expect(work.getByText('Torqlimb: Limb (synthetic)').first()).toBeVisible()

  // its accessories: the Torqlimb's, and the eyeware's marked (it may still be fitted: a Review error)
  await work.getByRole('button', { name: 'Add an accessory to Torqlimb: Limb (synthetic)' }).click()
  await expect(dlg).toContainText('Torqlimb accessory: Plating 1')
  await expect(dlg.locator('li', { hasText: 'Glare filter' })).toContainText('for Eyeware, not this')
  // (a rated accessory is one entry per rating: the level is picked outright)
  await dlg.getByText('Torqlimb accessory: Plating 2', { exact: true }).click()
  await expect(dlg).toHaveCount(0)

  // a Strength bonus on the plating: the arm's own Strength
  await work.getByRole('button', { name: 'Add a bonus to Torqlimb accessory: Plating 2 on Torqlimb: Limb (synthetic)' }).click()
  await dlg.getByLabel('Bonus to').selectOption({ label: 'Strength' })
  await dlg.getByLabel('Value').fill('2')
  await dlg.getByRole('button', { name: 'Add bonus' }).click()
  await expect(dlg).toHaveCount(0)
  await expect(work.getByLabel('Torqlimb: Limb (synthetic): its own values')).toHaveText(`This item: STR ${str + 2}`)

  // Review: the runner's Strength unchanged; the arm's listed with its own
  await tabs.filter({ hasText: 'Review' }).click()
  await expect(strength).toHaveText(String(str))
  await expect(page.locator('.sr6-derived div', { hasText: 'Torqlimb: Limb (synthetic)' }).locator('dd')).toHaveText(`STR ${str + 2}`)

  // the sheet: the arm's line with its accessory and its own Strength
  await tabs.filter({ hasText: 'Print' }).click()
  await expect(page.getByText(`Torqlimb accessory: Plating 2 (STR ${str + 2})`).first()).toBeVisible()
})
