import { test, expect, type Page } from '@playwright/test'
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { usersFile } from '../server/auth.mjs'
import { createServer } from '../server/server.mjs'
import { anarchyState } from './session'

// 0.8.0 compendiums end to end, on a server of its own (all names and entries made up): Eve and Gus are editors (GMs),
// Pat a player. Runs in order. Screenshots go to .extract/ (not committed).
const PW = { ada: 'ada-password-1', eve: 'eve-password-1', gus: 'gus-password-1', pat: 'pat-password-1' }
const SHOTS = '.extract/screenshots/0.8.0'
let server: ReturnType<typeof createServer>, base = ''

test.describe.configure({ mode: 'serial' })
test.use({ baseURL: async ({}, use) => use(base), storageState: async ({}, use) => use(anarchyState(base)) })

test.beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ca2-comp-e2e-')), config = join(dir, 'library', '.config')
  cpSync('tests/fixtures/mini/custom', join(dir, 'custom'), { recursive: true })
  mkdirSync(config, { recursive: true })
  writeFileSync(join(config, 'users.xml'), await usersFile([{ username: 'ada', password: PW.ada, name: 'Ada Admin' },
    { username: 'eve', password: PW.eve, role: 'editor', name: 'Eve Editor' },
    { username: 'gus', password: PW.gus, role: 'editor', name: 'Gus Editor' },
    { username: 'pat', password: PW.pat, role: 'player', name: 'Pat Player' }]))
  server = createServer({ staticDir: 'dist', charDir: join(dir, 'characters'), customDir: join(dir, 'custom'), libraryDir: join(dir, 'library') })
  await new Promise<void>((ok, fail) => server.once('error', fail).listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/`
  mkdirSync(SHOTS, { recursive: true })
})
test.afterAll(() => { server.stopJobs(); server.close() })

async function signIn(page: Page, username: keyof typeof PW) {
  await page.context().clearCookies()
  await page.goto('/')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password', { exact: true }).fill(PW[username])
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Your runners' })).toBeVisible()
}
async function shots(page: Page, name: string) {
  const theme = (t: string) => page.evaluate(t => { localStorage.setItem('ca2.settings.v1', JSON.stringify({ theme: t })); document.documentElement.dataset.theme = t }, t)
  await theme('light'); await page.screenshot({ path: `${SHOTS}/${name}-light.png`, fullPage: true })
  await theme('dark'); await page.screenshot({ path: `${SHOTS}/${name}-dark.png`, fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${name} scrolls sideways`).toBeLessThanOrEqual(0)
  await page.screenshot({ path: `${SHOTS}/${name}-phone.png`, fullPage: true })
  await page.setViewportSize({ width: 1400, height: 900 })
  await theme('light')
}
const dialog = (page: Page) => page.getByRole('dialog').last()
const group = (page: Page, name: string) => page.getByRole('region', { name, exact: true })
const toast = (page: Page, text: string) => expect(page.locator('.toast', { hasText: text })).toBeVisible()
async function addItem(page: Page, kind: string, name: string, fill: (d: ReturnType<typeof dialog>) => Promise<void>) {
  await page.getByRole('button', { name: 'Add an item' }).click()
  const d = dialog(page)
  await d.getByLabel('Kind').selectOption({ label: kind })
  await d.getByLabel('Name', { exact: true }).fill(name)
  await fill(d)
  await d.getByRole('button', { name: 'Add item' }).click()
  await toast(page, `Added ${name}.`)
}

