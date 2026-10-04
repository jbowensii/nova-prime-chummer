import { test, expect, type Page } from '@playwright/test'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { usersFile } from '../server/auth.mjs'
import { createServer } from '../server/server.mjs'

// SR6 S3 end to end: career play on the Ledger tab (and, from Task 9, NPCs and campaigns) on a server of its own with the
// made-up SR6 fixture (tests/fixtures/sr6/custom copied to custom/sr6/). All names made up: Ada the admin, Gil an editor,
// Pat a player. Pat's runner is tests/fixtures/sr6/runner-career.xml with its ledger cut back to the finalize entry (31
// karma, 4,350¥). Runs in order. Screenshots go to .extract/screenshots/sr6-s3 (not committed).
const PW = { ada: 'ada-password-1', gil: 'gil-password-1', pat: 'pat-password-1' }
const SHOTS = '.extract/screenshots/sr6-s3'
const PHONE = { width: 390, height: 844 }, DESK = { width: 1400, height: 900 }
const RUNNER = 'career-wisp-1'
let server: ReturnType<typeof createServer>, base = '', dir = ''

test.describe.configure({ mode: 'serial' })
test.use({ baseURL: async ({}, use) => use(base), storageState: { cookies: [], origins: [] }, viewport: DESK })

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'ca2-sr6-career-e2e-'))
  const config = join(dir, 'library', '.config')
  cpSync('tests/fixtures/mini/custom', join(dir, 'custom'), { recursive: true })
  cpSync('tests/fixtures/sr6/custom', join(dir, 'custom', 'sr6'), { recursive: true })
  mkdirSync(config, { recursive: true })
  writeFileSync(join(config, 'users.xml'), await usersFile([{ username: 'ada', password: PW.ada, name: 'Ada Admin' },
    { username: 'gil', password: PW.gil, role: 'editor', name: 'Gil Editor' }, { username: 'pat', password: PW.pat, role: 'player', name: 'Pat Player' }]))
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

