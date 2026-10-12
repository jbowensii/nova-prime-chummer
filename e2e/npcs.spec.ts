import { test, expect, type Page, type Route } from '@playwright/test'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { usersFile } from '../server/auth.mjs'
import { createServer } from '../server/server.mjs'
import { anarchyState, savedOnServer } from './session'

// 0.7.0 NPCs & Critters end to end, on a server of its own (all names made up): Eve and Gus are editors (GMs), Ada the
// admin, Pat a player. Runs in order. Screenshots go to .extract/ (not committed).
const PW = { ada: 'ada-password-1', eve: 'eve-password-1', gus: 'gus-password-1', pat: 'pat-password-1' }
const SHOTS = '.extract/screenshots/0.7.0'
let server: ReturnType<typeof createServer>,
  base = '',
  origin = ''

test.describe.configure({ mode: 'serial' })
test.use({ baseURL: async ({}, use) => use(base), storageState: async ({}, use) => use(anarchyState(base)) })

test.beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ca2-npcs-e2e-')),
    config = join(dir, 'library', '.config')
  cpSync('tests/fixtures/mini/custom', join(dir, 'custom'), { recursive: true })
  mkdirSync(config, { recursive: true })
  writeFileSync(
    join(config, 'users.xml'),
    await usersFile([
      { username: 'ada', password: PW.ada, name: 'Ada Admin' },
      { username: 'eve', password: PW.eve, role: 'editor', name: 'Eve Editor' },
      { username: 'gus', password: PW.gus, role: 'editor', name: 'Gus Editor' },
      { username: 'pat', password: PW.pat, role: 'player', name: 'Pat Player' },
    ]),
  )
  server = createServer({ staticDir: 'dist', charDir: join(dir, 'characters'), customDir: join(dir, 'custom'), libraryDir: join(dir, 'library') })
  await new Promise<void>((ok, fail) => server.once('error', fail).listen(0, '127.0.0.1', ok))
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  base = `${origin}/`
  mkdirSync(SHOTS, { recursive: true })
})
test.afterAll(() => {
  server.stopJobs()
  server.close()
})

async function signIn(page: Page, username: keyof typeof PW) {
  await page.context().clearCookies()
  await page.goto('/')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password', { exact: true }).fill(PW[username])
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Your runners' })).toBeVisible()
}
const api = (page: Page, method: string, path: string, data?: unknown) =>
  page.request.fetch(`${base}api/${path}`, { method, data, headers: { Origin: origin } })
