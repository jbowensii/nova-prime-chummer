// The next release's Game data and attribute cards, both games, on a server of their own with the made-up books of both
// games (tests/fixtures/mini/custom, tests/fixtures/sr6/custom): one layout for Game data (the kinds down the left with
// their counts, the categories across the top, the entries; the book a filter; the sources and the Foundry export
// folded), the Foundry export's link in row 1's right-hand group for those who may export, and an attribute's card on
// hover, focus or tap. Ada the admin, Pat a player. Screenshots to .extract/screenshots/gamedata.
import { test, expect, type Page } from '@playwright/test'
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { usersFile } from '../server/auth.mjs'
import { createServer } from '../server/server.mjs'
import { anarchyState } from './session'

const PW = { ada: 'ada-password-1', pat: 'pat-password-1' }
const SHOTS = '.extract/screenshots/gamedata'
const PHONE = { width: 390, height: 844 }, DESK = { width: 1400, height: 900 }
let server: ReturnType<typeof createServer>, base = ''

test.describe.configure({ mode: 'serial' })
test.use({ baseURL: async ({}, use) => use(base), storageState: async ({}, use) => use(anarchyState(base)), viewport: DESK })

test.beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ca2-gamedata-e2e-'))
  cpSync('tests/fixtures/mini/custom', join(dir, 'custom'), { recursive: true })
  cpSync('tests/fixtures/sr6/custom', join(dir, 'custom', 'sr6'), { recursive: true })
  mkdirSync(join(dir, 'library', '.config'), { recursive: true })
  writeFileSync(join(dir, 'library', '.config', 'users.xml'), await usersFile([{ username: 'ada', password: PW.ada, name: 'Ada Admin' },
    { username: 'pat', password: PW.pat, role: 'player', name: 'Pat Player' }]))
  server = createServer({ staticDir: 'dist', charDir: join(dir, 'characters'), customDir: join(dir, 'custom'), libraryDir: join(dir, 'library') })
  await new Promise<void>((ok, fail) => server.once('error', fail).listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/`
  mkdirSync(SHOTS, { recursive: true })
})
test.afterAll(() => { server.stopJobs(); server.close() })

async function signIn(page: Page, path: string, who: keyof typeof PW = 'ada') {
  await page.goto(path)
  await page.getByLabel('Username').fill(who)
  await page.getByLabel('Password', { exact: true }).fill(PW[who])
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByLabel('Username')).toHaveCount(0)
}
const fits = async (page: Page, what: string) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${what} scrolls sideways`).toBeLessThanOrEqual(0)
/** the per-browser theme (Settings → Theme), then the page again */
async function theme(page: Page, t: 'light' | 'dark') {
  await page.evaluate(t => localStorage.setItem('ca2.settings.v1', JSON.stringify({ theme: t })), t)
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', t)
  await expect(page.getByRole('group', { name: 'Kind' }).getByRole('button').nth(1)).toBeVisible()
}
const counted = (name: string) => new RegExp(`^${name} [0-9]+$`)
const kinds = (page: Page) => page.getByRole('group', { name: 'Kind' })
const categories = (page: Page) => page.getByRole('group', { name: 'Category' })
const rows = (page: Page) => page.locator('table.browse tbody tr')
const foundryLink = (page: Page) => page.locator('.menubar .tools').getByRole('link', { name: 'Export book data for Foundry' })