test('career: the Ledger tab records earnings and spends, voids the newest, and the other tabs show the runner as it stands', async ({ page }) => {
  await signIn(page, '/#/sr6', 'pat')
  const xml = readFileSync('tests/fixtures/sr6/runner-career.xml', 'utf8').replace(/(<entry id="l-1"[^>]*\/>)[\s\S]*<\/ledger>/, '$1\n  </ledger>')
  const put = await page.request.put(`/api/sr6/characters/${RUNNER}`, { data: xml, headers: { 'Content-Type': 'application/xml', Origin: base.replace(/\/$/, '') } })
  expect(put.status()).toBe(201)
  await page.goto(`/#/sr6/c/${RUNNER}/attributes`)
  const tabs = page.getByRole('navigation', { name: 'Character sections' }).getByRole('link')
  const work = page.locator('main.work'), dlg = page.getByRole('dialog'), price = page.getByRole('status', { name: 'Price' })
  await expect(page.locator('.topbar .runstate')).toHaveAttribute('title', 'Finalized: spend karma and nuyen on the Ledger tab')
  await expect(page.getByRole('status').filter({ hasText: 'Finalized: spend karma and nuyen on the Ledger tab.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Raise Agility points' })).toBeDisabled()

  await tabs.filter({ hasText: 'Ledger' }).click()
  await expect(work.locator('.sr6-balances')).toHaveText(/Karma 31\s*Nuyen 4,350¥/)
  await work.getByLabel('Karma', { exact: true }).fill('9')
  await work.getByLabel('Nuyen', { exact: true }).fill('3100')
  await work.getByLabel('Run').fill('Made-up run')
  await work.getByRole('button', { name: 'Record earnings' }).click()
  await expect(work.locator('.sr6-balances')).toHaveText(/Karma 40\s*Nuyen 7,450¥/)
  await expect(page.locator('.sr6-budgets')).toContainText('40')

  // raise Agility: the price line, the confirm dialog, then Attributes shows 4
  await work.getByRole('combobox', { name: /^What/ }).selectOption('attribute')
  await work.getByRole('combobox', { name: /^Attribute/ }).selectOption({ label: 'Agility (3)' })
  await expect(price).toHaveText('AGI 3 → 4 · 12 karma · after: 28 karma, 7,450¥')
  await work.getByRole('button', { name: 'Record', exact: true }).click()
  await expect(dlg).toContainText('AGI 3 → 4')
  await dlg.getByRole('button', { name: 'Record it' }).click()
  await expect(work.locator('.sr6-balances')).toHaveText(/Karma 28/)
  // learn a spell from the catalog
  await work.getByRole('combobox', { name: /^What/ }).selectOption('pick')
  await work.getByRole('button', { name: 'Pick from the catalog…' }).click()
  await dlg.getByText('Glow Ward').click()
  await expect(price).toHaveText('Spell: Glow Ward · 7 karma · after: 21 karma, 7,450¥')
  await work.getByRole('button', { name: 'Record', exact: true }).click()
  await dlg.getByRole('button', { name: 'Record it' }).click()
  await expect(work.locator('.sr6-balances')).toHaveText(/Karma 21/)
  // nuyen to karma is an optional rule, off without its setting
  await work.getByRole('combobox', { name: /^What/ }).selectOption('n2k')
  await work.getByLabel('Karma', { exact: true }).last().fill('1')
  await expect(price).toHaveText('That optional rule is off: Game data → Creation rules.')
  await expect(work.getByRole('button', { name: 'Record', exact: true })).toBeDisabled()

  // only the newest spend can be voided
  await expect(work.getByRole('button', { name: 'Void AGI 3 → 4' })).toHaveCount(0)
  await expect(work.getByRole('button', { name: 'Void Earned: Made-up run (' + new Date().toISOString().slice(0, 10) + ')' })).toBeVisible()
  await shoot(page, 'ledger')
  await work.getByRole('button', { name: 'Void Spell: Glow Ward' }).click()
  await dlg.getByLabel('Why').fill('Picked the wrong one')
  await dlg.getByRole('button', { name: 'Void' }).click()
  await expect(work.locator('.sr6-balances')).toHaveText(/Karma 28/)
  await expect(work.locator('tr.voided')).toContainText('Voided: Picked the wrong one')
  await expect(work.getByRole('button', { name: 'Void AGI 3 → 4' })).toBeVisible()

  await tabs.filter({ hasText: 'Attributes' }).click()
  await expect(work.locator('tr', { hasText: 'Agility' }).locator('td.num').first()).toHaveText('4')
  await tabs.filter({ hasText: 'Review' }).click()
  await expect(page.getByRole('button', { name: 'Back to draft' })).toBeDisabled()
  await expect(work).toContainText('Void the ledger’s earnings and spends first (newest first).')
  await expect(work).toContainText('The ledger now holds 28 karma and 7,450¥.')
  await expect(page.getByRole('status', { name: 'Save status' })).toContainText('All changes saved')
})

const CA2 = '<ca2:character xmlns:ca2="urn:chummer-anarchy2:character:1" formatVersion="1" id="anarchy-1" metatype="elf" level="runner" updatedAt="2026-10-03T00:00:00.000Z"><build><attributes str="1" agi="1" wil="1" log="1" cha="1"/></build></ca2:character>'
const xmlFile = (name: string, text: string) => ({ name, mimeType: 'application/xml', buffer: Buffer.from(text) })
const npcRow = (page: Page, name: string) => page.locator('.dossier').filter({ has: page.getByRole('link', { name, exact: true }) })

