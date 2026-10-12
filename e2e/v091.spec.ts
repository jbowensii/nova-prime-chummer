import { test, expect, type Page } from '@playwright/test'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
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
  // made-up rules text: one as the importer writes it now (paragraphs, bold, italic), one from an older import (the PDF's lines)
  const texts = join(dir, 'custom', 'sr6', 'texts', 'crb.xml')
  writeFileSync(texts, readFileSync(texts, 'utf8')
    .replace('Invented rule text about trouble.', 'Invented **trouble** rules, *made up* for this test, long enough to run past one narrow column of a book page.&#10;&#10;'
      + 'A second invented paragraph.&#10;- an invented list item&#10;- another')
    .replace('</sr6:data>', '  <text of="rules" id="crb.making-trouble-dice">An invented line&#10;that wraps in&#10;the old way.</text></sr6:data>'))
  const anarchyRules = join(dir, 'custom', 'imported', 'test', 'rules.xml')
  writeFileSync(anarchyRules, readFileSync(anarchyRules, 'utf8').replace('<text></text>', '<text>Invented quick-reference text for this test.</text>'))
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

const counted = (name: string) => new RegExp(`^${name} [0-9]+$`)
const kindButton = (page: Page, name: string) => page.getByRole('group', { name: 'Kind' }).getByRole('button', { name: counted(name) })
const category = (page: Page, name: string) => page.getByRole('group', { name: 'Category' }).getByRole('button', { name: counted(name) })
const browseRows = (page: Page) => page.locator('table.browse tbody tr')

