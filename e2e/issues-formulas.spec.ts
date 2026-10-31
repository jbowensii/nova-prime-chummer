import { test, expect, type Page } from '@playwright/test'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { usersFile } from '../server/auth.mjs'
import { createServer } from '../server/server.mjs'

// Formulas, data issues and override files in both games, on a server of its own: the made-up fixtures plus made-up
// entries with formulas and issues (tests/fixtures/issues/), the stub worker writing the edits layer. Ada is the admin.
// Runs in order. Screenshots (light and dark) go to ISSUES_SHOTS, else .extract/screenshots/issues (not committed).
const PW = 'ada-password-1'
const SHOTS = process.env.ISSUES_SHOTS ?? '.extract/screenshots/issues'
let server: ReturnType<typeof createServer>,
  base = '',
  dir = ''

test.describe.configure({ mode: 'serial' })
test.use({ baseURL: async ({}, use) => use(base), storageState: { cookies: [], origins: [] }, viewport: { width: 1400, height: 900 } })

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'ca2-issues-e2e-'))
  const custom = join(dir, 'custom')
  cpSync('tests/fixtures/mini/custom', custom, { recursive: true })
  cpSync('tests/fixtures/sr6/custom', join(custom, 'sr6'), { recursive: true })
  // the made-up entries as one more file of an imported book, in each game
  cpSync('tests/fixtures/issues/ca2-items.xml', join(custom, 'imported', 'test', 'issues.xml'))
  cpSync('tests/fixtures/issues/sr6-gear.xml', join(custom, 'sr6', 'imported', 'crb', 'issues.xml'))
  for (const [index, href] of [
    [join(custom, 'imported', 'index.xml'), 'test/issues.xml'],
    [join(custom, 'sr6', 'imported', 'index.xml'), 'crb/issues.xml'],
  ]) {
    const xml = readFileSync(index, 'utf8')
    writeFileSync(index, xml.replace('</overlays>', `  <file href="${href}"/>\n</overlays>`))
  }
  mkdirSync(join(dir, 'library', '.config'), { recursive: true })
  writeFileSync(join(dir, 'library', '.config', 'users.xml'), await usersFile([{ username: 'ada', password: PW, name: 'Ada Admin' }]))
  server = createServer({
    staticDir: 'dist',
    charDir: join(dir, 'characters'),
    customDir: custom,
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

async function signIn(page: Page, path: string) {
  await page.goto(path)
  await page.getByLabel('Username').fill('ada')
  await page.getByLabel('Password', { exact: true }).fill(PW)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByLabel('Username')).toHaveCount(0)
}
/** the page (or one element of it) in light, then dark */
async function shoot(page: Page, name: string, el?: ReturnType<Page['locator']>) {
  for (const theme of ['light', 'dark']) {
    await page.evaluate(v => {
      document.documentElement.dataset.theme = v
    }, theme)
    await (el ?? page).screenshot({ path: `${SHOTS}/${name}-${theme}.png`, ...(el ? {} : { fullPage: false }) })
  }
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'light'
  })
}
const file = (name: string, text: string) => ({ name, mimeType: 'application/xml', buffer: Buffer.from(text) })
const attention = (page: Page) => page.getByRole('button', { name: /^Needs attention/ })

test('SR6 Game data: Needs attention with its count, the badges, a formula and its range', async ({ page }) => {
  await signIn(page, '/#/sr6/data')
  await expect(attention(page)).toContainText('2') // Null Box (no availability) and Ghost Link (its formula's ref is broken)
  await attention(page).click()
  await expect(attention(page)).toHaveAttribute('aria-pressed', 'true')
  const rows = page.locator('table.browse tbody tr')
  await expect(rows).toHaveCount(2)
  const box = rows.filter({ hasText: 'Null Box' })
  await expect(box.locator('.issue-badge')).toHaveText('Issue availability: no availability printed · CRB p.91')
  await expect(rows.filter({ hasText: 'Ghost Link' }).locator('.issue-badge')).toContainText('cost: its formula: it refers to gear:crb.nowhere’s cost')
  await shoot(page, 'sr6-needs-attention')
  await shoot(page, 'sr6-issue-badge', box)
  await attention(page).click()
  // (a rated item is one entry per rating, levels.ts: each level shows the formula at its own rating)
  await expect(rows.filter({ has: page.locator('b', { hasText: /^Flare Kit 3$/ }) })).toContainText('cost = Rating × 200¥ (600¥)')
  await expect(rows.filter({ has: page.locator('b', { hasText: /^Tier Lamp 5$/ }) })).toContainText('cost = tier(Rating; 1-3: 100; 4-6: 250)¥ (250¥)')
})