test('an editor makes a compendium and fills it; its entries reach their NPC’s pickers', async ({ page }) => {
  await signIn(page, 'eve')
  await page.getByRole('link', { name: 'Compendiums' }).click()
  await expect(page.getByRole('heading', { name: 'Compendiums', level: 1 })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Books' }).getByRole('link', { name: 'Test Book One' })).toBeVisible()

  await page.getByRole('button', { name: 'New compendium' }).click()
  const d = page.getByRole('dialog', { name: 'New compendium' })
  await d.getByLabel('Name').fill('Street Gear')
  await d.getByLabel('Source id').fill('test') // a book's: refused inline
  await expect(d.getByText('TEST is already a source; choose another id.')).toBeVisible()
  await expect(d.getByRole('button', { name: 'Create compendium' })).toBeDisabled()
  await d.getByLabel('Source id').fill('street')
  await expect(d.getByLabel('Sharing')).toHaveValue('private')
  await d.getByRole('button', { name: 'Create compendium' }).click()
  await expect(page.getByRole('heading', { name: 'Street Gear', level: 1 })).toBeVisible()
  await expect(page.getByText('No entries yet.')).toBeVisible()

  await addItem(page, 'Weapon', 'Lead Pipe', async d => {
    await d.getByLabel('Damage (DV)').fill('STR+2')
    await d.getByLabel('Ranges').fill('OK/-/-/-')
    await d.getByLabel('Description', { exact: true }).fill('Heavy and made up.')
  })
  await addItem(page, 'Armor', 'Rain Coat', async d => { await d.getByLabel('Armor', { exact: true }).fill('2') })
  await addItem(page, 'Spell', 'Glow Ball', async d => { await d.getByLabel('Category').selectOption('illusion') })

  await page.getByRole('button', { name: 'Add an amp' }).click()
  await dialog(page).getByLabel('Amp type').selectOption('quality')
  await dialog(page).getByLabel('Name', { exact: true }).fill('Lucky Charm')
  await dialog(page).getByLabel('Description', { exact: true }).fill('Made-up luck.')
  await expect(dialog(page).getByRole('button', { name: 'Save to the catalog' })).toHaveCount(0)
  await dialog(page).getByRole('button', { name: 'Save to the compendium' }).click()
  await toast(page, 'Added Lucky Charm.')

  await page.getByRole('button', { name: 'Add a vehicle' }).click()
  const v = dialog(page)
  await v.getByLabel('Name', { exact: true }).fill('Rust Bucket')
  await v.getByLabel('Body', { exact: true }).fill('6')
  await v.getByLabel('Speed', { exact: true }).fill('3')
  await v.getByLabel('Mount').fill('light guns')
  await v.getByRole('button', { name: 'Add vehicle' }).click()
  await toast(page, 'Added Rust Bucket.')

  const pipe = group(page, 'Weapons').locator('tr', { hasText: 'Lead Pipe' })
  await expect(pipe).toContainText('DV STR+2 [OK/-/-/-]')
  await expect(pipe).toContainText('Heavy and made up.')
  await expect(pipe.locator('.src')).toHaveText('STREET p.1')
  await expect(pipe.locator('.noncanon')).toBeVisible()
  await expect(group(page, 'Armor').locator('tr', { hasText: 'Rain Coat' })).toContainText('Armor 2')
  await expect(group(page, 'Spells')).toContainText('Glow Ball')
  await expect(group(page, 'Amps')).toContainText('Lucky Charm')
  await expect(group(page, 'Vehicles').locator('tr', { hasText: 'Rust Bucket' })).toContainText('Body 6')
  await page.getByLabel('Search entries').fill('pipe')
  await expect(group(page, 'Armor')).toHaveCount(0)
  await expect(group(page, 'Weapons')).toContainText('Lead Pipe')
  await page.getByLabel('Search entries').fill('')
  await shots(page, 'compendium')

  // edit one, delete one
  await pipe.getByRole('button', { name: 'Edit Lead Pipe' }).click()
  await dialog(page).getByLabel('Damage (DV)').fill('STR+3')
  await dialog(page).getByRole('button', { name: 'Save changes' }).click()
  await toast(page, 'Saved Lead Pipe.')
  await expect(pipe).toContainText('DV STR+3')
  page.once('dialog', x => x.accept())
  await group(page, 'Armor').getByRole('button', { name: 'Delete Rain Coat' }).click()
  await expect(group(page, 'Armor')).toHaveCount(0)

  // the NPC pickers
  await page.goto('/#/npcs')
  await page.getByRole('button', { name: 'New NPC' }).click()
  await page.getByRole('dialog', { name: 'New NPC' }).getByRole('button', { name: 'Create NPC' }).click()
  await page.getByRole('link', { name: 'Gear' }).click()
  await page.locator('section', { has: page.getByRole('heading', { name: 'Weapons' }) }).getByRole('button', { name: 'Add from the book' }).click()
  await page.getByLabel('Search').fill('Lead Pipe')
  await expect(page.locator('.picker li', { hasText: 'Lead Pipe' }).locator('.src')).toHaveText('STREET p.1')
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('link', { name: 'Shadow Amps' }).click()
  await page.getByRole('button', { name: 'Add an amp' }).click()
  await page.getByLabel('Search the book’s amps').fill('Lucky')
  const amp = page.locator('.picker li', { hasText: 'Lucky Charm' })
  await expect(amp.locator('.noncanon')).toBeVisible()
  await expect(amp.locator('.t')).toHaveText('Made-up luck.')
  await page.getByRole('button', { name: 'Close', exact: true }).click()

  // a compendium entry's Edit in a picker opens it in its compendium, not the catalog edits
  await page.getByRole('link', { name: 'Gear' }).click()
  await page.locator('section', { has: page.getByRole('heading', { name: 'Weapons' }) }).getByRole('button', { name: 'Add from the book' }).click()
  await page.getByLabel('Search').fill('Lead Pipe')
  await page.locator('.picker li', { hasText: 'Lead Pipe' }).getByRole('link', { name: 'Edit Lead Pipe' }).click()
  await expect(page.getByRole('heading', { name: 'Street Gear', level: 1 })).toBeVisible()
  await expect(dialog(page).getByLabel('Damage (DV)')).toHaveValue('STR+3')
  await dialog(page).getByRole('button', { name: 'Cancel' }).click()

  await page.goto('/#/compendiums')
  await shots(page, 'compendiums')
})

test('sharing with the table: another editor reads it, read only', async ({ page }) => {
  await signIn(page, 'eve')
  await page.goto('/#/compendiums')
  await page.getByRole('button', { name: 'Details of Street Gear' }).click()
  const d = page.getByRole('dialog', { name: 'Street Gear' })
  await d.getByLabel('Sharing').selectOption('table')
  await d.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('region', { name: 'Your compendiums' })).toContainText('Shared with the table')

  await signIn(page, 'gus')
  await page.goto('/#/compendiums')
  const shared = page.getByRole('region', { name: 'Shared with you' })
  await expect(shared).toContainText('Eve Editor')
  await expect(shared.getByRole('button', { name: /Delete|Details/ })).toHaveCount(0)
  await shared.getByRole('link', { name: 'Street Gear' }).click()
  await expect(page.getByRole('heading', { name: 'Street Gear', level: 1 })).toBeVisible()
  await expect(group(page, 'Weapons')).toContainText('Lead Pipe')
  await expect(page.getByRole('button', { name: /^(Add|Edit|Delete)/ })).toHaveCount(0)
  await shots(page, 'compendium-shared')

  // not his: no Edit on it in his pickers (it would write a catalog edit)
  await page.goto('/#/npcs')
  await page.getByRole('button', { name: 'New NPC' }).click()
  await page.getByRole('dialog', { name: 'New NPC' }).getByRole('button', { name: 'Create NPC' }).click()
  await page.getByRole('link', { name: 'Gear' }).click()
  await page.locator('section', { has: page.getByRole('heading', { name: 'Weapons' }) }).getByRole('button', { name: 'Add from the book' }).click()
  await page.getByLabel('Search').fill('Lead Pipe')
  const row = page.locator('.picker li', { hasText: 'Lead Pipe' })
  await expect(row.locator('.src')).toHaveText('STREET p.1')
  await expect(row.getByRole('link', { name: 'Edit Lead Pipe' })).toHaveCount(0)
  await expect(row.getByRole('button', { name: 'Edit Lead Pipe' })).toHaveCount(0)
})

