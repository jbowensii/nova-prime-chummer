import { test, expect, type Page } from '@playwright/test'
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { usersFile } from '../server/auth.mjs'
import { createServer } from '../server/server.mjs'

// Campaigns and Ask the rules end to end, on a server of its own (all names made up): Eve, an editor, runs a campaign;
// Pat and Kim play in it; Ada is the admin. An AI provider is set up with a made-up key, and the stub worker
// (tests/fixtures/stub-worker.mjs) answers questions: "laser" isn't covered. Pat may ask 2 questions a day. Runs in order.
// Screenshots go to .extract/ (not committed).
const PW = { ada: 'ada-password-1', eve: 'eve-password-1', pat: 'pat-password-1', kim: 'kim-password-1' }
const SHOTS = '.extract/screenshots/0.5.0'
const PHONE = { width: 390, height: 844 }
const CAMPAIGN = 'Neon Nights'
let server: ReturnType<typeof createServer>, base = ''

test.describe.configure({ mode: 'serial' })
test.use({ baseURL: async ({}, use) => use(base), storageState: { cookies: [], origins: [] } })

test.beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ca2-campaigns-')), config = join(dir, 'library', '.config')
  cpSync('tests/fixtures/mini/custom', join(dir, 'custom'), { recursive: true })
  mkdirSync(config, { recursive: true })
  writeFileSync(join(config, 'users.xml'), await usersFile([{ username: 'ada', password: PW.ada, name: 'Ada Admin' },
    { username: 'eve', password: PW.eve, role: 'editor', name: 'Eve Editor' },
    { username: 'pat', password: PW.pat, role: 'player', name: 'Pat Player', dailyQuestions: 2 },
    { username: 'kim', password: PW.kim, role: 'player', name: 'Kim Player' }]))
  writeFileSync(join(config, 'ai-providers.xml'), '<ca2:aiproviders xmlns:ca2="urn:chummer-anarchy2:config:1" version="1" use="anthropic"><provider id="anthropic" enabled="true"/></ca2:aiproviders>\n')
  writeFileSync(join(config, 'ai-keys.xml'), // a made-up key: the stub sends nothing anywhere
    '<ca2:aikeys xmlns:ca2="urn:chummer-anarchy2:config:1" version="1"><key provider="anthropic">sk-ant-e2e-not-a-real-key</key></ca2:aikeys>\n')
  server = createServer({ staticDir: 'dist', charDir: join(dir, 'characters'), customDir: join(dir, 'custom'), libraryDir: join(dir, 'library'),
    python: [process.execPath, 'tests/fixtures/stub-worker.mjs'] })
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
async function newRunner(page: Page, name: string) {
  await page.getByRole('button', { name: 'New runner' }).click()
  await page.getByRole('button', { name: 'Create runner' }).click()
  const saved = page.waitForResponse(r => r.request().method() === 'PUT' && !!r.request().postData()?.includes(`streetName="${name}"`))
  await page.getByLabel('Street name').fill(name)
  expect((await saved).status()).toBeLessThan(300)
  await page.goto('/')
}
const dossier = (page: Page, name: string) => page.locator('.dossier').filter({ has: page.getByRole('link', { name, exact: true }) })
async function join_(page: Page, row: ReturnType<typeof dossier>) {
  await row.getByRole('button', { name: 'Add to campaign…' }).click()
  const d = page.getByRole('dialog', { name: /^Add .* to a campaign$/ })
  await d.getByLabel('Campaign').selectOption({ label: CAMPAIGN })
  await d.getByRole('button', { name: 'Add to campaign' }).click()
  await expect(row.getByRole('link', { name: CAMPAIGN })).toBeVisible()
}
const openCampaign = async (page: Page) => { await page.goto('/#/campaigns'); await page.getByRole('link', { name: CAMPAIGN }).click()
  await expect(page.getByRole('heading', { name: CAMPAIGN, level: 1 })).toBeVisible() }
