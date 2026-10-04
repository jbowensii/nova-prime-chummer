import { test, expect, type Page } from '@playwright/test'
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { usersFile } from '../server/auth.mjs'
import { createServer } from '../server/server.mjs'
import { anarchyState } from './session'

// 0.9.1, the owner's three requests, both games: the header's two rows (row 1 the main menu, the same on every page of a
// game; row 2 the page's own actions, only when it has any); Game data and Rules by book and by category, with a search
// across everything; the rules text in paragraphs with bold and italic. A server of its own with the made-up books of both
// games (tests/fixtures/mini/custom, tests/fixtures/sr6/custom). Ada the admin. Screenshots to .extract/screenshots/0.9.1.
const PW = { ada: 'ada-password-1' }
const SHOTS = '.extract/screenshots/0.9.1'
const PHONE = { width: 390, height: 844 }, DESK = { width: 1400, height: 900 }
let server: ReturnType<typeof createServer>, base = '', dir = ''

test.describe.configure({ mode: 'serial' })
test.use({ baseURL: async ({}, use) => use(base), storageState: async ({}, use) => use(anarchyState(base)) })

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'ca2-v091-e2e-'))
  const config = join(dir, 'library', '.config')
  cpSync('tests/fixtures/mini/custom', join(dir, 'custom'), { recursive: true })
  cpSync('tests/fixtures/sr6/custom', join(dir, 'custom', 'sr6'), { recursive: true })
  mkdirSync(config, { recursive: true })
  writeFileSync(join(config, 'users.xml'), await usersFile([{ username: 'ada', password: PW.ada, name: 'Ada Admin' }]))
  server = createServer({ staticDir: 'dist', charDir: join(dir, 'characters'), customDir: join(dir, 'custom'), libraryDir: join(dir, 'library') })
  await new Promise<void>((ok, fail) => server.once('error', fail).listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/`
  mkdirSync(SHOTS, { recursive: true })
})
test.afterAll(() => server.close())

async function signIn(page: Page, path: string) {
  await page.goto(path)
  await page.getByLabel('Username').fill('ada')
  await page.getByLabel('Password', { exact: true }).fill(PW.ada)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByLabel('Username')).toHaveCount(0)
}
const fits = async (page: Page, what: string) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${what} scrolls sideways`).toBeLessThanOrEqual(0)
const mainMenu = (page: Page) => page.getByRole('navigation', { name: 'Main menu' })
const menuLabels = (page: Page) => mainMenu(page).getByRole('link').evaluateAll(as => as.map(a => a.getAttribute('aria-label')))
const actions = (page: Page) => page.getByRole('group', { name: 'Page actions' })
const MENU = ['Your runners', 'NPCs & Critters', 'Compendiums', 'Campaigns', 'Books', 'Rules', 'Game data', 'Table setup']

/** Row 1 then (when `acts`) row 2 under it, from the left; the game switch, Settings and the account in row 1. */
async function rows(page: Page, what: string, sr6: boolean, acts: string[] | null) {
  await expect(mainMenu(page)).toBeVisible()
  expect(await menuLabels(page), what).toEqual(MENU)
  const row1 = page.locator('.menubar')
  await expect(row1.getByRole('link', { name: sr6 ? 'Switch to Shadowrun Anarchy' : 'Switch to Shadowrun 6' })).toBeVisible()
  if (sr6) await expect(row1.getByRole('button', { name: 'Ask the rules' })).toHaveCount(0) // (Anarchy's: once the admin sets it up)
  await expect(row1.getByRole('button', { name: 'Settings' })).toBeVisible()
  await expect(row1.locator('.account > button')).toBeVisible()
  if (!acts) return expect(actions(page), `${what}: no actions row`).toHaveCount(0)
  for (const a of acts) await expect(actions(page).getByRole('button', { name: a, exact: true }).or(actions(page).getByRole('link', { name: a, exact: true })), `${what}: ${a}`).toBeVisible()
  await expect(mainMenu(page).getByRole('link', { name: acts[0] })).toHaveCount(0) // not in row 1
  const r1 = (await row1.boundingBox())!, r2 = (await actions(page).boundingBox())!
  expect(r2.y, `${what}: row 2 under row 1`).toBeGreaterThanOrEqual(r1.y + r1.height - 1)
  expect(Math.abs(r2.x - r1.x), `${what}: both rows from the left`).toBeLessThanOrEqual(1)
}