test('a book shows as a read-only compendium', async ({ page }) => {
  await signIn(page, 'gus')
  await page.goto('/#/compendiums')
  await page.getByRole('region', { name: 'Books' }).getByRole('link', { name: 'Test Book One' }).click()
  await expect(page.getByRole('heading', { name: 'Test Book One', level: 1 })).toBeVisible()
  await expect(page.locator('main tr').first()).toBeVisible()
  await expect(page.getByRole('button', { name: /^(Add|Edit|Delete)/ })).toHaveCount(0)
})

const compXml = (page: Page, source: string) => page.evaluate(async s =>
  ((await (await fetch('./api/compendiums')).json()) as { xml: string }[]).find(r => r.xml.includes(`source="${s}"`))?.xml ?? '', source)

test('copy a book entry into a compendium: a new id, its source, no description; the book is unchanged', async ({ page }) => {
  await signIn(page, 'eve')
  await page.goto('/#/compendiums/CRB')
  const shiv = () => group(page, 'Weapons').locator('tr', { hasText: 'Shiv' })
  await shiv().getByRole('button', { name: 'Copy Shiv to…' }).click()
  const d = page.getByRole('dialog', { name: 'Copy Shiv' })
  await expect(d.getByLabel('Compendium')).toHaveValue(/.+/)
  await d.getByRole('button', { name: 'Copy' }).click()
  await toast(page, 'Copied Shiv to Street Gear.')
  await expect(shiv()).toContainText('A made-up weapon.')
  await expect(shiv().locator('.src')).toHaveText('CRB p.70')

  const xml = await compXml(page, 'STREET')
  const item = xml.match(/<item id="street\.shiv"[^]*?<\/item>|<item id="street\.shiv"[^>]*\/>/)?.[0] ?? ''
  expect(item).toContain('source="STREET"')
  expect(item).toContain('page="1"')
  expect(item).toContain('dv="STR+2"')
  expect(item).not.toContain('made-up weapon')

  await page.goto('/#/compendiums')
  await page.getByRole('region', { name: 'Your compendiums' }).getByRole('link', { name: 'Street Gear' }).click()
  const copied = group(page, 'Weapons').locator('tr', { hasText: 'Shiv' })
  await expect(copied.locator('.src')).toHaveText('STREET p.1')
  await expect(copied).not.toContainText('A made-up weapon.')
})