const saved = (page: Page) => expect(page.getByRole('status', { name: 'Save status' })).toContainText('All changes saved')
const row = (page: Page, name: string) => page.locator('.dossier').filter({ has: page.getByRole('link', { name, exact: true }) })
const sections = (page: Page) => page.getByRole('navigation', { name: 'NPCs or critters' })
/** New NPC on the NPCs section; a critter or spirit: New critter on the Critters section */
async function newNpc(page: Page, kind: string, tier: string, meta?: string) {
  const noun = kind === 'NPC' ? 'NPC' : 'critter'
  await page.goto(kind === 'NPC' ? '/#/npcs' : '/#/npcs/critters')
  await page.getByRole('button', { name: `New ${noun}` }).click()
  const d = page.getByRole('dialog', { name: `New ${noun}` })
  await expect(d.getByLabel('Kind').locator('option')).toHaveText(kind === 'NPC' ? ['NPC'] : ['Critter', 'Spirit'])
  await d.getByLabel('Kind').selectOption({ label: kind })
  await d.getByLabel('Tier').selectOption({ label: tier })
  if (meta) await d.getByLabel('Metatype').selectOption({ label: meta })
  await d.getByRole('button', { name: `Create ${noun}` }).click()
  await expect(page).toHaveURL(/#\/n\/[^/]+\/concept$/)
}
async function shots(page: Page, name: string) {
  const theme = (t: string) =>
    page.evaluate(t => {
      localStorage.setItem('ca2.settings.v1', JSON.stringify({ theme: t }))
      document.documentElement.dataset.theme = t
    }, t)
  await theme('light')
  await page.screenshot({ path: `${SHOTS}/${name}-light.png`, fullPage: true })
  await theme('dark')
  await page.screenshot({ path: `${SHOTS}/${name}-dark.png`, fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${name} scrolls sideways`).toBeLessThanOrEqual(0)
  await page.screenshot({ path: `${SHOTS}/${name}-phone.png`, fullPage: true })
  await page.setViewportSize({ width: 1400, height: 900 })
  await theme('light')
}
const NPC_FILE = `<?xml version="1.0" encoding="UTF-8"?>
<ca2:character xmlns:ca2="urn:chummer-anarchy2:character:1" formatVersion="1" id="npc-wisp-1" streetName="Made-up Wisp" metatype="" level="runner" package="free" finalizedAt="2026-10-01T00:00:00.000Z" updatedAt="2026-10-02T00:00:00.000Z">
  <npc kind="spirit" tier="regular" fightingSpirit="low"/>
  <build><attributes str="2" agi="5" wil="4" log="3" cha="3"/></build>
</ca2:character>
`
const RUNNER_FILE = NPC_FILE.replace(/ {2}<npc[^\n]*\n/, '')
  .replace('npc-wisp-1', 'runner-1')
  .replace('Made-up Wisp', 'Plain Runner')
  .replace('metatype=""', 'metatype="human"')

test('an editor makes a regular NPC: NPC mode editor, it saves and lists; the runner list never shows it', async ({ page }) => {
  await signIn(page, 'eve')
  await page.getByRole('link', { name: 'NPCs' }).click()
  await expect(page.getByRole('heading', { name: 'NPCs & Critters' })).toBeVisible()
  await newNpc(page, 'NPC', 'Regular')
  await page.getByLabel('Street name').fill('Ganger Boss')
  await page.getByLabel('Fighting spirit').selectOption('high')
  await expect(page.getByLabel('Level of play')).toHaveCount(0)
  await expect(page.locator('.topbar .npckind')).toHaveText('NPC')
  await expect(page.locator('.topbar .npctier')).toHaveText('Regular')
  await expect(page.locator('aside.receipt')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Ledger' })).toHaveCount(0)
  await saved(page)
  await shots(page, 'npc-concept')

  await page.getByRole('link', { name: 'Attributes' }).click()
  await page.getByRole('button', { name: 'Raise Brawn' }).click()
  await page.getByRole('link', { name: 'Skills' }).click()
  await page.getByLabel('New knowledge skill').fill('Gang turf')
  await page.getByRole('button', { name: /^Add knowledge skill/ }).click()
  await page.getByRole('link', { name: 'Review' }).click()
  await expect(page.getByRole('heading', { name: 'Finalize' })).toHaveCount(0)
  await saved(page)
  await page.getByRole('button', { name: 'Save and close' }).click()
  await expect(page).toHaveURL(/#\/npcs$/)
  const r = row(page, 'Ganger Boss')
  await expect(r.locator('.npckind')).toHaveText('NPC')
  await expect(r.locator('.npctier')).toHaveText('Regular')

  await r.getByRole('link', { name: 'Ganger Boss' }).click()
  await expect(page.getByLabel('Fighting spirit')).toHaveValue('high')
  await page.getByRole('link', { name: 'Skills' }).click()
  await expect(page.getByRole('table', { name: 'Knowledge' }).locator('input').first()).toHaveValue('Gang turf')

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Your runners' })).toBeVisible()
  await expect(page.getByText('Ganger Boss')).toHaveCount(0)
})

test('a critter with no metatype; import an NPC file (a runner file is refused); export for Foundry carries npc', async ({ page }) => {
  await signIn(page, 'eve')
  await newNpc(page, 'Critter', 'Prime')
  await expect(page.getByLabel('Metatype')).toHaveValue('')
  await page.getByLabel('Street name').fill('Made-up Hound')
  await page.getByRole('link', { name: 'Attributes' }).click()
  for (let i = 0; i < 8; i++) await page.getByRole('button', { name: 'Raise Brawn' }).click()
  await saved(page)
  // a critter lists under Critters, not NPCs: Save and close goes there
  await page.getByRole('button', { name: 'Save and close' }).click()
  await expect(page).toHaveURL(/#\/npcs\/critters$/)
  await expect(sections(page).getByRole('link', { name: /^Critters/ })).toHaveAttribute('aria-current', 'page')
  await expect(row(page, 'Made-up Hound').locator('.meta')).toContainText('Critter')
  await expect(sections(page).getByRole('link')).toHaveText(['NPCs1', 'Critters1'])

  await page.locator('input[type=file]').setInputFiles([
    { name: 'wisp.xml', mimeType: 'application/xml', buffer: Buffer.from(NPC_FILE) },
    { name: 'runner.xml', mimeType: 'application/xml', buffer: Buffer.from(RUNNER_FILE) },
  ])
  const msg = page.getByRole('status')
  await expect(msg).toContainText('Imported Made-up Wisp.')
  await expect(msg).toContainText('runner.xml: this is a runner, not an NPC')
  await expect(row(page, 'Made-up Wisp').locator('.npckind')).toHaveText('Spirit')
  await sections(page).getByRole('link', { name: /^NPCs/ }).click()
  await expect(row(page, 'Made-up Wisp')).toHaveCount(0)
  await expect(row(page, 'Ganger Boss')).toHaveCount(1)
  await sections(page)
    .getByRole('link', { name: /^Critters/ })
    .click()
  // an NPC has no career: the imported file's Finalize doesn't come along
  const wisp = (await (await api(page, 'GET', 'npcs')).json()).find((r: { xml: string }) => r.xml.includes('Made-up Wisp'))
  expect(wisp.xml).not.toContain('finalizedAt')
  await shots(page, 'npcs-list')

  await page.getByRole('button', { name: 'Export for Foundry…' }).click()
  const d = page.getByRole('dialog', { name: 'Export NPCs for Foundry' })
  await d.getByRole('button', { name: 'All' }).click()
  const download = page.waitForEvent('download')
  await d.getByRole('button', { name: 'Download 3 NPCs' }).click()
  const file = JSON.parse(readFileSync(await (await download).path(), 'utf8'))
  const byName = Object.fromEntries(file.runners.map((r: { streetName: string; npc: unknown }) => [r.streetName, r.npc]))
  expect(byName['Made-up Hound']).toEqual({ kind: 'critter', tier: 'prime' })
  expect(byName['Made-up Wisp']).toEqual({ kind: 'spirit', tier: 'regular', fightingSpirit: 'low' })

  // the runner list refuses an NPC file
  await page.goto('/')
  await page.locator('input[type=file]').setInputFiles({ name: 'wisp.xml', mimeType: 'application/xml', buffer: Buffer.from(NPC_FILE) })
  await expect(page.getByRole('status')).toContainText('wisp.xml: this is an NPC, not a runner')
})

test('a failed save on import says why, on NPCs & Critters and on Your runners', async ({ page }) => {
  await signIn(page, 'eve')
  const full = (r: Route) =>
    r.request().method() === 'PUT'
      ? r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'the disk is full (test)' }) })
      : r.fallback()
  await page.route('**/api/npcs/*', full)
  await page.route('**/api/characters/*', full)
  await page.goto('/#/npcs')
  await expect(page.getByRole('heading', { name: 'NPCs & Critters' })).toBeVisible()
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'wisp.xml', mimeType: 'application/xml', buffer: Buffer.from(NPC_FILE.replace('npc-wisp-1', 'npc-fail-1')) })
  await expect(page.getByRole('status')).toHaveText('wisp.xml: the disk is full (test)')
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Your runners' })).toBeVisible()
  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'runner.xml', mimeType: 'application/xml', buffer: Buffer.from(RUNNER_FILE.replace('runner-1', 'runner-fail-1')) })
  await expect(page.getByRole('status')).toHaveText('runner.xml: the disk is full (test)')
})

test('an NPC imported before the list loads, its id already taken, saves under a new id', async ({ page }) => {
  await signIn(page, 'eve')
  const file = {
    name: 'wisp.xml',
    mimeType: 'application/xml',
    buffer: Buffer.from(NPC_FILE.replace('npc-wisp-1', 'npc-twice-1').replace('Made-up Wisp', 'Made-up Twice')),
  }
  expect(
    (
      await page.request.fetch(`${base}api/npcs/npc-twice-1`, {
        method: 'PUT',
        data: file.buffer.toString(),
        headers: { 'Content-Type': 'application/xml', Origin: origin },
      })
    ).ok(),
  ).toBe(true)
  let release!: () => void
  const held = new Promise<void>(r => {
    release = r
  })
  const hold = async (r: Route) => {
    if (r.request().method() === 'GET') await held
    await r.fallback()
  }
  await page.route(u => u.pathname.endsWith('/api/npcs'), hold)
  await page.goto('/#/npcs')
  await expect(page.getByText('Loading NPCs…')).toBeVisible()
  await page.locator('input[type=file]').setInputFiles(file)
  await expect(page.getByRole('status')).toHaveText('Imported Made-up Twice.')
  release()
  const twice = (await (await api(page, 'GET', 'npcs')).json()).filter((r: { xml: string }) => r.xml.includes('Made-up Twice'))
  expect(twice).toHaveLength(2)
  await page.unroute(u => u.pathname.endsWith('/api/npcs'))
})

test('share with a campaign: its co-GM reads and prints it; unshare', async ({ page }) => {
  await signIn(page, 'eve')
  const camp = await (await api(page, 'POST', 'campaigns', { name: 'Made-up Run', note: '' })).json()
  await signIn(page, 'ada')
  expect((await api(page, 'POST', `campaigns/${camp.id}/gms`, { user: 'gus' })).ok()).toBe(true)

  await signIn(page, 'eve')
  await page.goto('/#/npcs')
  await row(page, 'Ganger Boss').getByRole('button', { name: 'Share Ganger Boss…' }).click()
  const d = page.getByRole('dialog', { name: 'Share Ganger Boss with a campaign' })
  await d.getByLabel('Campaign').selectOption({ label: 'Made-up Run' })
  await d.getByRole('button', { name: 'Share' }).click()
  await expect(page.getByRole('status')).toHaveText('Ganger Boss is shared with Made-up Run.')
  await expect(row(page, 'Ganger Boss').getByRole('link', { name: 'Made-up Run' })).toBeVisible()

  await signIn(page, 'gus')
  await page.goto('/#/npcs')
  const theirs = page.getByRole('region', { name: 'Eve Editor’s NPCs' })
  await expect(theirs.getByRole('link', { name: 'Ganger Boss', exact: true })).toBeVisible()
  await expect(theirs.getByRole('button', { name: /^Delete/ })).toHaveCount(0)
  await expect(theirs.getByRole('link', { name: 'Print Ganger Boss' })).toBeVisible()
  await shots(page, 'npcs-shared')
  await theirs.getByRole('link', { name: 'Ganger Boss', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Read only' })).toContainText('Eve Editor’s NPC')
  await expect(page.getByLabel('Street name')).toBeDisabled()

  await signIn(page, 'eve')
  await page.goto('/#/npcs')
  await row(page, 'Ganger Boss').getByRole('button', { name: 'Unshare Ganger Boss' }).click()
  await expect(page.getByRole('status')).toHaveText('Ganger Boss is no longer shared with Made-up Run.')
  await expect(row(page, 'Ganger Boss').getByRole('link', { name: 'Made-up Run' })).toHaveCount(0)
})

test('delete an NPC: it waits in the NPC trash and is restored from there', async ({ page }) => {
  await signIn(page, 'eve')
  await page.goto('/#/npcs/critters')
  await page.getByRole('button', { name: 'Delete Made-up Wisp' }).click()
  await page.getByRole('dialog', { name: 'Delete Made-up Wisp?' }).getByRole('button', { name: 'Delete NPC' }).click()
  await expect(row(page, 'Made-up Wisp')).toHaveCount(0)
  await page.getByRole('link', { name: 'Trash (1)' }).click()
  await expect(page.getByRole('heading', { name: 'NPC trash' })).toBeVisible()
  await shots(page, 'npc-trash')
  await page.getByRole('button', { name: 'Restore Made-up Wisp' }).click()
  await expect(page.getByRole('status')).toHaveText('Restored Made-up Wisp to your NPCs.')
  await page.getByRole('link', { name: 'NPCs & Critters' }).click()
  await sections(page)
    .getByRole('link', { name: /^Critters/ })
    .click()
  await expect(row(page, 'Made-up Wisp').locator('.npckind')).toHaveText('Spirit')
  await expect(page.getByRole('link', { name: 'Trash (0)' })).toBeVisible()
})

test('a player has no NPCs link, and #/npcs says only GMs can see NPCs', async ({ page }) => {
  await signIn(page, 'pat')
  await expect(page.getByRole('link', { name: 'NPCs' })).toHaveCount(0)
  await page.goto('/#/npcs')
  await expect(page.getByText('Only GMs can see NPCs.')).toBeVisible()
  await shots(page, 'npcs-player')
})

const SHOOTER = `<?xml version="1.0" encoding="UTF-8"?>
<ca2:character xmlns:ca2="urn:chummer-anarchy2:character:1" formatVersion="1" id="npc-shooter-1" streetName="Made-up Shooter" metatype="human" level="runner" package="free" updatedAt="2026-10-02T00:00:00.000Z">
  <npc kind="npc" tier="regular" fightingSpirit="low"/>
  <build><attributes str="2" agi="3" wil="2" log="2" cha="2"/><skill id="ranged-weapons" rating="5"/>
    <amp uid="a1" type="cyberware" name="Made-up Smartlink"><narrative></narrative><effect ref="rr-skill" param="ranged-weapons"/></amp></build>
</ca2:character>
`

test('the NPC block on Review and on both printed sheets: average hits, fighting spirit, Edge only for a prime NPC', async ({ page }) => {
  await signIn(page, 'eve')
  await page.goto('/#/npcs')
  await page.locator('input[type=file]').setInputFiles({ name: 'shooter.xml', mimeType: 'application/xml', buffer: Buffer.from(SHOOTER) })
  await expect(page.getByRole('status')).toContainText('Imported Made-up Shooter.')
  await row(page, 'Made-up Shooter').getByRole('link', { name: 'Made-up Shooter' }).click()
  const id = page.url().split('/')[5]
  const line = 'Ranged Weapons 5 (5+A, RR 1)'

  await page.goto(`/#/n/${id}/review`)
  const block = page.getByRole('region', { name: 'NPC' })
  await expect(block.getByText(line, { exact: true })).toBeVisible()
  await expect(block).toContainText('No Edge')
  await expect(block).toContainText('Fighting spirit: Low. Stops at the first light wound')
  await shots(page, 'npc-sheet-review')

  for (const [label, sel] of [
    ['Printer-friendly', '.sheet'],
    ['Book style', 'article.book-sheet'],
  ] as const) {
    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('dialog', { name: 'Settings' }).getByRole('radio', { name: label }).check()
    await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Close' }).click()
    await page.goto(`/#/n/${id}/print`)
    await expect(page.locator(sel)).toBeVisible()
    const b = page.locator(sel).getByRole('region', { name: 'NPC' })
    await expect(b.getByText(line, { exact: true })).toBeVisible()
    await expect(b).toContainText('Fighting spirit: Low')
    await expect(page.locator(sel).getByText('Edge', { exact: true })).toHaveCount(0)
    await page.screenshot({ path: `${SHOTS}/npc-sheet-${label === 'Book style' ? 'book' : 'plain'}.png`, fullPage: true })
    await page.goto(`/#/n/${id}/review`)
  }

  // a prime NPC shows Edge and the usual pools
  await newNpc(page, 'NPC', 'Prime')
  await page.getByLabel('Fighting spirit').selectOption('extreme')
  await saved(page)
  await page.getByRole('link', { name: 'Review' }).click()
  const prime = page.getByRole('region', { name: 'NPC' })
  await expect(prime).toContainText(/Edge \d/)
  await expect(prime).not.toContainText('No Edge')
  await expect(prime).toContainText('Fighting spirit: Extreme')
  await shots(page, 'npc-sheet-prime')
})

test('Load book NPCs copies the imported books’ NPCs once, even after a rename', async ({ page }) => {
  await signIn(page, 'gus')
  await page.goto('/#/npcs')
  await page.getByRole('button', { name: 'Load book NPCs' }).click()
  await expect(page.getByRole('status')).toHaveText('Loaded 1 · already there 0 · failed 0.')
  const r = row(page, 'Made-Up Goon')
  await expect(r.locator('.npckind')).toHaveText('NPC')
  await expect(r.locator('.npctier')).toHaveText('Regular')
  const goon = (await (await api(page, 'GET', 'npcs')).json()).find((x: { xml: string }) => x.xml.includes('Made-Up Goon'))
  expect(goon.xml).toContain('origin="TESTC"')
  expect(goon.xml).not.toContain('id="testc.npc-made-up-goon"') // a copy with an id of its own

  await page.getByRole('button', { name: 'Load book NPCs' }).click()
  await expect(page.getByRole('status')).toHaveText('Loaded 0 · already there 1 · failed 0.')
  await r.getByRole('link', { name: 'Made-Up Goon' }).click()
  await page.getByLabel('Street name').fill('Renamed Goon')
  await savedOnServer(page, 'Renamed Goon')
  await page.goto('/#/npcs')
  await page.getByRole('button', { name: 'Load book NPCs' }).click()
  await expect(page.getByRole('status')).toHaveText('Loaded 0 · already there 1 · failed 0.')
  await expect(row(page, 'Made-Up Goon')).toHaveCount(0)
})
