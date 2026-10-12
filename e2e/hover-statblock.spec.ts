// A catalog entry's card where the editor names it (src/ui/EntryHover.tsx), both games: hover shows it, focus shows it and
// Escape closes it, a tap toggles it; a picker's item shows its card on hover and while it has focus. Shadowrun 6 on the
// made-up SR6 fixture (its own server, as sr6-accessories.spec.ts); Anarchy on the default made-up core data.
import { test, expect, type Page } from '@playwright/test'
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { usersFile } from '../server/auth.mjs'
import { createServer } from '../server/server.mjs'

const PW = 'pat-password-1'
let server: ReturnType<typeof createServer>,
  base = ''

test.describe('Shadowrun 6', () => {
  test.use({ baseURL: async ({}, use) => use(base), storageState: { cookies: [], origins: [] }, viewport: { width: 1400, height: 900 } })

  test.beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ca2-hover-e2e-'))
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

  async function runner(page: Page) {
    await page.goto('/#/sr6')
    await page.getByLabel('Username').fill('pat')
    await page.getByLabel('Password', { exact: true }).fill(PW)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByLabel('Username')).toHaveCount(0)
    await page.getByRole('button', { name: 'New runner' }).click()
    const nr = page.getByRole('dialog', { name: 'New runner' })
    await nr.getByLabel('Street name').fill('Hover Check')
    await nr.getByRole('button', { name: 'Create runner' }).click()
    await expect(page).toHaveURL(/#\/sr6\/c\/[^/]+\/concept$/)
    return page.getByRole('navigation', { name: 'Character sections' }).getByRole('link')
  }

  test('a quality and a line of ware show their card on hover, on focus (Escape closes) and in the picker', async ({ page }) => {
    const tabs = await runner(page),
      work = page.locator('main.work'),
      dlg = page.getByRole('dialog'),
      card = page.getByRole('tooltip')

    // the picker: hovering an item shows its card, as does the item having focus
    await tabs.filter({ hasText: 'Qualities' }).click()
    await work.getByRole('button', { name: 'Add a positive quality…' }).click()
    const item = dlg.getByRole('option').filter({ hasText: 'Lucky Streak 1' }) // (one entry per level, levels.ts)
    await item.locator('b').hover()
    await expect(card).toContainText('CRB p.70')
    await expect(card).toContainText('karma 4')
    await page.mouse.move(0, 0)
    await expect(card).toHaveCount(0)
    await item.focus()
    await expect(card).toContainText('Lucky Streak')
    await item.click()
    await expect(dlg).toHaveCount(0)

    // the taken quality: hover, then focus and Escape
    const name = work.locator('.entry-ref', { hasText: 'Lucky Streak' })
    await name.hover()
    await expect(card).toContainText('level 1') // (one entry per level: its family and level, levels.ts)
    await page.mouse.move(0, 0)
    await expect(card).toHaveCount(0)
    await name.focus()
    await expect(card).toBeVisible()
    await expect(name).toHaveAttribute('aria-describedby', (await card.getAttribute('id'))!)
    await page.keyboard.press('Escape')
    await expect(card).toHaveCount(0)

    // a line of ware: its category, source and page
    await tabs.filter({ hasText: 'Augmentations' }).click()
    await work.getByRole('button', { name: 'Add an augmentation…' }).click()
    await dlg.getByPlaceholder('Search').fill('torqlimb')
    await dlg.getByText('Torqlimb: Limb (synthetic)').click()
    if (await dlg.getByRole('button', { name: 'Add', exact: true }).count()) await dlg.getByRole('button', { name: 'Add', exact: true }).click()
    await work.locator('.entry-ref', { hasText: 'Torqlimb: Limb (synthetic)' }).hover()
    await expect(card).toContainText('CRB p.288')
    await expect(card).toContainText('capacity 6')
  })

  test.describe('touch', () => {
    test.use({ hasTouch: true, isMobile: true, viewport: { width: 400, height: 860 } })
    test('a tap opens the card and a second tap closes it', async ({ page }) => {
      await runner(page)
      const work = page.locator('main.work'),
        card = page.getByRole('tooltip')
      await page.goto(page.url().replace(/\/concept$/, '/skills'))
      const skill = work.locator('.entry-ref').first()
      await skill.tap()
      await expect(card).toBeVisible()
      await skill.tap()
      await expect(card).toHaveCount(0)
    })
  })
})

test.describe('Anarchy', () => {
  test('a skill and a line of gear show their card on hover and on focus; Escape closes it', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'New runner' }).click()
    await page.getByRole('button', { name: 'Create runner' }).click()
    await page.getByLabel('Street name').fill('Hover Check')
    const card = page.getByRole('tooltip')

    await page.getByRole('link', { name: 'Skills', exact: true }).click()
    const athletics = page.locator('.entry-ref', { hasText: 'Athletics' }).first()
    await athletics.hover()
    await expect(card).toContainText('Athletics')
    await expect(card).toContainText(/p\.\d+/)
    await page.mouse.move(0, 0)
    await expect(card).toHaveCount(0)
    await athletics.focus()
    await expect(card).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(card).toHaveCount(0)

    await page.getByRole('link', { name: 'Gear & spells' }).click()
    await page.getByRole('button', { name: 'Add from the book' }).first().click()
    await page.getByRole('option').filter({ hasText: 'Vest' }).click()
    const vest = page.locator('main .entry-ref', { hasText: 'Vest' }).first()
    await vest.hover()
    await expect(card).toContainText('Vest')
  })
})