test('copy from a shared compendium into your own', async ({ page }) => {
  await signIn(page, 'gus')
  await page.goto('/#/compendiums')
  await page.getByRole('button', { name: 'New compendium' }).click()
  const d = page.getByRole('dialog', { name: 'New compendium' })
  await d.getByLabel('Name').fill('Gus Bits')
  await d.getByLabel('Source id').fill('GUS')
  await d.getByRole('button', { name: 'Create compendium' }).click()
  await expect(page.getByRole('heading', { name: 'Gus Bits', level: 1 })).toBeVisible()
  await page.goto('/#/compendiums')
  await page.getByRole('region', { name: 'Shared with you' }).getByRole('link', { name: 'Street Gear' }).click()
  await group(page, 'Weapons').getByRole('button', { name: 'Copy Lead Pipe to…' }).click()
  await page.getByRole('dialog', { name: 'Copy Lead Pipe' }).getByRole('button', { name: 'Copy' }).click()
  await toast(page, 'Copied Lead Pipe to Gus Bits.')
  const item = (await compXml(page, 'GUS')).match(/<item id="gus\.lead-pipe"[^]*?<\/item>|<item id="gus\.lead-pipe"[^>]*\/>/)?.[0] ?? ''
  expect(item).toContain('source="GUS"')
  expect(item).not.toContain('Heavy and made up.')
})

test('move an NPC into a compendium and back out; a failed save leaves it where it was', async ({ page }) => {
  await signIn(page, 'eve')
  await page.goto('/#/npcs')
  await page.getByRole('link', { name: 'Unnamed NPC' }).click()
  await page.getByLabel('Street name').fill('Made-up Fixer')
  await page.goto('/#/npcs')
  const fixer = page.locator('.dossier', { hasText: 'Made-up Fixer' })
  await expect(fixer).toBeVisible()

  const move = async () => {
    await fixer.getByRole('button', { name: 'Move Made-up Fixer to a compendium…' }).click()
    const d = page.getByRole('dialog', { name: 'Move NPCs to a compendium' })
    await expect(d.getByRole('checkbox', { name: 'Made-up Fixer' })).toBeChecked()
    await d.getByLabel('Compendium').selectOption({ label: 'Street Gear' })
    await d.getByRole('button', { name: 'Move' }).click()
  }
  // the compendium save fails: the NPC stays
  await page.route('**/api/compendiums/*', r => r.request().method() === 'PUT'
    ? r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'made-up failure' }) }) : r.continue())
  await move()
  await expect(page.getByRole('status')).toContainText('made-up failure')
  await expect(fixer).toBeVisible()
  await expect(page.getByRole('link', { name: 'Trash (0)' })).toBeVisible()
  await page.unroute('**/api/compendiums/*')

  await move()
  await expect(page.getByRole('status')).toHaveText('Moved Made-up Fixer to Street Gear.')
  await expect(fixer).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Trash (1)' })).toBeVisible()

  await page.goto('/#/compendiums')
  await page.getByRole('region', { name: 'Your compendiums' }).getByRole('link', { name: 'Street Gear' }).click()
  await expect(group(page, 'NPCs')).toContainText('Made-up Fixer')
  await group(page, 'NPCs').getByRole('button', { name: 'Move Made-up Fixer to my NPCs' }).click()
  await toast(page, 'Moved Made-up Fixer to your NPCs.')
  await expect(group(page, 'NPCs')).toHaveCount(0)

  await page.goto('/#/npcs')
  await fixer.getByRole('link', { name: 'Made-up Fixer' }).click()
  await expect(page.getByLabel('Street name')).toBeEnabled()
  await expect(page.getByLabel('Street name')).toHaveValue('Made-up Fixer')
})

test('a player has no Compendiums link, and #/compendiums says only GMs can see compendiums', async ({ page }) => {
  await signIn(page, 'pat')
  await expect(page.getByRole('link', { name: 'Compendiums' })).toHaveCount(0)
  await page.goto('/#/compendiums')
  await expect(page.getByText('Only GMs can see compendiums.')).toBeVisible()
})