for (const [game, path, kind, category, book, main, other, otherMain] of [
  ['Anarchy', '/#/data', 'Weapons', 'Handguns', 'Test Book Two', 'Amps', '/#/sr6/data', 'Qualities'],
  ['Shadowrun 6', '/#/sr6/data', 'Augmentations', 'Cyberware: eyeware', 'Shadowrun, Sixth World Core Rulebook', 'Qualities', '/#/data', 'Amps'],
] as const) {
  const slug = game === 'Anarchy' ? 'ca2' : 'sr6'
  test(`${game} Game data: the kinds with counts, categories across the top, the book a filter, the sources folded`, async ({ page }) => {
    await signIn(page, path)
    await expect(page.getByRole('heading', { name: 'Game data', level: 1 })).toBeVisible()
    // the kinds down the left, each with its count; one kind's entries at a time, its categories as chips
    await expect(kinds(page).getByRole('button', { name: counted(kind) })).toBeVisible()
    await kinds(page).getByRole('button', { name: counted(kind) }).click()
    await expect(categories(page).getByRole('button', { name: /^All [0-9]+$/ })).toHaveAttribute('aria-pressed', 'true')
    const all = await rows(page).count()
    await categories(page).getByRole('button', { name: counted(category) }).click()
    expect(await rows(page).count()).toBeLessThanOrEqual(all)
    await expect(rows(page).first()).toBeVisible()
    await categories(page).getByRole('button', { name: /^All [0-9]+$/ }).click()
    // the book: a filter, never the list itself
    const pick = page.getByLabel('Book', { exact: true })
    await expect(pick.locator('option').first()).toHaveText('All books')
    await pick.selectOption({ label: book })
    await expect(kinds(page)).toBeVisible()
    await pick.selectOption({ label: 'All books' })
    // the sources and the export, folded
    const sources = page.locator('details.fold', { has: page.getByRole('heading', { name: 'Sources' }) })
    await expect(sources).not.toHaveAttribute('open')
    await expect(sources.locator('summary')).toContainText(/\d+ books?/)
    await expect(page.getByRole('region', { name: 'Export book data for Foundry' })).toHaveCount(0)
    await sources.locator('summary').click()
    await expect(sources.locator('table')).toBeVisible()
    await sources.locator('summary').click()

    for (const t of ['light', 'dark'] as const) {
      await theme(page, t)
      await page.screenshot({ path: `${SHOTS}/${slug}-gamedata-desktop-${t}.png`, fullPage: true })
      await page.setViewportSize(PHONE)
      await fits(page, `${game} Game data (${t}, phone)`)
      // on a phone the kinds are tabs across the top
      const [a, b] = await kinds(page).getByRole('button').evaluateAll(bs => bs.slice(0, 2).map(x => x.getBoundingClientRect().top))
      expect(Math.abs(a - b)).toBeLessThanOrEqual(1)
      // the 16px gutter
      expect(await page.locator('main.gamedata').evaluate(m => getComputedStyle(m).paddingLeft)).toBe('16px')
      await page.screenshot({ path: `${SHOTS}/${slug}-gamedata-phone-${t}.png`, fullPage: true })
      await page.setViewportSize(DESK)
    }
    await theme(page, 'light')
  })

  test(`${game} Game data opens on its main kind (${main}), then on the kind last looked at, per game`, async ({ page }) => {
    await signIn(page, path)
    const pressed = kinds(page).locator('button[aria-pressed="true"]')
    await expect(pressed).toHaveText(counted(main))
    await kinds(page).getByRole('button', { name: counted(kind) }).click()
    await page.reload()
    await expect(pressed).toHaveText(counted(kind))
    // the other game keeps its own
    await page.goto(other)
    await expect(pressed).toHaveText(counted(otherMain))
    await page.goto(path)
    await page.reload()
    await expect(pressed).toHaveText(counted(kind))
  })

  test(`${game} Game data: the Foundry export's link in row 1 opens the export; a player has neither`, async ({ page, browser }) => {
    await signIn(page, path)
    const link = foundryLink(page)
    await expect(link).toBeVisible()
    // beside the game switch, Settings and the account
    await expect(page.locator('.menubar .tools').getByRole('link', { name: /^Switch to/ })).toBeVisible()
    await link.click()
    const panel = page.getByRole('region', { name: 'Export book data for Foundry' })
    await expect(panel).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Download book data' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Export book data for Foundry' })).toBeInViewport()
    await page.screenshot({ path: `${SHOTS}/${slug}-foundry-link.png` })
    // its address opens it too
    await page.goto(`${path}/foundry`)
    await page.reload()
    await expect(page.getByRole('region', { name: 'Export book data for Foundry' })).toBeVisible()

    // the link is in the header of every page (here the runner list), and Game data has its own button at the top
    await page.goto(game === 'Anarchy' ? '/#/' : '/#/sr6')
    await expect(page.getByRole('heading', { name: 'Your runners', level: 1 })).toBeVisible()
    await foundryLink(page).click()
    await expect(page).toHaveURL(/\/data\/foundry$/)
    await expect(page.getByRole('region', { name: 'Export book data for Foundry' })).toBeVisible()
    await page.goto(path)
    await page.reload()
    await expect(page.getByRole('region', { name: 'Export book data for Foundry' })).toBeHidden()
    await page.getByRole('link', { name: 'Export to Foundry VTT' }).click()
    await expect(page.getByRole('region', { name: 'Export book data for Foundry' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Export book data for Foundry' })).toBeInViewport()
    await page.screenshot({ path: `${SHOTS}/${slug}-foundry-button.png` })

    const ctx = await browser.newContext({ baseURL: base, storageState: anarchyState(base), viewport: DESK })
    const player = await ctx.newPage()
    await signIn(player, path, 'pat')
    await expect(player.getByRole('heading', { name: 'Game data', level: 1 })).toBeVisible()
    await expect(foundryLink(player)).toHaveCount(0)
    await expect(player.locator('#foundry-export')).toHaveCount(0)
    await expect(player.getByRole('link', { name: 'Export to Foundry VTT' })).toHaveCount(0)
    await ctx.close()
  })
}