test('Game data: a book, then a kind with its counts, its sub-categories, one kind at a time; a search across everything, by kind', async ({ page }) => {
  await signIn(page, '/#/sr6/data')
  await expect(page.getByRole('heading', { name: 'Game data', level: 1 })).toBeVisible()
  // the book first: all books, then each source that has entries
  const book = page.getByLabel('Book', { exact: true })
  await expect(book.locator('option')).toHaveText(['All books', 'Shadowrun, Sixth World Core Rulebook'])
  // the kinds with their counts; the first one with entries is open
  await expect(kindButton(page, 'Weapons')).toHaveAccessibleName('Weapons 2')
  await expect(kindButton(page, 'Gear')).toHaveAccessibleName('Gear 9')  // (a rated item is one entry per rating, levels.ts)
  await kindButton(page, 'Weapons').click()
  await expect(kindButton(page, 'Weapons')).toHaveAttribute('aria-pressed', 'true')
  await expect(browseRows(page)).toHaveCount(2)
  await expect(page.locator('table.browse')).not.toContainText('Glow Eyes') // one kind at a time
  // augmentations: cyberware or bioware, then the body area
  await kindButton(page, 'Augmentations').click()
  await expect(page.getByRole('group', { name: 'Category' }).getByRole('button')).toHaveText([/^All 12$/, /^Bioware: basic bioware 4$/, /^Cyberware: eyeware 3$/,
    /^Cyberware: Eyeware accessory 1$/, /^Cyberware: Torqlimb 1$/, /^Cyberware: Torqlimb accessory 3$/])
  await category(page, 'Cyberware: eyeware').click()
  await expect(browseRows(page)).toHaveCount(3)
  await expect(browseRows(page).first()).toContainText('Glow Eyes 1')
  await page.screenshot({ path: `${SHOTS}/data-sr6-categories-desktop.png`, fullPage: true })
  await page.setViewportSize(PHONE)
  await fits(page, 'SR6 Game data')
  // on a phone the kinds are tabs across the top
  const [w, a] = [await kindButton(page, 'Weapons').boundingBox(), await kindButton(page, 'Armor').boundingBox()]
  expect(Math.abs(w!.y - a!.y)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: `${SHOTS}/data-sr6-categories-phone.png`, fullPage: true })
  await page.setViewportSize(DESK)

  // the search looks across every kind; the results grouped by kind
  await page.getByLabel('Search the catalog').fill('zap')
  await expect(page.getByRole('group', { name: 'Kind' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Weapons' }).locator('tbody tr')).toHaveText([/Zap Gun/])
  await expect(page.getByRole('region', { name: 'Gear' }).locator('tbody tr')).toHaveCount(2)
  await expect(page.getByRole('region', { name: 'Augmentations' })).toHaveCount(0)
  await page.screenshot({ path: `${SHOTS}/data-sr6-search-desktop.png`, fullPage: true })
  await page.getByLabel('Search the catalog').fill('no such entry')
  await expect(page.getByText('Nothing matches “no such entry”.')).toBeVisible()

  // Anarchy: the same, its kinds; one book shows only its entries
  await page.goto('/#/data')
  await expect(page.getByRole('heading', { name: 'Game data', level: 1 })).toBeVisible()
  await expect(page.getByLabel('Book', { exact: true }).locator('option')).toContainText(['All books', 'Test Book One', 'Test Book Two'])
  await kindButton(page, 'Amps').click()
  await expect(page.locator('table.browse')).toContainText('Hawk Instinct')
  await expect(page.getByRole('group', { name: 'Category' })).toBeVisible() // amps by type
  await kindButton(page, 'Weapons').click()
  await expect(page.getByRole('group', { name: 'Category' })).toContainText('Handguns')
  await page.getByLabel('Book', { exact: true }).selectOption({ label: 'Test Book Two' })
  await kindButton(page, 'Amps').click()
  await expect(page.locator('table.browse')).toContainText('Keen eye')
  await expect(page.locator('table.browse')).not.toContainText('Hawk Instinct')
  await page.screenshot({ path: `${SHOTS}/data-ca2-categories-desktop.png`, fullPage: true })
  await page.setViewportSize(PHONE)
  await fits(page, 'Anarchy Game data')
  await page.screenshot({ path: `${SHOTS}/data-ca2-categories-phone.png`, fullPage: true })
  await page.setViewportSize(DESK)
})

test('Rules: a book, a chapter (or sheet) and a search, both games', async ({ page }) => {
  await signIn(page, '/#/sr6/rules')
  await expect(page.getByRole('heading', { name: 'Rules', level: 1 })).toBeVisible()
  await expect(page.getByLabel('Book', { exact: true }).locator('option')).toHaveText(['All books', 'Shadowrun, Sixth World Core Rulebook'])
  await expect(page.getByLabel('Chapter')).toContainText('GAME CONCEPTS')
  await expect(page.getByLabel('Search the rules')).toBeVisible()
  await page.goto('/#/rules')
  await expect(page.getByLabel('Book', { exact: true }).locator('option').first()).toHaveText('All books')
  const rules = page.locator('.rule-toc li')
  const all = await rules.count()
  await page.getByLabel('Book', { exact: true }).selectOption({ index: 1 })
  expect(await rules.count()).toBeLessThanOrEqual(all)
  await expect(page.getByLabel('Sheet')).toBeVisible()
})

// the owner's request: Rules opens on a table of contents, each title a link to the rule in a drawer with its own address
for (const [game, toc, hash, title, text] of [
  ['Anarchy', '#/rules', '#/rules/test.gadget-basics', 'Risk Reduction (spec)', 'Invented quick-reference text for this test.'],
  ['SR6', '#/sr6/rules', '#/sr6/rules/crb.making-trouble', 'Making Trouble', 'A second invented paragraph.'],
]) test(`${game} Rules: a table of contents; a title opens its drawer at its own address, a reload keeps it, Esc goes back`, async ({ page }) => {
  const at = (h: string) => new RegExp(`${h.replace(/[./]/g, '\\$&')}$`)
  await signIn(page, `/${toc}`)
  await expect(page.locator('.rule-toc li', { hasText: title })).toBeVisible()
  await expect(page.locator('.prose')).toHaveCount(0) // titles only: no rule text on the page itself
  await page.screenshot({ path: `${SHOTS}/rules-toc-${game}-desktop.png`, fullPage: true })
  await page.locator('.rule-toc').getByRole('link', { name: title, exact: true }).click()
  await expect(page).toHaveURL(at(hash))
  const drawer = page.getByRole('dialog', { name: title })
  await expect(drawer).toContainText(text)
  await page.reload()
  await expect(drawer).toContainText(text)
  await page.screenshot({ path: `${SHOTS}/rules-drawer-${game}-desktop.png` })
  await page.setViewportSize(PHONE)
  await fits(page, `${game} rule drawer`)
  await page.screenshot({ path: `${SHOTS}/rules-drawer-${game}-phone.png` })
  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
  await expect(page).toHaveURL(at(toc))
  await expect(page.locator('.rule-toc li', { hasText: title })).toBeVisible()
  await fits(page, `${game} rules contents`)
  await page.screenshot({ path: `${SHOTS}/rules-toc-${game}-phone.png`, fullPage: true })
  await page.setViewportSize(DESK)
})

test('Rules text: paragraphs at a readable width, bold and italic shown as such, no markers', async ({ page }) => {
  await signIn(page, '/#/sr6/rules')
  await page.goto('/#/sr6/rules/crb.making-trouble')
  const drawer = page.locator('dialog.drawer')
  const text = drawer.locator('.prose')
  await expect(text.locator('strong')).toHaveText('trouble')
  await expect(text.locator('em')).toHaveText('made up')
  await expect(text.locator('p')).toHaveCount(2)
  await expect(text.locator('li')).toHaveText(['an invented list item', 'another'])
  await expect(text).not.toContainText('**')
  await expect(text).not.toContainText('*made')
  const box = (await text.boundingBox())!
  expect(box.width).toBeGreaterThan(500) // not a narrow column
  expect(await text.evaluate(e => parseFloat(getComputedStyle(e).maxWidth) / parseFloat(getComputedStyle(e).fontSize))).toBeLessThanOrEqual(75)
  await page.screenshot({ path: `${SHOTS}/rules-sr6-text-desktop.png`, fullPage: true })
  // an older import: its lines join into one paragraph (a section's drawer links to its subsections)
  await drawer.getByRole('link', { name: 'Trouble Dice' }).click()
  await expect(page).toHaveURL(/#\/sr6\/rules\/crb\.making-trouble-dice$/)
  await expect(drawer.locator('.prose p')).toHaveText(['An invented line that wraps in the old way.'])
  await page.setViewportSize(PHONE)
  await fits(page, 'SR6 Rules')
  await page.screenshot({ path: `${SHOTS}/rules-sr6-text-phone.png`, fullPage: true })
  await page.setViewportSize(DESK)
  // Game data: the same text under the entry's Description
  await page.goto('/#/sr6/data')
  await page.getByRole('group', { name: 'Kind' }).getByRole('button', { name: counted('Rules') }).click()
  const row = page.locator('table.browse tr', { hasText: 'Making Trouble' })
  await row.getByText('Description').click()
  await expect(row.locator('.prose strong')).toHaveText('trouble')
  await page.screenshot({ path: `${SHOTS}/data-sr6-description-desktop.png`, fullPage: true })
})