test('NPCs: Gil makes grunts, a spirit, a sprite, a critter and a blank one; loads the book NPCs; imports, shares, trashes', async ({ page }) => {
  await signIn(page, '/#/sr6', 'gil')
  await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: 'NPCs & Critters' }).click()
  await expect(page).toHaveURL(/#\/sr6\/npcs$/)
  await expect(page.getByRole('heading', { name: 'NPCs & Critters' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'NPCs & Critters' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByText('No NPCs yet.')).toBeVisible()
  const dlg = page.getByRole('dialog'), from = dlg.getByLabel('From the catalog'), status = page.locator('p.banner[role=status]')
  const make = async (kind: string, entry: string, rating?: string) => {
    await page.getByRole('button', { name: 'New NPC' }).click()
    await dlg.getByLabel('Kind').selectOption({ label: kind })
    await from.selectOption({ label: entry })
    if (rating) await dlg.getByLabel(kind === 'Spirit' ? 'Force' : 'Level').fill(rating)
    await dlg.getByRole('button', { name: 'Create NPC' }).click()
    await expect(page).toHaveURL(/#\/sr6\/n\/[^/]+\/stats$/)
    await page.goto('/#/sr6/npcs')
  }
  // grunts grouped by Professional Rating; no Force for them; a kind with none in the books offers Blank only
  await page.getByRole('button', { name: 'New NPC' }).click()
  await expect(from.locator('optgroup[label="Professional Rating 2"] option')).toHaveText(['Corner Goon'])
  await expect(from.locator('optgroup[label="Professional Rating 4"] option')).toHaveText(['Lot Boss'])
  await expect(dlg.getByLabel('Force')).toHaveCount(0)
  await dlg.getByLabel('Kind').selectOption({ label: 'Spirit' })
  await expect(dlg.getByLabel('Force')).toHaveValue('1')
  await dlg.getByRole('button', { name: 'Cancel' }).click()
  await make('Grunt', 'Corner Goon')
  await make('Spirit', 'Spirit of Puddles', '4')
  await make('Sprite', 'Glitch Sprite', '3')
  await make('Critter', 'Fuzzbeast')
  await make('Grunt', 'Blank')
  await expect(npcRow(page, 'Corner Goon')).toContainText('Grunt PR 2')
  await expect(npcRow(page, 'Spirit of Puddles')).toContainText('Spirit F 4')
  await expect(npcRow(page, 'Glitch Sprite')).toContainText('Sprite L 3')
  await expect(npcRow(page, 'Fuzzbeast')).toContainText('Critter')
  await expect(npcRow(page, 'Unnamed NPC')).toContainText('Grunt')

  // the book NPCs: the ones made from the catalog above don't count, and a second load adds nothing
  await page.getByRole('button', { name: 'Load book NPCs' }).click()
  await expect(status).toHaveText('Added 3 book NPCs.')
  await expect(npcRow(page, 'Corner Goon')).toHaveCount(2)
  await page.getByRole('button', { name: 'Load book NPCs' }).click()
  await expect(status).toHaveText('The book NPCs are already in your NPCs.')

  // import: an NPC file joins; a runner and an Anarchy file are refused, each saying where it belongs
  await page.locator('input[type=file]').setInputFiles([xmlFile('goon.xml', readFileSync('tests/fixtures/sr6/npc-grunt.xml', 'utf8')),
    xmlFile('wisp.xml', readFileSync('tests/fixtures/sr6/runner-career.xml', 'utf8')), xmlFile('anarchy.xml', CA2)])
  await expect(status).toHaveText('Imported Corner Goon. wisp.xml: This is a runner, not an NPC. Import it on Your runners. '
    + 'anarchy.xml: This is a Shadowrun Anarchy runner. Import it on the Anarchy side.')
  await expect(npcRow(page, 'Corner Goon')).toHaveCount(3)

  // search, export
  await page.getByLabel('Search NPCs').fill('sprite')
  await expect(page.locator('.dossier')).toHaveCount(1)
  await page.getByLabel('Search NPCs').fill('')
  const [down] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export Fuzzbeast' }).click()])
  expect(readFileSync(await down.path(), 'utf8')).toContain('<npc kind="critter"')

  // share with an SR6 campaign Gil runs, then unshare
  const made = await page.request.post('/api/sr6/campaigns', { data: { name: 'Made-up Share Test' }, headers: { Origin: base.replace(/\/$/, '') } })
  expect(made.status()).toBe(201)
  await page.reload()
  await page.getByRole('button', { name: 'Share Fuzzbeast…' }).click()
  await dlg.getByRole('button', { name: 'Share' }).click()
  await expect(status).toHaveText('Fuzzbeast is shared with Made-up Share Test.')
  await expect(npcRow(page, 'Fuzzbeast').locator('.ctag')).toHaveText('Made-up Share Test')
  await page.getByRole('button', { name: 'Unshare Fuzzbeast' }).click()
  await expect(status).toHaveText('Fuzzbeast is no longer shared with Made-up Share Test.')
  await shoot(page, 'npcs')

  // delete: to the SR6 NPC trash, then restore it
  await page.getByRole('button', { name: 'Delete Glitch Sprite' }).click()
  await dlg.getByRole('button', { name: 'Delete NPC' }).click()
  await expect(npcRow(page, 'Glitch Sprite')).toHaveCount(0)
  await page.getByRole('link', { name: 'Trash (1)' }).click()
  await expect(page).toHaveURL(/#\/sr6\/npcs\/trash$/)
  await expect(page.getByRole('heading', { name: 'NPC trash' })).toBeVisible()
  await page.getByRole('button', { name: 'Restore Glitch Sprite' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Restored Glitch Sprite' })).toBeVisible()
  await page.goto('/#/sr6/npcs')
  await expect(npcRow(page, 'Glitch Sprite')).toHaveCount(1)

  // the other game's NPC store holds none of them
  expect(await (await page.request.get('/api/npcs')).text()).not.toContain('urn:chummer-sr6')
})

test('NPC editor: the Stat block tab reads stats at the rating, and an NPC prints its block', async ({ page }) => {
  await signIn(page, '/#/sr6/npcs', 'gil')
  const tabs = page.getByRole('navigation', { name: 'Character sections' }).getByRole('link')
  const work = page.locator('main.work'), block = page.getByRole('region', { name: 'NPC block' })
  const row = (label: string) => work.locator('table.sr6-npc-edit tr').filter({ has: page.getByRole('cell', { name: label, exact: true }) })

  // a grunt: NPC tabs only, its chip, no budgets; its skills with pools
  await npcRow(page, 'Lot Boss').getByRole('link', { name: 'Lot Boss' }).click()
  await expect(page).toHaveURL(/#\/sr6\/n\/[^/]+\/stats$/)
  await expect(tabs).toHaveText(['Concept', 'Stat block', 'Print'])
  await expect(page.locator('.topbar .npckind')).toHaveText('Grunt PR 4')
  await expect(page.locator('.sr6-budgets')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'NPCs & Critters' })).toHaveAttribute('aria-current', 'page')
  await expect(work).toContainText('Made from Lot Boss (CRB p.207).')
  await expect(row('BOD').locator('td').last()).toHaveText('5')
  await expect(block).toContainText('Grunt, Professional Rating 4 · Street Crew')
  await expect(block).toContainText('Gab 5 (pool 10), Tinkering 3 (pool 6), Close Combat 6')
  await expect(block).toContainText('Made-up Knuckle Spurs')
  await tabs.filter({ hasText: 'Concept' }).click()
  await expect(work).not.toContainText('Metatype')

  // a spirit at Force 4, then 6; a value it can't read
  await page.goto('/#/sr6/npcs')
  await npcRow(page, 'Spirit of Puddles').getByRole('link', { name: 'Spirit of Puddles' }).click()
  await expect(row('AGI').locator('td').last()).toHaveText('5')
  await expect(row('Defense Rating').locator('td').last()).toHaveText('8')
  await expect(row('Initiative').locator('td').last()).toHaveText('8 + 2D6')
  await page.getByRole('button', { name: 'Raise Force' }).click()
  await page.getByRole('button', { name: 'Raise Force' }).click()
  await expect(row('AGI').locator('td').last()).toHaveText('7')
  await expect(page.locator('.topbar .npckind')).toHaveText('Spirit F 6')
  await page.getByLabel('Magic as printed').fill('F+?')
  await page.getByLabel('Magic as printed').press('Enter')
  await expect(row('Magic').locator('td').last()).toHaveText('⚠ Can’t read this')
  await expect(block.getByLabel('Can’t read this')).toBeVisible()
  await page.getByLabel('Add stat').selectOption({ label: 'Attack' })
  await expect(page.getByLabel('Attack as printed')).toHaveValue('0')
  await page.getByRole('textbox', { name: /^Powers/ }).fill('Glimmer, Made-up Drizzle')
  await expect(block).toContainText('Glimmer, Made-up Drizzle')
  await expect(page.getByRole('status', { name: 'Save status' })).toContainText('All changes saved')
  await shoot(page, 'stats')

  // its print: header, block, background
  await tabs.filter({ hasText: 'Concept' }).click()
  await work.getByLabel('Background').fill('Lives in the made-up gutter.')
  await expect(page.getByRole('status', { name: 'Save status' })).toContainText('All changes saved')
  await tabs.filter({ hasText: 'Print' }).click()
  await expect(page).toHaveURL(/#\/sr6\/n\/[^/]+\/print$/)
  const sheet = page.locator('article.sheet')
  await expect(sheet.locator('.s-role')).toHaveText('Spirit, Force 6')
  await expect(sheet.locator('.sr6-npc-stats')).toContainText('AGI7')
  await expect(sheet).toContainText('Lives in the made-up gutter.')
  await expect(sheet).not.toContainText('Condition monitors')
  await expect(page.getByRole('link', { name: 'Back to editing' })).toHaveAttribute('href', /#\/sr6\/n\/[^/]+\/stats$/)

  // a sprite at Level 3
  await page.goto('/#/sr6/npcs')
  await npcRow(page, 'Glitch Sprite').getByRole('link', { name: 'Glitch Sprite' }).click()
  await expect(row('Sleaze').locator('td').last()).toHaveText('4')
  await expect(page.getByRole('textbox', { name: /^Weapons/ })).toHaveCount(0) // sprites: skills and powers only
})

test('NPCs: the admin sees Gil’s under his name, with Print', async ({ page }) => {
  await signIn(page, '/#/sr6/npcs', 'ada')
  await expect(page.getByRole('region', { name: 'Gil Editor’s NPCs' }).getByRole('link', { name: 'Print Fuzzbeast' }))
    .toHaveAttribute('href', /#\/sr6\/n\/[^/]+\/print$/)
  // opened from there: read only
  await page.getByRole('region', { name: 'Gil Editor’s NPCs' }).getByRole('link', { name: 'Fuzzbeast', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: /^Read only — .*’s NPC\./ })).toBeVisible()
  await expect(page.getByLabel('BOD as printed')).toBeDisabled()
})

test('NPCs: a player gets no menu, no page and no data', async ({ page }) => {
  await signIn(page, '/#/sr6/npcs', 'pat')
  await expect(page.getByRole('heading', { name: 'Your runners' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'NPCs & Critters' })).toHaveCount(0)
  expect((await page.request.get('/api/sr6/npcs')).status()).toBe(403)
  expect((await page.request.get('/api/sr6/npcs/trash')).status()).toBe(403)
  await page.goto('/#/sr6/npcs/trash')
  await expect(page.getByRole('heading', { name: 'Your runners' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'NPC trash' })).toHaveCount(0)
})