test('Shadowrun 6: an attribute shows its card on hover, focus (Escape closes) and tap', async ({ page }) => {
  await signIn(page, '/#/sr6')
  await page.getByRole('button', { name: 'New runner' }).click()
  const nr = page.getByRole('dialog', { name: 'New runner' })
  await nr.getByLabel('Street name').fill('Attribute Check')
  await nr.getByRole('button', { name: 'Create runner' }).click()
  await expect(page).toHaveURL(/#\/sr6\/c\/[^/]+\/concept$/)
  await page.getByRole('navigation', { name: 'Character sections' }).getByRole('link', { name: 'Attributes' }).click()
  const card = page.getByRole('tooltip'), body = page.locator('main.work .entry-ref', { hasText: 'Body' }).first()
  await body.hover()
  await expect(card).toContainText('Body')
  await expect(card).toContainText('Attribute')
  await expect(card).toContainText(/natural \d+ · augmented \d+/)
  await expect(card).toContainText('CRB p.38')
  await page.screenshot({ path: `${SHOTS}/sr6-attribute-card.png` })
  await page.mouse.move(0, 0)
  await expect(card).toHaveCount(0)
  await body.focus()
  await expect(card).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(card).toHaveCount(0)
})

test('Anarchy: an attribute shows its card on hover and focus (Escape closes)', async ({ page }) => {
  await signIn(page, '/#/')
  await page.getByRole('button', { name: 'New runner' }).click()
  await page.getByRole('button', { name: 'Create runner' }).click()
  await page.getByLabel('Street name').fill('Attribute Check')
  await page.getByRole('link', { name: 'Attributes', exact: true }).click()
  const card = page.getByRole('tooltip'), finesse = page.locator('main .entry-ref', { hasText: 'Finesse' }).first()
  await finesse.hover()
  await expect(card).toContainText('Finesse')
  await expect(card).toContainText(/natural \d+ · augmented \d+ · max \d+/)
  await expect(card).toContainText('CRB p.7')
  await page.screenshot({ path: `${SHOTS}/ca2-attribute-card.png` })
  await page.mouse.move(0, 0)
  await expect(card).toHaveCount(0)
  await finesse.focus()
  await expect(card).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(card).toHaveCount(0)
})

test.describe('touch', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 400, height: 860 } })
  test('Shadowrun 6: a tap opens an attribute’s card and a second tap closes it', async ({ page }) => {
    await signIn(page, '/#/sr6')
    await page.getByRole('link', { name: /Attribute Check/ }).first().click()
    await page.goto(page.url().replace(/\/[a-z]+$/, '/attributes'))
    const card = page.getByRole('tooltip'), agility = page.locator('main.work .entry-ref', { hasText: 'Agility' }).first()
    await agility.tap()
    await expect(card).toContainText('Agility')
    await page.screenshot({ path: `${SHOTS}/sr6-attribute-card-phone.png` })
    await agility.tap()
    await expect(card).toHaveCount(0)
  })
})