/** Light, dark and phone (dark) screenshots of the page as it is; the phone one must not scroll sideways. */
async function shots(page: Page, name: string) {
  const theme = (t: string) => page.evaluate(t => { localStorage.setItem('ca2.settings.v1', JSON.stringify({ theme: t })); document.documentElement.dataset.theme = t }, t)
  await theme('light')
  await page.screenshot({ path: `${SHOTS}/${name}-light.png`, fullPage: true })
  await theme('dark')
  await page.screenshot({ path: `${SHOTS}/${name}-dark.png`, fullPage: true })
  await page.setViewportSize(PHONE)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${name} scrolls sideways`).toBeLessThanOrEqual(0)
  await page.screenshot({ path: `${SHOTS}/${name}-phone.png`, fullPage: true })
  await page.setViewportSize({ width: 1400, height: 900 })
  await theme('light')
}

test('an editor starts a campaign and adds two players; a player can’t start one', async ({ page }) => {
  await signIn(page, 'pat')
  await page.getByRole('link', { name: 'Campaigns' }).click()
  await expect(page.getByText('You’re not in a campaign yet. A GM adds you to theirs.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'New campaign' })).toHaveCount(0)

  await signIn(page, 'eve')
  await page.getByRole('link', { name: 'Campaigns' }).click()
  await page.getByRole('button', { name: 'New campaign' }).click()
  const d = page.getByRole('dialog', { name: 'New campaign' })
  await d.getByLabel('Name').fill(CAMPAIGN)
  await d.getByLabel('Note for the table (optional)').fill('Session zero on Friday.\n<b>Bring dice.</b>')
  await d.getByRole('button', { name: 'Create campaign' }).click()
  await expect(page.getByRole('heading', { name: CAMPAIGN, level: 1 })).toBeVisible()
  await expect(page.getByText('<b>Bring dice.</b>')).toBeVisible() // the note is plain text
  for (const u of ['pat', 'kim']) {
    await page.getByLabel('Add a player by username').fill(u)
    await page.getByRole('button', { name: 'Add player' }).click()
    await expect(page.getByRole('status')).toHaveText(`Added ${u}.`)
  }
  await page.getByLabel('Add a player by username').fill('nobody')
  await page.getByRole('button', { name: 'Add player' }).click()
  await expect(page.getByRole('alert')).toHaveText('No such account.')
  await expect(page.getByLabel('Add a co-GM')).toHaveCount(0) // the admin adds co-GMs
})

test('players put runners in the campaign, an example copy too; the list shows the tag and filters by campaign', async ({ page }) => {
  await signIn(page, 'kim')
  await newRunner(page, 'Glitch')
  await join_(page, dossier(page, 'Glitch'))

  await signIn(page, 'pat')
  await newRunner(page, 'Ratchet')
  await join_(page, dossier(page, 'Ratchet'))
  await page.getByRole('button', { name: 'Load example characters' }).click()
  await expect(page.getByRole('status')).toHaveText(/^Added \d example characters?\.$/)
  const face = dossier(page, 'Test Face').first()
  await join_(page, face) // the example's copy is Pat's own
  await expect(page.locator('.dossier', { hasText: CAMPAIGN })).toHaveCount(2)
  await page.getByLabel('Show').selectOption({ label: CAMPAIGN })
  await expect(page.locator('.dossier')).toHaveCount(2)
  await page.getByLabel('Show').selectOption({ label: 'Not in a campaign' })
  await expect(page.locator('.dossier', { hasText: CAMPAIGN })).toHaveCount(0)
  await page.getByLabel('Show').selectOption({ label: 'Every runner' })
  await shots(page, 'runners-campaign-tags')

  // one campaign per runner: a copy is in none
  await dossier(page, 'Ratchet').getByRole('button', { name: 'Duplicate' }).click()
  const copy = dossier(page, 'Ratchet (copy)')
  await expect(copy.getByRole('button', { name: 'Add to campaign…' })).toBeVisible()
  await expect(copy.getByRole('link', { name: CAMPAIGN })).toHaveCount(0)
})

test('a player sees the roster only: names and archetypes of the others, their own runner to open', async ({ page }) => {
  await signIn(page, 'pat')
  await openCampaign(page)
  await expect(page.getByRole('heading', { name: 'Kim Player' })).toBeVisible()
  await expect(page.getByText('Glitch', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Glitch' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Print Glitch' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Ratchet', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'GM tools' })).toHaveCount(0)
  await expect(page.getByLabel('Add a player by username')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Remove Glitch from the campaign' })).toHaveCount(0)
  await shots(page, 'campaign-player')
  expect((await page.request.get(`${base}api/characters`)).status()).toBe(200)
  const theirs = await (await page.request.get(`${base}api/characters`)).json() as { xml: string }[]
  expect(theirs.some(r => r.xml.includes('Glitch'))).toBe(false) // no sheet of anyone else's
})

test('the GM opens every runner read-only and prints it; sees them in the runner list', async ({ page }) => {
  await signIn(page, 'eve')
  await expect(page.getByRole('heading', { name: 'Pat Player’s runners' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Ratchet (copy)' })).toHaveCount(0) // not in the campaign: not Eve's to read
  await page.goto('/#/npcs')
  await page.getByRole('button', { name: 'New NPC' }).click()
  await page.getByRole('dialog', { name: 'New NPC' }).getByRole('button', { name: 'Create NPC' }).click()
  await page.getByLabel('Street name').fill('Table Goon')
  await expect(page.getByRole('status', { name: 'Save status' })).toContainText('All changes saved')
  await page.goto('/#/npcs')
  await dossier(page, 'Table Goon').getByRole('button', { name: 'Share Table Goon…' }).click()
  const share = page.getByRole('dialog', { name: 'Share Table Goon with a campaign' })
  await share.getByLabel('Campaign').selectOption({ label: CAMPAIGN })
  await share.getByRole('button', { name: 'Share' }).click()
  await expect(page.getByRole('status')).toHaveText(`Table Goon is shared with ${CAMPAIGN}.`)
  await openCampaign(page)
  await expect(page.getByRole('heading', { name: 'NPCs', level: 2 })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Table Goon' })).toHaveAttribute('href', /^#\/n\/[^/]+\/concept$/)
  await expect(page.getByRole('link', { name: 'Print Glitch' })).toBeVisible()
  await shots(page, 'campaign-gm')
  await page.getByRole('link', { name: 'Ratchet', exact: true }).click()
  await expect(page.getByText('Read only — Pat Player’s runner.')).toBeVisible()
  await openCampaign(page)
  await page.getByRole('link', { name: 'Print Ratchet' }).click()
  await expect(page.locator('.sheet, main').first()).toContainText('Ratchet')
  await signIn(page, 'pat') // a member's view never lists the NPCs
  await openCampaign(page)
  await expect(page.getByRole('heading', { name: 'NPCs', level: 2 })).toHaveCount(0)
  await expect(page.getByText('Table Goon')).toHaveCount(0)
  expect(JSON.stringify(await (await page.request.get(`${base}api/campaigns`)).json())).not.toContain('Table Goon')
})

test('the admin sees every campaign, adds a co-GM; the GM removes a player, whose runner leaves; archive and delete', async ({ page }) => {
  await signIn(page, 'ada')
  await openCampaign(page)
  await expect(page.getByRole('link', { name: 'Print Glitch' })).toBeVisible()
  await page.getByLabel('Add a co-GM').selectOption({ label: 'Ada Admin (ada)' })
  await page.getByRole('button', { name: 'Add co-GM' }).click()
  await expect(page.getByRole('heading', { name: 'Game masters' })).toBeVisible()
  await page.getByRole('button', { name: 'Remove Ada Admin as GM' }).click()
  await expect(page.getByRole('heading', { name: 'Game master', exact: true })).toBeVisible()

  await signIn(page, 'eve')
  await openCampaign(page)
  await page.getByRole('button', { name: 'Remove Kim Player' }).click()
  await page.getByRole('dialog', { name: 'Remove Kim Player?' }).getByRole('button', { name: 'Remove player' }).click()
  await expect(page.getByRole('status')).toHaveText('Kim Player left the campaign.')
  await expect(page.getByText('Glitch', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Delete campaign' })).toBeDisabled()
  await page.getByRole('button', { name: 'Archive' }).click()
  await expect(page.getByText('Archived', { exact: true })).toBeVisible()

  await signIn(page, 'pat')
  await expect(dossier(page, 'Ratchet (copy)').getByRole('button', { name: 'Add to campaign…' })).toHaveCount(0) // archived: nothing to join
  await dossier(page, 'Ratchet').getByRole('button', { name: 'Remove from campaign' }).click()
  await expect(page.getByRole('status')).toHaveText(`Ratchet left ${CAMPAIGN}.`)
  await dossier(page, 'Test Face').getByRole('button', { name: 'Remove from campaign' }).click()

  await signIn(page, 'eve')
  await page.goto('/#/campaigns')
  await expect(page.getByText('No campaigns yet. Start one, then add your players.')).toBeVisible() // archived ones are hidden
  await page.getByLabel('Show archived campaigns').check()
  await page.getByRole('link', { name: CAMPAIGN }).click()
  await page.getByRole('button', { name: 'Delete campaign' }).click()
  await page.getByRole('dialog', { name: `Delete ${CAMPAIGN}?` }).getByRole('button', { name: 'Delete campaign' }).click()
  await expect(page.getByRole('heading', { name: 'Campaigns', level: 1 })).toBeVisible()
  await expect(page.getByLabel('Show archived campaigns')).toHaveCount(0)
})

test('ask the rules: the bar in the builder, answers with sources, not covered, and the daily limit', async ({ page }) => {
  await signIn(page, 'pat')
  await page.getByRole('link', { name: 'Ratchet', exact: true }).click()
  const bar = page.getByRole('search', { name: 'Ask the rules' })
  await bar.getByRole('textbox').fill('What happens when I jump a puddle?')
  await bar.getByRole('button', { name: 'Ask' }).click()
  await expect(page.getByText('Invented answer [ZZ p.61].')).toBeVisible()
  await expect(page.getByText('Sources: ZZ p.61')).toBeVisible()
  await expect(page.getByText('1 question left today.')).toBeVisible()
  await shots(page, 'ask-bar')
  await bar.getByRole('textbox').fill('Does a laser work underwater?')
  await bar.getByRole('button', { name: 'Ask' }).click()
  await expect(page.getByText('The books on this server don’t cover that.')).toBeVisible()
  await expect(page.getByText('Invented answer [ZZ p.61].')).toHaveCount(0) // asking again cleared it
  await expect(page.getByText('1 question left today.')).toBeVisible() // not covered without asking the AI: free
  await bar.getByRole('textbox').fill('And a puddle again?')
  await bar.getByRole('button', { name: 'Ask' }).click()
  await expect(page.getByText('No questions left today.')).toBeVisible()
  await bar.getByRole('button', { name: 'Ask' }).click()
  await expect(page.getByRole('alert')).toHaveText('You’ve used all 2 of today’s questions. Ask again tomorrow.')
  expect(await page.evaluate(() => [Object.keys(localStorage).filter(k => k !== 'ca2.settings.v1'), sessionStorage.length])).toEqual([[], 0])
})

test('ask the rules: the header’s drawer keeps focus, closes with Esc and forgets the answer', async ({ page }) => {
  await signIn(page, 'kim')
  await page.getByRole('button', { name: 'Ask the rules' }).click()
  const drawer = page.getByRole('dialog', { name: 'Ask the rules' })
  const q = drawer.getByRole('textbox', { name: 'Ask the rules' })
  await expect(q).toBeFocused()
  await q.fill('What happens when I jump a puddle?')
  await q.press('Enter')
  await expect(drawer.getByText('Invented answer [ZZ p.61].')).toBeVisible()
  await shots(page, 'ask-drawer')
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true)
  }
  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
  await expect(page.getByRole('button', { name: 'Ask the rules' })).toBeFocused()
  await page.getByRole('button', { name: 'Ask the rules' }).click()
  await expect(drawer.getByRole('textbox', { name: 'Ask the rules' })).toHaveValue('')
  await expect(drawer.getByText('Invented answer [ZZ p.61].')).toHaveCount(0)
  await drawer.getByRole('button', { name: 'Close' }).click()
  await expect(drawer).toBeHidden()
})
