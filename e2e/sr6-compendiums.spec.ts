import { test, expect, type Browser, type Page } from '@playwright/test'
import { cpSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { usersFile } from '../server/auth.mjs'
import { createServer } from '../server/server.mjs'

// SR6 S4 end to end: SR6 compendiums on a server of their own with the made-up mini and SR6 fixtures. Ada the admin, Gil
// and Eve editors, Pat a player; every name and value made up. Gil makes Street Kit and fills it with the entry form, finds
// its entries in the SR6 pickers and Game data, copies a book entry in (no description), moves an NPC in and out, shares
// it with the table and with an SR6 campaign; Eve reads it; Pat gets nothing; nothing crosses to the Anarchy side. Runs in
// order. Screenshots go to .extract/screenshots/sr6-s4 (not committed).
const PW = { ada: 'ada-password-1', gil: 'gil-password-1', eve: 'eve-password-1', pat: 'pat-password-1' }
const SHOTS = '.extract/screenshots/sr6-s4'
const PHONE = { width: 390, height: 844 }, DESK = { width: 1400, height: 900 }
const BOOK = 'Shadowrun, Sixth World Core Rulebook' // the fixture's made-up source name
let server: ReturnType<typeof createServer>, base = '', dir = ''
let kit = '' // Street Kit's id

test.describe.configure({ mode: 'serial' })
test.use({ baseURL: async ({}, use) => use(base), storageState: { cookies: [], origins: [] }, viewport: DESK })

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'ca2-sr6-comp-e2e-'))
  const config = join(dir, 'library', '.config')
  cpSync('tests/fixtures/mini/custom', join(dir, 'custom'), { recursive: true })
  cpSync('tests/fixtures/sr6/custom', join(dir, 'custom', 'sr6'), { recursive: true })
  mkdirSync(config, { recursive: true })
  writeFileSync(join(config, 'users.xml'), await usersFile([{ username: 'ada', password: PW.ada, name: 'Ada Admin' },
    { username: 'gil', password: PW.gil, role: 'editor', name: 'Gil Editor' }, { username: 'eve', password: PW.eve, role: 'editor', name: 'Eve Editor' },
    { username: 'pat', password: PW.pat, role: 'player', name: 'Pat Player' }]))
  server = createServer({ staticDir: 'dist', charDir: join(dir, 'characters'), customDir: join(dir, 'custom'), libraryDir: join(dir, 'library') })
  await new Promise<void>((ok, fail) => server.once('error', fail).listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/`
  mkdirSync(SHOTS, { recursive: true })
})
test.afterAll(() => { server.stopJobs(); server.close() })

async function signIn(page: Page, path: string, username: keyof typeof PW) {
  await page.goto(path)
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password', { exact: true }).fill(PW[username])
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByLabel('Username')).toHaveCount(0)
}
const other = async (browser: Browser, username: keyof typeof PW, path = '/#/sr6') => {
  const p = await browser.newPage({ baseURL: base, storageState: { cookies: [], origins: [] }, viewport: DESK })
  await signIn(p, path, username)
  return p
}
const ORIGIN = () => ({ Origin: base.replace(/\/$/, '') })
const fits = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
/** light and dark at desktop width, then both at phone width (which must not scroll sideways) */
async function shoot(page: Page, name: string) {
  const theme = (t: string) => page.evaluate(v => { document.documentElement.dataset.theme = v }, t)
  await page.screenshot({ path: `${SHOTS}/${name}-light.png`, fullPage: true })
  await theme('dark')
  await page.screenshot({ path: `${SHOTS}/${name}-dark.png`, fullPage: true })
  await page.setViewportSize(PHONE)
  await fits(page)
  await page.screenshot({ path: `${SHOTS}/${name}-phone-dark.png`, fullPage: true })
  await theme('light')
  await page.screenshot({ path: `${SHOTS}/${name}-phone.png`, fullPage: true })
  await page.setViewportSize(DESK)
}
const dialog = (page: Page) => page.getByRole('dialog').last()
const group = (page: Page, name: string) => page.getByRole('region', { name, exact: true })
const toast = (page: Page, text: string) => expect(page.locator('.toast', { hasText: text })).toBeVisible()
const npcRow = (page: Page, name: string) => page.locator('.dossier').filter({ has: page.getByRole('link', { name, exact: true }) })
/** Add entry: the kind, the name, then `fill` */
async function addEntry(page: Page, kind: string, name: string, fill: (d: ReturnType<typeof dialog>) => Promise<void>) {
  await page.getByRole('button', { name: 'Add entry' }).click()
  const d = dialog(page)
  await d.getByLabel('Kind').selectOption({ label: kind })
  await d.getByLabel('Name', { exact: true }).fill(name)
  await fill(d)
  await d.getByRole('button', { name: 'Add entry' }).click()
  await toast(page, `Added ${name}.`)
}
/** a new runner's Qualities tab, its positive picker open */
async function qualityPicker(page: Page, street: string) {
  await page.goto('/#/sr6')
  await page.getByRole('button', { name: 'New runner' }).click()
  await page.getByRole('dialog', { name: 'New runner' }).getByLabel('Street name').fill(street)
  await page.getByRole('dialog', { name: 'New runner' }).getByRole('button', { name: 'Create runner' }).click()
  await expect(page).toHaveURL(/#\/sr6\/c\/[^/]+\/concept$/)
  await page.getByRole('navigation', { name: 'Character sections' }).getByRole('link').filter({ hasText: 'Qualities' }).click()
  await page.getByRole('button', { name: 'Add a positive quality…' }).click()
  return page.getByRole('dialog', { name: 'Add a positive quality' })
}

test('Gil makes Street Kit and fills it; its entries reach his pickers and Game data, where Edit opens it in Street Kit', async ({ page }) => {
  await signIn(page, '/#/sr6', 'gil')
  await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: 'Compendiums' }).click()
  await expect(page).toHaveURL(/#\/sr6\/compendiums$/)
  await expect(page.getByRole('heading', { name: 'Compendiums', level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Compendiums' })).toHaveAttribute('aria-current', 'page')
  await expect(group(page, 'Books').getByRole('link', { name: BOOK, exact: true })).toHaveAttribute('href', '#/sr6/compendiums/CRB')

  await page.getByRole('button', { name: 'New compendium' }).click()
  const d = page.getByRole('dialog', { name: 'New compendium' })
  await d.getByLabel('Name').fill('Street Kit')
  await d.getByLabel('Source id').fill('crb') // the book's: refused inline
  await expect(d.getByText('CRB is already a source; choose another id.')).toBeVisible()
  await expect(d.getByRole('button', { name: 'Create compendium' })).toBeDisabled()
  await d.getByLabel('Source id').fill('street')
  await d.getByRole('button', { name: 'Create compendium' }).click()
  await expect(page.getByRole('heading', { name: 'Street Kit', level: 1 })).toBeVisible()
  kit = page.url().split('/').pop()!
  expect(kit).toMatch(/^[0-9a-f]{12}$/)
  await expect(page.getByText('No entries yet.')).toBeVisible()

  // a weapon: Add entry waits for its category (common.xsd requires one)
  await page.getByRole('button', { name: 'Add entry' }).click()
  const w = dialog(page)
  await w.getByLabel('Kind').selectOption({ label: 'Weapons' })
  await w.getByLabel('Name', { exact: true }).fill('Pop Stick')
  await expect(w.getByText('Fill in category.')).toBeVisible()
  await expect(w.getByRole('button', { name: 'Add entry' })).toBeDisabled()
  await w.getByLabel('category (required)').fill('Made-up clubs')
  await w.getByLabel('dv', { exact: true }).fill('2S')
  await w.getByLabel('modes', { exact: true }).fill('SS')
  await w.getByLabel('cost', { exact: true }).fill('75')
  await w.getByLabel('Description').fill('Our own words about a stick.')
  await page.screenshot({ path: `${SHOTS}/entry-form-light.png` })
  await w.getByRole('button', { name: 'Add entry' }).click()
  await toast(page, 'Added Pop Stick.')
  await addEntry(page, 'Qualities', 'Lucky Socks', async x => {
    await x.getByLabel('kind (required)').selectOption('positive')
    await x.getByLabel('karma', { exact: true }).fill('4')
  })
  await addEntry(page, 'Spirits', 'Gutter Spirit', async x => {
    await x.getByLabel('category', { exact: true }).fill('Made-up alley')
    await x.getByLabel('bod', { exact: true }).fill('F+1')
    await x.getByLabel('skills', { exact: true }).fill('Lurking 3, Fumbling 2')
  })

  const stick = group(page, 'Weapons').locator('tr', { hasText: 'Pop Stick' })
  await expect(stick).toContainText('category Made-up clubs · dv 2S · modes SS · cost 75')
  await expect(stick).toContainText('Our own words about a stick.')
  await expect(stick.locator('.src')).toHaveText('STREET p.1')
  await expect(stick.locator('.noncanon')).toHaveText('House')
  await expect(group(page, 'Qualities')).toContainText('Lucky Socks')
  await expect(group(page, 'Spirits').locator('tr', { hasText: 'Gutter Spirit' })).toContainText('skills: Lurking 3, Fumbling 2')
  await page.getByLabel('Search entries').fill('sock')
  await expect(group(page, 'Weapons')).toHaveCount(0)
  await page.getByLabel('Search entries').fill('')
  await shoot(page, 'compendium')
  const file = await (await page.request.get('/api/sr6/compendiums')).json() as { id: string; xml: string }[]
  expect(file.map(f => f.id)).toEqual([kit])
  expect(file[0].xml).toContain('<skills>Lurking 3, Fumbling 2</skills>')

  // the pickers: the quality on a runner's Qualities, the spirit in New critter
  const picker = await qualityPicker(page, 'Gil Test Runner')
  await expect(picker.getByText('Lucky Socks')).toBeVisible()
  await picker.getByText('Lucky Socks').click()
  await expect(page.locator('tr', { hasText: 'Lucky Socks' })).toBeVisible()
  await page.goto('/#/sr6/npcs/critters')
  await page.getByRole('button', { name: 'New critter' }).click()
  await page.getByRole('dialog', { name: 'New critter' }).getByLabel('Kind').selectOption({ label: 'Spirit' })
  await expect(page.getByRole('dialog', { name: 'New critter' }).getByLabel('From the catalog').locator('option', { hasText: 'Gutter Spirit' })).toHaveCount(1)
  await page.getByRole('dialog', { name: 'New critter' }).getByRole('button', { name: 'Cancel' }).click()

  // Game data: the weapon marked House; its Edit opens it in Street Kit (the edits layer never edits it); a book's Edit is the edits dialog
  await page.goto('/#/sr6/data')
  await page.getByRole('group', { name: 'Kind' }).getByRole('button', { name: /^Weapons \d+$/ }).click()
  const row = page.locator('table.sr6-browse tr', { hasText: 'Pop Stick' })
  await expect(row.locator('.noncanon')).toHaveText('House')
  await expect(row.getByRole('link', { name: 'Edit Pop Stick' })).toHaveAttribute('href', `#/sr6/compendiums/${kit}/street.pop-stick`)
  await expect(page.locator('table.sr6-browse tr', { hasText: 'Zap Gun' }).getByRole('button', { name: 'Edit Zap Gun' })).toBeVisible()
  await row.getByRole('link', { name: 'Edit Pop Stick' }).click()
  await expect(page).toHaveURL(new RegExp(`#/sr6/compendiums/${kit}/street\\.pop-stick$`))
  const e = page.getByRole('dialog', { name: 'Edit Pop Stick' })
  await expect(e.getByLabel('dv', { exact: true })).toHaveValue('2S')
  await e.getByLabel('dv', { exact: true }).fill('3S')
  await e.getByRole('button', { name: 'Save changes' }).click()
  await toast(page, 'Saved Pop Stick.')
  await expect(group(page, 'Weapons').locator('tr', { hasText: 'Pop Stick' })).toContainText('dv 3S')
  page.once('dialog', x => x.accept())
  await group(page, 'Spirits').getByRole('button', { name: 'Delete Gutter Spirit' }).click()
  await expect(group(page, 'Spirits')).toHaveCount(0)
  await toast(page, 'Deleted Gutter Spirit.')
})