const ANARCHY: [string, string, string[] | null][] = [
  ['/#/', 'Your runners', ['New runner', 'Import file', 'Load example characters']],
  ['/#/npcs', 'NPCs & Critters', ['New NPC', 'Import file', 'Load book NPCs']],
  ['/#/compendiums', 'Compendiums', ['New compendium']],
  ['/#/rules', 'Rules', ['Add a rule']],
  ['/#/data', 'Game data', null],
  ['/#/table', 'Table setup', null],
]
const SR6: [string, string, string[] | null][] = [
  ['/#/sr6', 'Your runners', ['New runner', 'Import file']],
  ['/#/sr6/npcs', 'NPCs & Critters', ['New NPC', 'Load book NPCs']],
  ['/#/sr6/rules', 'Rules', null],
  ['/#/sr6/data', 'Game data', null],
  ['/#/sr6/table', 'Table setup', null],
]

test('the header: row 1 the main menu on every page of a game, row 2 the page’s own actions only when it has any', async ({ page }) => {
  await signIn(page, '/#/')
  for (const [game, pages] of [['ca2', ANARCHY], ['sr6', SR6]] as const) {
    for (const [path, current, acts] of pages) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(mainMenu(page).getByRole('link', { name: current })).toHaveAttribute('aria-current', 'page')
      await rows(page, path, game === 'sr6', acts)
      const name = `header-${game}-${path.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'runners'}`
      await page.mouse.move(0, 0)
      await page.screenshot({ path: `${SHOTS}/${name}-desktop.png`, clip: { x: 0, y: 0, width: DESK.width, height: 300 } })
      await page.setViewportSize(PHONE)
      await fits(page, path)
      await page.screenshot({ path: `${SHOTS}/${name}-phone.png`, clip: { x: 0, y: 0, ...PHONE, height: 520 } })
      await page.setViewportSize(DESK)
    }
  }

  // the tooltip: above the icon
  await page.goto('/#/')
  const npcs = mainMenu(page).getByRole('link', { name: 'NPCs & Critters' })
  await npcs.hover()
  const tip = page.getByRole('tooltip')
  await expect(tip).toHaveText('NPCs & Critters')
  expect((await tip.boundingBox())!.y + (await tip.boundingBox())!.height).toBeLessThanOrEqual((await npcs.boundingBox())!.y)
  await page.mouse.move(0, 0)

  // a runner's editor: Save, Undo, Redo and the exports in row 2; then its print page: Print, Sheet type in row 2
  await page.getByRole('button', { name: 'New runner' }).click()
  await page.getByRole('button', { name: 'Create runner' }).click()
  await page.getByLabel('Street name').fill('Header Check')
  await rows(page, 'editor', false, ['Save', 'Save and close', 'Undo', 'Redo', 'Export file', 'Export for Foundry'])
  await page.screenshot({ path: `${SHOTS}/header-ca2-editor-desktop.png`, clip: { x: 0, y: 0, width: DESK.width, height: 300 } })
  await page.setViewportSize(PHONE)
  await fits(page, 'editor')
  await page.screenshot({ path: `${SHOTS}/header-ca2-editor-phone.png`, clip: { x: 0, y: 0, ...PHONE, height: 520 } })
  await page.setViewportSize(DESK)
  await page.getByRole('navigation', { name: 'Character sections' }).getByRole('link', { name: 'Print' }).click()
  await rows(page, 'print', false, ['Back to editing', 'Print or save as PDF'])
  await expect(actions(page).getByRole('combobox', { name: 'Sheet type' })).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/header-ca2-print-desktop.png`, clip: { x: 0, y: 0, width: DESK.width, height: 300 } })
  await page.setViewportSize(PHONE)
  await fits(page, 'print')
  await page.screenshot({ path: `${SHOTS}/header-ca2-print-phone.png`, clip: { x: 0, y: 0, ...PHONE, height: 520 } })
  await page.setViewportSize(DESK)
  await page.emulateMedia({ media: 'print' })
  await expect(mainMenu(page)).toBeHidden() // never on paper
  await page.emulateMedia({ media: 'screen' })
})