test('SR6 builder: a formula’s price in the picker and on the line, the issue noted in Review', async ({ page }) => {
  await signIn(page, '/#/sr6')
  await page.getByRole('button', { name: 'New runner' }).click()
  await page.getByRole('dialog', { name: 'New runner' }).getByLabel('Street name').fill('Flint')
  await page.getByRole('dialog', { name: 'New runner' }).getByRole('button', { name: 'Create runner' }).click()
  await expect(page).toHaveURL(/#\/sr6\/c\/[^/]+\/concept$/)
  await page.goto(page.url().replace(/concept$/, 'gear'))
  await page.getByRole('button', { name: 'Add other gear…' }).click()
  const dlg = page.getByRole('dialog').last()
  await dlg.getByLabel('Search').fill('Flare Kit')
  // (a rated item is one entry per rating, levels.ts: the picker lists Flare Kit 1–6, each at its own price)
  await expect(dlg.locator('.picker li', { hasText: 'Flare Kit 3' })).toContainText('Rating × 200¥ (600¥)')
  await expect(dlg.locator('.picker li', { hasText: 'Flare Kit' })).toHaveCount(6)
  await shoot(page, 'sr6-formula-picker', dlg)
  await dlg.getByText('Flare Kit 3', { exact: true }).click()
  // (the picker's quantity step: confirm it)
  if (await dlg.getByRole('button', { name: 'Add', exact: true }).count()) await dlg.getByRole('button', { name: 'Add', exact: true }).click()
  const kit = page.locator('tr', { hasText: 'Flare Kit' })
  const cost = kit.locator('.has-formula')
  await expect(cost).toHaveText('600¥')
  await expect(cost).toHaveAttribute('title', 'Rating × 200¥')
  await cost.hover()
  await shoot(page, 'sr6-formula-price', page.locator('section', { has: kit }).first())
  // the Null Box: its issue a note in Review, cited
  await page.getByRole('button', { name: 'Add other gear…' }).click()
  await page.getByRole('dialog').last().getByLabel('Search').fill('Null Box')
  await expect(page.getByRole('dialog').last().locator('.issue-badge')).toContainText('availability: no availability printed')
  await page.getByRole('dialog').last().getByText('Null Box').click()
  const box = page.getByRole('dialog').last().getByRole('button', { name: 'Add', exact: true })
  if (await box.count()) await box.click() // (the picker's quantity step)
  await expect(page.locator('tr', { hasText: 'Null Box' })).toBeVisible()
  await page.goto(page.url().replace(/gear$/, 'review'))
  const note = page.locator('.viol', { hasText: 'Null Box: the book prints no availability, set it in Game data or an override file.' })
  await expect(note.locator('.sev')).toHaveText('Note')
  await expect(note.locator('.cite')).toHaveText('CRB p.91')
})

test('SR6 override files: export the edits, import a file with a preview, keep mine or take theirs', async ({ page }) => {
  await signIn(page, '/#/sr6/data')
  // export: the fixture's Zap Gun edit, in the edits format
  await page.getByRole('button', { name: 'Export my edits…' }).click()
  const [down] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('dialog', { name: 'Export my edits' }).getByRole('button', { name: 'Export' }).click(),
  ])
  expect(down.suggestedFilename()).toBe('sr6-edits.xml')
  const exported = readFileSync(await down.path(), 'utf8')
  expect(exported).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="edits" version="1">/)
  expect(exported).toContain('<weapon id="crb.zap-gun"')
  await expect(page.getByRole('status').filter({ hasText: 'Exported 1 edit.' })).toBeVisible()

  // import: the Null Box's availability (a change to the book: its issue goes), the Zap Gun (a conflict), the Flare Kit as it is
  const theirs = `<?xml version="1.0" encoding="UTF-8"?>
<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="edits" version="1">
  <gear id="crb.null-box" source="CRB" page="271" category="survival" cost="150" avail="4" by="zed"><name>Null Box</name><issue field="avail" code="missing">x</issue><text>A box that hums, made-up text.</text></gear>
  <weapon id="crb.zap-gun" source="CRB" page="250" category="zappers" dv="3P" modes="SS" ar="9/7/—/—/—" ammo="8(c)" avail="2" cost="310"><name>Zap Gun</name><text/></weapon>
  <gear id="crb.flare-kit" source="CRB" page="270" category="survival" rating="1–6" avail="2" cost="Rating × 200"><name>Flare Kit</name><formula field="cost">R * 200</formula><text/></gear>
  <sprite-thing id="x"/>
</sr6:data>`
  await page.getByLabel('Import edits').setInputFiles(file('table-fixes.xml', theirs))
  const pv = page.getByRole('dialog', { name: 'Import table-fixes.xml' })
  await expect(pv).toContainText('1 changing the book, 1 conflicting with your edits, 1 the same as yours, 1 left out')
  await expect(pv.locator('tr', { hasText: 'Null Box' })).toContainText('Changes the book’s entry: avail, description')
  await expect(pv.locator('tr', { hasText: 'Zap Gun' })).toContainText('Conflicts with your edit: cost')
  await expect(pv.locator('tr', { hasText: 'Flare Kit' })).toContainText('Same as yours')
  await expect(pv.getByRole('button', { name: 'Save 1 edit' })).toBeVisible() // a conflict keeps mine until taken
  await pv.getByLabel('Zap Gun: keep').selectOption('theirs')
  await shoot(page, 'sr6-override-preview', pv)
  await pv.getByRole('button', { name: 'Save 2 edits' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Saved 2 edits from table-fixes.xml.' })).toBeVisible()
  const edits = readFileSync(join(dir, 'custom', 'sr6', 'edits', 'edits.xml'), 'utf8')
  expect(edits).toContain('cost="310"')
  expect(edits).toMatch(/<gear id="crb.null-box"[^>]*avail="4"[^>]*by="ada"/)
  expect(edits).not.toContain('<issue')
  expect(readFileSync(join(dir, 'custom', 'sr6', 'edits', 'texts.xml'), 'utf8')).toContain('A box that hums, made-up text.')
  // the Null Box's availability is set: it no longer needs attention, and its edit dialog still shows what the book has
  await expect(attention(page)).toContainText('1')
  await page.locator('table.sr6-edits').getByRole('button', { name: 'Edit Null Box' }).click()
  const form = page.getByRole('dialog', { name: 'Edit Null Box' })
  await expect(form.getByLabel('avail')).toHaveValue('4')
  await expect(form.locator('.field-notes')).toContainText('book: none printed (p.91)')
})

