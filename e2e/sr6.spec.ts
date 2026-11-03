import { test, expect, type Page } from '@playwright/test'
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { usersFile } from '../server/auth.mjs'
import { createServer } from '../server/server.mjs'

// SR6 S1 end to end: the SR6 Books, Rules and Game data pages on a server of their own with the stub worker
// (tests/fixtures/stub-worker.mjs: `sr6 run` installs the made-up SR6 fixture, tests/fixtures/sr6/custom). All names made up:
// Ada the admin, Eve an editor, Pat a player. Runs in order. Screenshots go to .extract/ (not committed).
const PW = { ada: 'ada-password-1', eve: 'eve-password-1', pat: 'pat-password-1' }
const SHOTS = '.extract/screenshots/sr6-s1'
const PHONE = { width: 390, height: 844 },
  DESK = { width: 1400, height: 900 }
let server: ReturnType<typeof createServer>,
  base = ''

test.describe.configure({ mode: 'serial' })
test.use({ baseURL: async ({}, use) => use(base), storageState: { cookies: [], origins: [] } })

test.beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ca2-sr6-e2e-')),
    config = join(dir, 'library', '.config')
  cpSync('tests/fixtures/mini/custom', join(dir, 'custom'), { recursive: true })
  mkdirSync(config, { recursive: true })
  writeFileSync(
    join(config, 'users.xml'),
    await usersFile([
      { username: 'ada', password: PW.ada, name: 'Ada Admin' },
      { username: 'eve', password: PW.eve, role: 'editor', name: 'Eve Editor' },
      { username: 'pat', password: PW.pat, role: 'player', name: 'Pat Player' },
    ]),
  )
  server = createServer({
    staticDir: 'dist',
    charDir: join(dir, 'characters'),
    customDir: join(dir, 'custom'),
    libraryDir: join(dir, 'library'),
    python: [process.execPath, 'tests/fixtures/stub-worker.mjs'],
  })
  await new Promise<void>((ok, fail) => server.once('error', fail).listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/`
  mkdirSync(SHOTS, { recursive: true })
})
test.afterAll(() => {
  server.stopJobs()
  server.close()
})

async function signIn(page: Page, path: string, username: keyof typeof PW) {
  await page.goto(path)
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password', { exact: true }).fill(PW[username])
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByLabel('Username')).toHaveCount(0)
}
const menu = (page: Page) => page.getByRole('navigation', { name: 'Main menu' }).getByRole('link')
const labels = (page: Page) => menu(page).evaluateAll(as => as.map(a => a.getAttribute('aria-label')))
const pdf = (name: string) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 made up\n%%EOF\n') })
const fits = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
const browse = (page: Page) => page.locator('.sr6-browse tbody tr')
const kind = (page: Page, name: string) => page.getByRole('group', { name: 'Kind' }).getByRole('button', { name: new RegExp(`^${name} [0-9]+$`) })

/** light and dark at desktop width, then both at phone width (which must not scroll sideways) */
async function shoot(page: Page, name: string, dir = SHOTS) {
  const theme = (t: string) =>
    page.evaluate(v => {
      document.documentElement.dataset.theme = v
    }, t)
  await page.screenshot({ path: `${dir}/${name}-light.png`, fullPage: true })
  await theme('dark')
  await page.screenshot({ path: `${dir}/${name}-dark.png`, fullPage: true })
  await page.setViewportSize(PHONE)
  await fits(page)
  await page.screenshot({ path: `${dir}/${name}-phone-dark.png`, fullPage: true })
  await theme('light')
  await page.screenshot({ path: `${dir}/${name}-phone.png`, fullPage: true })
  await page.setViewportSize(DESK)
}

async function findWeapon(page: Page, name: string) {
  await page.getByLabel('Search the catalog').fill('')
  await kind(page, 'Weapons').click()
  await page.getByLabel('Search the catalog').fill(name)
  return browse(page).filter({ hasText: name })
}

test('admin: SR6 Books imports the core rulebook; Game data and Rules show it', async ({ page }) => {
  await signIn(page, '/#/sr6/data', 'ada')
  await expect(page.getByRole('heading', { name: 'Game data' })).toBeVisible()
  await expect(page.getByText('No SR6 data yet.')).toBeVisible()
  expect(await labels(page)).toEqual([
    'Your runners',
    'Vehicle designer',
    'Drone designer',
    'Weapon designer',
    'Cyberware designer',
    'NPCs & Critters',
    'Compendiums',
    'Campaigns',
    'Books',
    'Rules',
    'Game data',
    'Table setup',
  ])
  await expect(page.getByRole('link', { name: 'Game data' })).toHaveAttribute('aria-current', 'page')

  await page.getByRole('link', { name: 'Books', exact: true }).click()
  await expect(page).toHaveURL(/#\/sr6\/books$/)
  await expect(page.getByRole('link', { name: 'Books', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByText('Upload the Shadowrun 6 core rulebook PDF you own')).toBeVisible()
  await expect(page.locator('.supported')).toContainText('Shadowrun, Sixth World Core Rulebook')
  await expect(page.getByRole('link', { name: 'AI settings' })).toHaveAttribute('href', '#/sr6/books/ai') // SR6's own (e2e/sr6-ai.spec.ts)
  await expect(page.getByRole('heading', { name: 'Core data' })).toHaveCount(0) // no data pack for SR6
  await page.getByLabel('Choose PDF files').setInputFiles(pdf('made-up-sr6.pdf'))
  const row = page.locator('.book', { hasText: 'made-up-sr6.pdf' })
  await expect(row).toContainText('Imported', { timeout: 10000 })
  await expect(row).toContainText('recipe crb')
  await expect(row).toContainText('Weapons 2')
  await expect(row).toContainText('Rules 2')
  await expect(row).toContainText('Shadowrun, Sixth World Core Rulebook')
  await expect(page.locator('.supported li', { hasText: /\bCRB\b(?!-)/ })).toContainText('Imported')
  await expect(row.getByRole('button', { name: /AI/ })).toHaveCount(0)
  await shoot(page, 'books')
  await row.getByRole('button', { name: 'Report' }).click()
  const report = page.getByRole('dialog')
  await expect(report).toContainText('Made-up Ray')
  await expect(report).not.toContainText('Also in other books')
  await report.getByRole('button', { name: 'Close' }).click()

  await page.getByRole('link', { name: 'Game data' }).click()
  await expect(page.getByText('No SR6 data yet.')).toHaveCount(0)
  const crb = page.locator('.sr6-sources tbody tr', { hasText: /\bCRB\b(?!-)/ })
  await expect(crb).toContainText('Catalyst Game Labs')
  await expect(crb).toContainText('installed')
  await expect(crb).toContainText('test-sr6-core.pdf')
  await expect(kind(page, 'Weapons')).toHaveAccessibleName('Weapons 2')
  await expect(kind(page, 'Rules')).toHaveAccessibleName('Rules 2')
  const gun = await findWeapon(page, 'Zap Gun')
  await expect(gun).toContainText('cost 320')
  await expect(gun).toContainText('CRB p.250')
  await expect(browse(page)).toHaveCount(1)
  await page.getByLabel('Search the catalog').fill('')
  await expect(browse(page)).toHaveCount(2)
  await shoot(page, 'data')

  await page.getByRole('link', { name: 'Rules', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Rules', exact: true })).toBeVisible()
  await expect(page.locator('.sr6-creation')).toHaveCount(0) // book content only
  await expect(page.getByLabel('Chapter')).toContainText('GAME CONCEPTS')
  await expect(page.locator('.rule-toc li', { hasText: 'Trouble Dice' })).toBeVisible()
  await page.getByLabel('Search the rules').fill('invented rule')
  await expect(page.locator('.rule-toc li')).toHaveCount(1)
  await page.getByRole('link', { name: 'Making Trouble' }).click()
  await expect(page.locator('dialog.drawer .prose')).toHaveText('Invented rule text about trouble.')
  await page.keyboard.press('Escape')
  await page.getByLabel('Search the rules').fill('')
  await shoot(page, 'rules')

  // the creation rules, on Table setup (Game data points there): a refused page, then a value with its source and page,
  // kept over a reload
  await page.getByRole('link', { name: 'Game data', exact: true }).click()
  await page.getByRole('link', { name: 'open the creation settings' }).click()
  await expect(page).toHaveURL(/#\/sr6\/table$/)
  await expect(page.getByRole('heading', { name: 'Table setup', level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Table setup' })).toHaveAttribute('aria-current', 'page')
  const cap = page.getByLabel('Highest skill rank', { exact: true })
  // nine sections, folded: a closed section draws no rows; the search finds a setting by name and opens its section
  const openAll = () => page.getByRole('button', { name: 'Open all sections' }).click()
  await expect(page.locator('.sr6-creation details.fold.sub > summary h3')).toHaveText([
    'Budgets & priorities',
    'Attributes & skills',
    'Qualities',
    'Magic & Resonance',
    'Gear & augmentations',
    'Contacts & lifestyle',
    'Levels of play',
    'Optional rules (book)',
    'House rules',
    'App conveniences',
  ])
  await expect(page.locator('.sr6-creation .cr-row')).toHaveCount(0)
  await page.getByLabel('Search the settings').fill('highest skill rank')
  await expect(cap).toBeVisible()
  await expect(page.locator('.sr6-creation .cr-row').first()).toContainText('Highest skill rank')
  await page.getByLabel('Search the settings').fill('')
  await expect(cap).toHaveCount(0)
  await openAll()
  await cap.fill('5')
  await page.getByLabel('Highest skill rank: page', { exact: true }).fill('0')
  await page.getByRole('button', { name: 'Save creation rules' }).click()
  await expect(page.locator('.sr6-creation [role=alert]')).toContainText('skillCap')
  await page.getByLabel('Highest skill rank: source', { exact: true }).fill('crb')
  await page.getByLabel('Highest skill rank: page', { exact: true }).fill('61')
  await page.getByLabel('Aptitude quality', { exact: true }).selectOption({ label: 'Knack' })
  await page.getByRole('button', { name: 'Save creation rules' }).click()
  await expect(page.getByText('Creation rules saved.')).toBeVisible()
  await page.reload()
  await openAll()
  await expect(cap).toHaveValue('5')
  await expect(page.getByLabel('Highest skill rank: source', { exact: true })).toHaveValue('CRB')
  await expect(page.getByLabel('Aptitude quality', { exact: true })).toHaveValue('crb.knack')
  expect(await (await page.request.get('/custom/sr6/creation.xml')).text()).toContain('<setting key="skillCap" value="5" source="CRB" page="61"/>')

  // Load settings file: a file of another kind is refused; a creation.xml fills the form for review, saved only on Save
  const load = page.getByLabel('Load settings file')
  await load.setInputFiles({ name: 'notes.xml', mimeType: 'application/xml', buffer: Buffer.from('<tablerules/>') })
  await expect(page.locator('.sr6-creation [role=alert]')).toContainText('notes.xml isn’t a creation rules file')
  await load.setInputFiles({
    name: 'made-up-creation.xml',
    mimeType: 'application/xml',
    buffer: Buffer.from(
      '<?xml version="1.0"?>' +
        '<sr6:creation xmlns:sr6="urn:chummer-sr6:config:1" version="1"><setting key="startingKarma" value="33" source="HOUSE" page="7"/>' +
        '<setting key="skillCap" value="6"/><setting key="noSuchSetting" value="1"/></sr6:creation>',
    ),
  })
  await expect(page.locator('.sr6-creation [role=status]')).toContainText('Loaded 2 settings from made-up-creation.xml')
  await expect(page.getByLabel('Starting karma', { exact: true })).toHaveValue('33')
  await expect(page.getByLabel('Starting karma: source', { exact: true })).toHaveValue('HOUSE')
  await expect(cap).toHaveValue('6')
  await expect(page.getByLabel('Aptitude quality', { exact: true })).toHaveValue('crb.aptitude-skill') // not in the file: the standard
  await expect(page.locator('.sr6-creation .warn')).toContainText('“noSuchSetting” isn’t a creation setting.')
  await page.locator('.sr6-creation').screenshot({ path: `${SHOTS}/creation-loaded.png` })
  expect(await (await page.request.get('/custom/sr6/creation.xml')).text()).toContain('<setting key="skillCap" value="5" source="CRB" page="61"/>')
  await page.reload() // not saved: the server's settings are as they were
  await openAll()
  await expect(cap).toHaveValue('5')
  // the Standard column: a changed value shows the standard and resets to it in the form (saved only on Save)
  const capRow = page.locator('.sr6-creation .cr-row', { has: cap })
  await expect(capRow).toHaveClass(/changed/)
  await expect(capRow.locator('.cr-std')).toContainText('Standard: 6 (CRB-HK p. 65)')
  await page.screenshot({ path: `${SHOTS}/creation-changed-row.png` })
  await capRow.getByRole('button', { name: 'Reset Highest skill rank to standard' }).click()
  await expect(cap).toHaveValue('6')
  await expect(capRow).toHaveClass(/at-std/)
  await expect(capRow.locator('.cr-std')).toHaveCount(0)
  // Reset section: this section's changed values back to the standard, the others' left alone
  await cap.fill('4')
  const attrs = page.locator('details.fold.sub[data-section="Attributes & skills"]')
  await expect(attrs.locator('.cr-changed')).toHaveText('1 changed')
  await attrs.getByRole('button', { name: 'Reset section Attributes & skills' }).click()
  await expect(cap).toHaveValue('6')
  await expect(attrs.locator('.cr-changed')).toHaveCount(0)
  await page.getByRole('button', { name: 'Reset all to standard' }).click()
  await expect(page.getByLabel('Aptitude quality', { exact: true })).toHaveValue('crb.aptitude-skill')
  await expect(page.getByRole('button', { name: 'Reset all to standard' })).toBeDisabled()
  await page.reload()
  await openAll()
  await expect(cap).toHaveValue('5')
  await page.locator('.sr6-creation').screenshot({ path: `${SHOTS}/creation-rules.png` })
  await shoot(page, 'table-setup')

  // folded (the page as it opens), then a house rule's switch with its numbers waiting for it (screenshots for the release notes)
  const U = '.extract/screenshots/ui0131'
  mkdirSync(U, { recursive: true })
  await page.reload()
  await expect(page.locator('.sr6-creation details.fold.sub')).toHaveCount(10)
  await shoot(page, 'table-setup-folded', U)
  const house = page.locator('details.fold.sub[data-section="House rules"]')
  await house.locator('summary').click()
  const carry = house.getByRole('switch', { name: /^Own carry-over limits: the Karma/ }),
    most = house.getByLabel('Own carry-over limits: most Karma kept', { exact: true })
  await expect(carry).not.toBeChecked()
  await expect(most).toBeDisabled()
  await carry.check()
  await expect(most).toBeEnabled()
  await most.fill('9')
  await expect(house.locator('.cr-row.changed')).toHaveCount(2)
  await house.scrollIntoViewIfNeeded()
  await house.screenshot({ path: `${U}/house-rules-desktop.png` })
  await page.setViewportSize(PHONE)
  await fits(page)
  await house.screenshot({ path: `${U}/house-rules-phone.png` })
  await page.setViewportSize(DESK)
  await page.getByLabel('Search the settings').fill('contact')
  await expect(page.locator('.sr6-creation .cr-row').first()).toBeVisible()
  await page.locator('.sr6-creation').screenshot({ path: `${U}/search-contact.png` })
})

test('editor: edit a weapon’s cost, see it Edited, restore the book version', async ({ page }) => {
  await signIn(page, '/#/sr6/data', 'eve')
  expect(await labels(page)).toEqual([
    'Your runners',
    'Vehicle designer',
    'Drone designer',
    'Weapon designer',
    'Cyberware designer',
    'NPCs & Critters',
    'Compendiums',
    'Campaigns',
    'Rules',
    'Game data',
    'Table setup',
  ])
  const gun = await findWeapon(page, 'Zap Gun')
  await gun.getByRole('button', { name: 'Edit Zap Gun' }).click()
  const form = page.getByRole('dialog')
  await expect(form.getByLabel('cost', { exact: true })).toHaveValue('320')
  await expect(form.getByLabel('Description')).toHaveValue('A made-up gun that zaps.')
  await form.getByLabel('Name', { exact: true }).fill('REFUSE me')
  await form.getByRole('button', { name: 'Save changes' }).click()
  await expect(form.getByRole('alert')).toContainText('unknown effect ref "stub-refusal"')
  await form.getByLabel('Name', { exact: true }).fill('Zap Gun')
  await form.getByLabel('cost', { exact: true }).fill('275')
  await shoot(page, 'edit-dialog')
  await form.getByRole('button', { name: 'Save changes' }).click()
  await expect(form).toBeHidden()
  await expect(gun).toContainText('cost 275')
  await expect(gun.locator('.edited')).toHaveText('Edited')
  await expect(page.locator('.sr6-edits tr', { hasText: 'Zap Gun' })).toContainText('Changed from the book')

  await page.reload()
  await expect(await findWeapon(page, 'Zap Gun')).toContainText('cost 275')
  await gun.getByRole('button', { name: 'Edit Zap Gun' }).click()
  await expect(form.getByText('Changed from the book')).toBeVisible()
  await expect(form.getByLabel('Description')).toHaveValue('A made-up gun that zaps.') // the book's text: the edit had none
  page.once('dialog', d => d.accept())
  await form.getByRole('button', { name: 'Restore book version' }).click()
  await expect(form).toBeHidden()
  await expect(gun).toContainText('cost 320')
  await expect(gun.locator('.edited')).toHaveCount(0)
  await expect(page.locator('.sr6-edits')).toHaveCount(0)

  // the creation rules are the admin's: on Table setup, read only for an editor, who sets a campaign's own on its page
  await page.getByRole('link', { name: 'Table setup' }).click()
  await page.getByRole('button', { name: 'Open all sections' }).click()
  await expect(page.getByLabel('Highest skill rank', { exact: true })).toHaveValue('5')
  await expect(page.getByLabel('Highest skill rank', { exact: true })).toBeDisabled()
  await expect(page.getByRole('switch', { name: /^Stacking Advantage/ })).toBeDisabled() // the switches too
  await expect(page.getByRole('button', { name: 'Save creation rules' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'its campaign page' })).toHaveAttribute('href', '#/sr6/campaigns')
})

test('player: Table setup (read only), Rules and Game data, no Books and no Edit buttons', async ({ page }) => {
  await signIn(page, '/#/sr6/data', 'pat')
  expect(await labels(page)).toEqual([
    'Your runners',
    'Vehicle designer',
    'Drone designer',
    'Weapon designer',
    'Cyberware designer',
    'Campaigns',
    'Rules',
    'Game data',
    'Table setup',
  ])
  await expect(await findWeapon(page, 'Zap Gun')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Edit / })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Your catalog edits' })).toHaveCount(0)
  await page.getByRole('link', { name: 'Table setup' }).click()
  await expect(page).toHaveURL(/#\/sr6\/table$/)
  await expect(page.getByRole('heading', { name: 'Table setup', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: 'Open all sections' }).click()
  await expect(page.getByLabel('Highest skill rank', { exact: true })).toHaveValue('5') // the settings in effect, read only
  await expect(page.getByLabel('Highest skill rank', { exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Save creation rules' })).toHaveCount(0)
  await page.locator('.sr6-creation').screenshot({ path: `${SHOTS}/table-setup-player.png` })
  await page.getByRole('link', { name: 'Rules', exact: true }).click()
  await page.getByRole('link', { name: 'Making Trouble' }).click()
  // the Rules page now mounts two drawer dialogs (rules + traditions); target the open one
  await expect(page.locator('dialog.drawer[open]')).toContainText('Invented rule text about trouble.')
  await page.goto('/#/sr6/books')
  await expect(page.getByText('No runners yet.')).toBeVisible()
  await expect(page.getByLabel('Choose PDF files')).toHaveCount(0)
})

test('isolation: Anarchy shows nothing of SR6; /custom/sr6/campaigns.xml is never served', async ({ page }) => {
  await signIn(page, '/#/data', 'ada')
  await expect(page.getByRole('heading', { name: 'Game data' })).toBeVisible()
  await expect(page.locator('main')).not.toContainText('Sixth World')
  await page.goto('/#/books')
  await expect(page.getByRole('heading', { name: 'Your books' })).toBeVisible()
  await expect(page.locator('.book', { hasText: 'made-up-sr6' })).toHaveCount(0)
  expect((await page.request.get('/custom/sr6/campaigns.xml')).status()).toBe(404)
  expect((await page.request.get('/custom/sr6/imported/crb/weapons.xml')).status()).toBe(200)
})

test('removing the book empties SR6 Game data', async ({ page }) => {
  await signIn(page, '/#/sr6/books', 'ada')
  const row = page.locator('.book', { hasText: 'made-up-sr6.pdf' })
  await row.getByRole('button', { name: 'Remove' }).click()
  await expect(page.getByRole('dialog')).toContainText('Its catalog entries and descriptions leave the app.')
  await page.getByLabel('Also delete the PDF and its text').check()
  await page.getByRole('button', { name: 'Remove book' }).click()
  await expect(row).toHaveCount(0, { timeout: 10000 })
  await page.getByRole('link', { name: 'Game data' }).click()
  await expect(page.getByText('No SR6 data yet.')).toBeVisible()
  await page.getByRole('link', { name: 'Rules', exact: true }).click()
  await expect(page.getByText('No SR6 rules yet.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Books page' })).toHaveAttribute('href', '#/sr6/books')
})