test('copy from the book: a new STREET id, page 1, no description; the book’s entry unchanged', async ({ page }) => {
  await signIn(page, '/#/sr6/compendiums', 'gil')
  await group(page, 'Books').getByRole('link', { name: BOOK, exact: true }).click()
  await expect(page).toHaveURL(/#\/sr6\/compendiums\/CRB$/)
  await expect(page.getByRole('heading', { name: BOOK, level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add entry' })).toHaveCount(0)
  const zap = group(page, 'Weapons').locator('tr', { hasText: 'Zap Gun' })
  await zap.getByRole('button', { name: 'Copy Zap Gun to…' }).click()
  await expect(dialog(page).getByLabel('Compendium')).toHaveValue(kit)
  await dialog(page).getByRole('button', { name: 'Copy' }).click()
  await toast(page, 'Copied Zap Gun to Street Kit.')
  await shoot(page, 'book')

  await page.goto(`/#/sr6/compendiums/${kit}`)
  const copy = group(page, 'Weapons').locator('tr', { hasText: 'Zap Gun' })
  await expect(copy.locator('.src')).toHaveText('STREET p.1')
  await expect(copy).not.toContainText('A made-up gun that zaps.')
  const xml = (await (await page.request.get('/api/sr6/compendiums')).json() as { xml: string }[])[0].xml
  expect(xml).toMatch(/<weapon id="street\.zap-gun" source="STREET" page="1" [^>]*><name>Zap Gun<\/name><text\/><\/weapon>/)
  expect(xml).not.toContain('zaps')
  await page.goto('/#/sr6/data')
  await page.getByRole('group', { name: 'Kind' }).getByRole('button', { name: /^Weapons \d+$/ }).click()
  await page.getByLabel('Search the catalog').fill('Zap Gun')
  const rows = page.locator('table.sr6-browse tbody tr')
  await expect(rows).toHaveCount(2)
  await expect(rows.filter({ hasText: 'CRB p.' })).toHaveCount(1)
  await expect(rows.filter({ hasText: 'STREET p.1' })).toHaveCount(1)
})

test('move: Corner Goon into Street Kit (gone from NPCs & Critters, in its trash), then back out to edit', async ({ page }) => {
  await signIn(page, '/#/sr6/npcs', 'gil')
  await page.getByRole('button', { name: 'New NPC' }).click()
  await page.getByRole('dialog', { name: 'New NPC' }).getByLabel('From the catalog').selectOption({ label: 'Corner Goon' })
  await page.getByRole('dialog', { name: 'New NPC' }).getByRole('button', { name: 'Create NPC' }).click()
  await expect(page).toHaveURL(/#\/sr6\/n\/[^/]+\/stats$/)
  await page.goto('/#/sr6/npcs')
  await npcRow(page, 'Corner Goon').getByRole('button', { name: 'Move Corner Goon to a compendium…' }).click()
  await expect(dialog(page).getByLabel('Compendium')).toHaveValue(kit)
  await dialog(page).getByRole('button', { name: 'Move' }).click()
  await expect(page.locator('p.banner[role=status]')).toHaveText('Moved Corner Goon to Street Kit.')
  await expect(npcRow(page, 'Corner Goon')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Trash (1)' })).toBeVisible()

  await page.goto(`/#/sr6/compendiums/${kit}`)
  const goon = group(page, 'NPCs & Critters').locator('tr', { hasText: 'Corner Goon' })
  await expect(goon.locator('.npckind')).toContainText('Grunt PR')
  await goon.getByRole('button', { name: 'Move Corner Goon to my NPCs' }).click()
  await toast(page, 'Moved Corner Goon to your NPCs.')
  await expect(group(page, 'NPCs & Critters')).toHaveCount(0)
  await page.goto('/#/sr6/npcs')
  await npcRow(page, 'Corner Goon').getByRole('link', { name: 'Corner Goon' }).click()
  await expect(page).toHaveURL(/#\/sr6\/n\/[^/]+\/stats$/)
  await expect(page.getByRole('status').filter({ hasText: /^Read only/ })).toHaveCount(0)
  await expect(page.getByLabel('BOD as printed')).toBeEnabled()
})

test('Eve: Gil’s private id is refused inline; shared with the table she reads it, without Edit, and copies into hers', async ({ page, browser }) => {
  await signIn(page, '/#/sr6/compendiums', 'eve')
  await expect(page.getByRole('link', { name: 'Street Kit' })).toHaveCount(0) // private
  await page.getByRole('button', { name: 'New compendium' }).click()
  const d = page.getByRole('dialog', { name: 'New compendium' })
  await d.getByLabel('Name').fill('Eve Bits')
  await d.getByLabel('Source id').fill('street') // Gil's private compendium: only the server knows it
  await d.getByRole('button', { name: 'Create compendium' }).click()
  await expect(d.getByText('STREET is taken (another GM’s compendium may use it); choose another id.')).toBeVisible()
  await expect(d.getByRole('button', { name: 'Create compendium' })).toBeDisabled()
  await d.getByLabel('Source id').fill('evebits')
  await d.getByRole('button', { name: 'Create compendium' }).click()
  await expect(page.getByRole('heading', { name: 'Eve Bits', level: 1 })).toBeVisible()

  const gil = await other(browser, 'gil', '/#/sr6/compendiums')
  await gil.getByRole('button', { name: 'Details of Street Kit' }).click()
  await dialog(gil).getByLabel('Sharing').selectOption('table')
  await dialog(gil).getByRole('button', { name: 'Save' }).click()
  await expect(gil.getByRole('status').filter({ hasText: 'Saved Street Kit.' })).toBeVisible()
  await shoot(gil, 'list')

  await page.goto('/#/sr6/compendiums')
  await page.reload()
  await group(page, 'Shared with you').getByRole('link', { name: 'Street Kit' }).click()
  await expect(page.getByRole('heading', { name: 'Street Kit', level: 1 })).toBeVisible()
  await expect(page.getByText(/Gil Editor’s, read only · shared with the table/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add entry' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^(Edit|Delete) / })).toHaveCount(0)
  await group(page, 'Weapons').getByRole('button', { name: 'Copy Pop Stick to…' }).click()
  await dialog(page).getByRole('button', { name: 'Copy' }).click()
  await toast(page, 'Copied Pop Stick to Eve Bits.')
  // Game data: Gil's entry is in her catalog, with no Edit (it's his)
  await page.goto('/#/sr6/data')
  await page.getByRole('group', { name: 'Kind' }).getByRole('button', { name: /^Weapons \d+$/ }).click()
  await page.getByLabel('Search the catalog').fill('Pop Stick')
  await expect(page.locator('table.sr6-browse tr', { hasText: 'STREET p.1' }).getByRole('link', { name: 'Edit Pop Stick' })).toHaveCount(0)
  await expect(page.locator('table.sr6-browse tr', { hasText: 'EVEBITS p.1' }).getByRole('link', { name: 'Edit Pop Stick' })).toBeVisible()
  // opened by its address, someone else's entry gets no form
  await page.goto(`/#/sr6/compendiums/${kit}/street.pop-stick`)
  await expect(page.getByRole('heading', { name: 'Street Kit', level: 1 })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Edit Pop Stick' })).toHaveCount(0)
  await gil.close()
})

test('shared with Gil’s SR6 campaign’s GMs: Eve sees it only once she co-GMs it', async ({ page, browser }) => {
  await signIn(page, '/#/sr6/compendiums', 'gil')
  const camp = await (await page.request.post('/api/sr6/campaigns', { data: { name: 'Made-up Kit Table' }, headers: ORIGIN() })).json() as { id: string }
  await page.reload()
  await page.getByRole('button', { name: 'Details of Street Kit' }).click()
  await dialog(page).getByLabel('Sharing').selectOption('campaign')
  await dialog(page).locator('select').last().selectOption({ label: 'Made-up Kit Table' })
  await dialog(page).getByRole('button', { name: 'Save' }).click()
  await expect(page.locator('tr', { hasText: 'Street Kit' })).toContainText('Shared with Made-up Kit Table’s GMs')

  const eve = await other(browser, 'eve', '/#/sr6/compendiums')
  await expect(eve.getByRole('heading', { name: 'Compendiums', level: 1 })).toBeVisible()
  await expect(eve.getByRole('link', { name: 'Street Kit' })).toHaveCount(0)
  const ada = await other(browser, 'ada')
  expect((await ada.request.post(`/api/sr6/campaigns/${camp.id}/gms`, { data: { user: 'eve' }, headers: ORIGIN() })).ok()).toBe(true)
  await ada.close()
  await eve.reload()
  await expect(group(eve, 'Shared with you').getByRole('link', { name: 'Street Kit' })).toBeVisible()
  await eve.close()
})

test('Pat: no menu entry, no page, no data, and no compendium entry in his pickers', async ({ page }) => {
  await signIn(page, '/#/sr6/compendiums', 'pat')
  await expect(page.getByRole('heading', { name: 'Your runners' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Compendiums' })).toHaveCount(0)
  expect((await page.request.get('/api/sr6/compendiums')).status()).toBe(403)
  const picker = await qualityPicker(page, 'Pat Test Runner')
  await expect(picker.getByText('Lucky Streak')).toBeVisible()
  await expect(picker.getByText('Lucky Socks')).toHaveCount(0)
  await page.goto('/#/sr6/data')
  await page.getByRole('group', { name: 'Kind' }).getByRole('button', { name: /^Weapons \d+$/ }).click()
  await expect(page.locator('table.sr6-browse')).not.toContainText('Pop Stick')
})

test('isolation: Anarchy’s compendiums never meet SR6’s; a STREET compendium in each game', async ({ page }) => {
  await signIn(page, '/#/compendiums', 'gil')
  await expect(page.getByRole('heading', { name: 'Compendiums', level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Street Kit' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: BOOK })).toHaveCount(0)
  // an Anarchy compendium with the same source id is fine: the catalogs never meet
  await page.getByRole('button', { name: 'New compendium' }).click()
  const d = page.getByRole('dialog', { name: 'New compendium' })
  await d.getByLabel('Name').fill('Anarchy Street')
  await d.getByLabel('Source id').fill('street')
  await d.getByRole('button', { name: 'Create compendium' }).click()
  await expect(page.getByRole('heading', { name: 'Anarchy Street', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: 'Add an item' }).click()
  await dialog(page).getByLabel('Kind').selectOption({ label: 'Weapon' })
  await dialog(page).getByLabel('Name', { exact: true }).fill('Anarchy Pipe')
  await dialog(page).getByRole('button', { name: 'Add item' }).click()
  await toast(page, 'Added Anarchy Pipe.')
  const ca2 = await (await page.request.get('/api/compendiums')).text()
  expect(ca2).toContain('Anarchy Street')
  expect(ca2).not.toContain('urn:chummer-sr6')
  expect(ca2).not.toContain('Street Kit')
  const sr6 = await (await page.request.get('/api/sr6/compendiums')).text()
  expect(sr6).toContain('Street Kit')
  expect(sr6).not.toContain('urn:chummer-anarchy2')
  expect(sr6).not.toContain('Anarchy Street')

  await page.goto('/#/sr6/compendiums')
  await expect(page.getByRole('link', { name: 'Street Kit' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Anarchy Street' })).toHaveCount(0)
  await page.goto('/#/sr6/data')
  await page.getByLabel('Search the catalog').fill('Anarchy Pipe') // (across every kind)
  await expect(page.getByText('Nothing matches “Anarchy Pipe”.')).toBeVisible()
  await expect(page.locator('table.sr6-browse')).toHaveCount(0)
  await expect(page.locator('table.sr6-sources')).not.toContainText('Anarchy Street')
  // on disk: each game's own folder
  expect(readdirSync(join(dir, 'characters', 'sr6', '.compendiums', 'gil')).filter(f => f.endsWith('.xml'))).toEqual([`${kit}.xml`])
  expect(readdirSync(join(dir, 'characters', '.compendiums', 'gil')).filter(f => f.endsWith('.xml'))).toHaveLength(1)
})