test('Anarchy: Needs attention and its badge, a formula price, Review’s note, override files', async ({ page }) => {
  await signIn(page, '/#/data')
  await expect(attention(page)).toContainText('1')
  await attention(page).click()
  const blade = page.locator('table.browse tbody tr', { hasText: 'Odd Blade' })
  await expect(blade.locator('.issue-badge')).toHaveText('Issue damage: no damage printed · TEST p.12')
  await shoot(page, 'ca2-needs-attention')
  await shoot(page, 'ca2-issue-badge', blade)
  await attention(page).click()

  // the builder: the Flash Pack's price is its formula, three times the standard price
  await page.goto('/#/')
  await page.getByRole('button', { name: 'New runner' }).click()
  await page.getByRole('button', { name: 'Create runner' }).click()
  await page.getByRole('link', { name: 'Gear' }).click()
  await page.getByRole('button', { name: 'Add from the book' }).nth(2).click()
  await page.getByLabel('Search').fill('Flash Pack')
  const li = page.locator('.picker li', { hasText: 'Flash Pack' })
  await expect(li).toContainText(/[\d,]+ × 3¥ \([\d,]+¥\)/)
  await li.click()
  const pack = page.locator('tr', { hasText: 'Flash Pack' }).locator('.has-formula')
  await expect(pack).toHaveAttribute('title', /^[\d,]+ × 3¥$/)
  const std = Number((await pack.getAttribute('title'))!.replace(/[^\d×]/g, '').split('×')[0])
  await expect(pack).toHaveText(`${(std * 3).toLocaleString('en-US')}¥`)
  await shoot(page, 'ca2-formula-price', page.locator('section', { has: pack }).first())
  await page.getByRole('button', { name: 'Add from the book' }).nth(1).click()
  await page.getByLabel('Search').fill('Odd Blade')
  await page.locator('.picker li', { hasText: 'Odd Blade' }).click()
  await page.getByRole('link', { name: 'Review' }).click()
  const note = page.locator('.viol', { hasText: 'Odd Blade: the book prints no damage, set it in Game data or an override file.' })
  await expect(note.locator('.sev')).toHaveText('Note')
  await expect(note.locator('.cite')).toHaveText('TEST p.12')

  // override files: the fixture's two edits out; in, the Odd Blade's damage (its issue clears) and a conflicting Signal Jammer
  await page.goto('/#/data')
  await page.getByRole('button', { name: 'Export my edits…' }).click()
  const [down] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('dialog', { name: 'Export my edits' }).getByRole('button', { name: 'Export' }).click(),
  ])
  const exported = readFileSync(await down.path(), 'utf8')
  expect(down.suggestedFilename()).toBe('chummer-edits.xml')
  expect(exported).toContain('<item id="test.signal-jammer"')
  expect(exported).toContain('<item id="table.lucky-charm"')
  const theirs = `<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="edits" version="1">
  <item id="test.odd-blade" kind="weapon" source="TEST" page="12" dv="STR+2" ranges="OK/-/-/-"><name>Odd Blade</name><issue field="dv" code="missing">x</issue><text></text></item>
  <item id="test.signal-jammer" kind="gear" source="TEST" page="10"><name>Signal Jammer Mk III</name><text></text></item>
</ca2:data>`
  await page.getByLabel('Import edits').setInputFiles(file('house.xml', theirs))
  const pv = page.getByRole('dialog', { name: 'Import house.xml' })
  await expect(pv.locator('tr', { hasText: 'Odd Blade' })).toContainText('Changes the book’s entry: dv')
  await expect(pv.locator('tr', { hasText: 'Signal Jammer' })).toContainText('Conflicts with your edit: name')
  await shoot(page, 'ca2-override-preview', pv)
  await pv.getByRole('button', { name: 'Save 1 edit' }).click() // keeps mine: the Jammer stays Mk II
  await expect(page.getByRole('status').filter({ hasText: 'Saved 1 edit from house.xml.' })).toBeVisible()
  await expect(attention(page)).toContainText('0')
  await expect(attention(page)).toBeDisabled()
  const edits = readFileSync(join(dir, 'custom', 'edits', 'edits.xml'), 'utf8')
  expect(edits).toContain('Signal Jammer Mk II<')
  expect(edits).toMatch(/<item id="test.odd-blade"[^>]*dv="STR\+2"/)
  await page.locator('table.edits tr', { hasText: 'Odd Blade' }).getByRole('button', { name: 'Edit Odd Blade' }).click()
  await expect(page.getByRole('dialog').last()).toContainText('damage: book: none printed (p.12) · no damage printed · set by your edit')
})
