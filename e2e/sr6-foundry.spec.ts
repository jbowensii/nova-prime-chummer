import { test, expect, type Download, type Page } from '@playwright/test'
import Ajv2020 from 'ajv/dist/2020.js'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { usersFile } from '../server/auth.mjs'
import { createServer } from '../server/server.mjs'

// SR6 F1 end to end: Export for Foundry writes Chummer SR6 export v1 files (docs/sr6-export-format.md) from the runner list,
// the editor, NPCs & Critters, Game data and a compendium, on a server of its own with the made-up SR6 fixture. Ada the
// admin, Gil an editor, Pat a player; their runners are tests/fixtures/sr6/runner-career.xml renamed. Runs in order.
const PW = { ada: 'ada-password-1', gil: 'gil-password-1', pat: 'pat-password-1' }
let server: ReturnType<typeof createServer>, base = '', dir = '', camp = ''
const today = () => new Date().toLocaleDateString('en-CA')
const check = new Ajv2020({ strict: false, validateFormats: false }).compile(JSON.parse(readFileSync('public/data/schema/sr6-export.schema.json', 'utf8')))

test.describe.configure({ mode: 'serial' })
test.use({ baseURL: async ({}, use) => use(base), storageState: { cookies: [], origins: [] }, viewport: { width: 1400, height: 900 } })

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'ca2-sr6-foundry-e2e-'))
  const config = join(dir, 'library', '.config')
  cpSync('tests/fixtures/mini/custom', join(dir, 'custom'), { recursive: true })
  cpSync('tests/fixtures/sr6/custom', join(dir, 'custom', 'sr6'), { recursive: true })
  mkdirSync(config, { recursive: true })
  writeFileSync(join(config, 'users.xml'), await usersFile([{ username: 'ada', password: PW.ada, name: 'Ada Admin' },
    { username: 'gil', password: PW.gil, role: 'editor', name: 'Gil Editor' }, { username: 'pat', password: PW.pat, role: 'player', name: 'Pat Player' }]))
  server = createServer({ staticDir: 'dist', charDir: join(dir, 'characters'), customDir: join(dir, 'custom'), libraryDir: join(dir, 'library') })
  await new Promise<void>((ok, fail) => server.once('error', fail).listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/`
})
test.afterAll(() => { server.stopJobs(); server.close() })

async function signIn(page: Page, path: string, username: keyof typeof PW) {
  await page.goto(path)
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password', { exact: true }).fill(PW[username])
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByLabel('Username')).toHaveCount(0)
}
const ORIGIN = () => ({ Origin: base.replace(/\/$/, '') })
/** the made-up career runner as `id`, called `street` */
async function putRunner(page: Page, id: string, street: string) {
  const xml = readFileSync('tests/fixtures/sr6/runner-career.xml', 'utf8').replace('id="career-wisp-1"', `id="${id}"`).replace('streetName="Wisp Lantern"', `streetName="${street}"`)
  expect((await page.request.put(`/api/sr6/characters/${id}`, { data: xml, headers: { 'Content-Type': 'application/xml', ...ORIGIN() } })).status()).toBe(201)
}
/** the download's file name and its JSON, checked against the schema when it's an SR6 file */
async function file(dl: Promise<Download>) {
  const d = await dl, f = JSON.parse(readFileSync((await d.path())!, 'utf8'))
  if (f.format === 'chummer-sr6-export') expect(check(f), JSON.stringify(check.errors)).toBe(true)
  return { name: d.suggestedFilename(), f }
}
const streets = (f: { runners: { streetName: string }[] }) => f.runners.map(r => r.streetName).sort()

test('Gil: a runner’s editor downloads it for Foundry', async ({ page }) => {
  await signIn(page, '/#/sr6', 'gil')
  for (const [id, street] of [['gil-one', 'Gil One'], ['gil-two', 'Gil Two'], ['gil-three', 'Gil Three']]) await putRunner(page, id, street)
  await page.goto('/#/sr6/c/gil-one/concept')
  const dl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export for Foundry' }).click()
  const { name, f } = await file(dl)
  expect(name).toBe(`Gil-One-${today()}.sr6foundry.json`)
  expect(f).toMatchObject({ format: 'chummer-sr6-export', version: 1, kind: 'runners', descriptions: true, app: { name: 'Chummer Anarchy 2.0' } })
  expect(streets(f)).toEqual(['Gil One'])
  expect(f.runners[0]).toMatchObject({ id: 'gil-one', finalized: true, karma: expect.any(Number) })
})

test('the runner list: ticked runners in one file; Tick a campaign ticks that SR6 campaign’s runners only', async ({ page }) => {
  await signIn(page, '/#/sr6', 'gil')
  camp = (await (await page.request.post('/api/sr6/campaigns', { data: { name: 'Made-up Foundry Table' }, headers: ORIGIN() })).json() as { id: string }).id
  for (const id of ['gil-one', 'gil-two'])
    expect((await page.request.post(`/api/sr6/campaigns/${camp}/runners`, { data: { id }, headers: ORIGIN() })).ok()).toBe(true)
  await page.reload()
  await page.getByRole('button', { name: 'Export for Foundry…' }).click()
  const dlg = page.getByRole('dialog', { name: 'Export runners for Foundry' })
  await expect(dlg).toContainText('For the Chummer SR6 importer in Foundry VTT (shadowrun6-eden): upload the file there with Import from Chummer.')
  await dlg.getByRole('button', { name: 'None' }).click()
  await dlg.getByRole('checkbox', { name: 'Gil One' }).check()
  await dlg.getByRole('checkbox', { name: 'Gil Three' }).check()
  let dl = page.waitForEvent('download')
  await dlg.getByRole('button', { name: 'Download 2 runners' }).click()
  expect(streets((await file(dl)).f)).toEqual(['Gil One', 'Gil Three'])

  await page.getByRole('button', { name: 'Export for Foundry…' }).click()
  await dlg.getByLabel('Tick a campaign').selectOption({ label: 'Made-up Foundry Table' })
  await expect(dlg.getByRole('checkbox', { name: 'Gil One' })).toBeChecked()
  await expect(dlg.getByRole('checkbox', { name: 'Gil Two' })).toBeChecked()
  await expect(dlg.getByRole('checkbox', { name: 'Gil Three' })).not.toBeChecked()
  dl = page.waitForEvent('download')
  await dlg.getByRole('button', { name: 'Download 2 runners' }).click()
  expect(streets((await file(dl)).f)).toEqual(['Gil One', 'Gil Two'])
})

test('NPCs & Critters: a grunt’s row downloads its NPC block; the header dialog says NPCs', async ({ page }) => {
  await signIn(page, '/#/sr6/npcs', 'gil')
  await page.getByRole('button', { name: 'New NPC' }).click()
  await page.getByRole('dialog', { name: 'New NPC' }).getByLabel('From the catalog').selectOption({ label: 'Corner Goon' })
  await page.getByRole('dialog', { name: 'New NPC' }).getByRole('button', { name: 'Create NPC' }).click()
  await expect(page).toHaveURL(/#\/sr6\/n\/[^/]+\/stats$/)
  await page.goto('/#/sr6/npcs')
  const dl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export Corner Goon for Foundry' }).click()
  const { name, f } = await file(dl)
  expect(name).toBe(`Corner-Goon-${today()}.sr6foundry.json`)
  expect(f.runners[0]).toMatchObject({ streetName: 'Corner Goon', npc: { kind: 'grunt', rating: 2, from: { id: 'crb.corner-goon' } } })
  expect(f.runners[0].derived).toBeUndefined()
  await page.getByRole('button', { name: 'Export for Foundry…' }).click()
  const dlg = page.getByRole('dialog', { name: 'Export NPCs for Foundry' })
  await expect(dlg.getByRole('button', { name: 'Download 0 NPCs' })).toBeDisabled()
  await expect(dlg).toContainText('shadowrun6-eden')
})

test('Game data: the GM downloads book data, with or without descriptions', async ({ page }) => {
  await signIn(page, '/#/sr6/data', 'gil')
  // folded on Game data: the header's link opens it
  await page.locator('.menubar .tools').getByRole('link', { name: 'Export book data for Foundry' }).click()
  const panel = page.getByRole('region', { name: 'Export book data for Foundry' })
  await expect(panel.getByRole('checkbox', { name: /Include book descriptions/ })).toBeChecked()
  await expect(panel).toContainText('For your own Foundry only. Don’t share this file.')
  await panel.getByRole('button', { name: 'None' }).click()
  await expect(panel.getByRole('button', { name: 'Download book data' })).toBeDisabled()
  await panel.getByRole('checkbox', { name: /^CRB\b(?!-)/ }).check()
  let dl = page.waitForEvent('download')
  await panel.getByRole('button', { name: 'Download book data' }).click()
  let { name, f } = await file(dl)
  expect(name).toBe(`books-${today()}.sr6foundry.json`)
  expect(f).toMatchObject({ kind: 'books', descriptions: true })
  expect(f.books.map((b: { source: { id: string } }) => b.source.id)).toEqual(['CRB'])
  expect(f.books[0].entries.some((e: object) => 'description' in e)).toBe(true)
  await panel.getByRole('checkbox', { name: /Include book descriptions/ }).uncheck()
  dl = page.waitForEvent('download')
  await panel.getByRole('button', { name: 'Download book data' }).click();
  ({ f } = await file(dl))
  expect(f.descriptions).toBe(false)
  expect(JSON.stringify(f.books)).not.toContain('"description"')
})

test('a compendium downloads for Foundry from its page, marked compendium', async ({ page }) => {
  await signIn(page, '/#/sr6/compendiums', 'gil')
  await page.getByRole('button', { name: 'New compendium' }).click()
  const d = page.getByRole('dialog', { name: 'New compendium' })
  await d.getByLabel('Name').fill('Street Kit')
  await d.getByLabel('Source id').fill('street')
  await d.getByRole('button', { name: 'Create compendium' }).click()
  await expect(page.getByRole('heading', { name: 'Street Kit', level: 1 })).toBeVisible()
  const dl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export for Foundry' }).click()
  const { name, f } = await file(dl)
  expect(name).toBe(`compendium-STREET-${today()}.sr6foundry.json`)
  expect(f).toMatchObject({ kind: 'books', descriptions: true })
  expect(f.books[0].source).toMatchObject({ id: 'STREET', name: 'Street Kit', canon: false, compendium: true })
})

test('Pat: no book panel on Game data; he downloads his own runner', async ({ page }) => {
  await signIn(page, '/#/sr6/data', 'pat')
  await expect(page.getByRole('heading', { name: 'Game data', level: 1 })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Export book data for Foundry' })).toHaveCount(0)
  await expect(page.locator('#foundry-export')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Export book data for Foundry' })).toHaveCount(0)
  await putRunner(page, 'pat-one', 'Pat One')
  await page.goto('/#/sr6')
  await expect(page.getByRole('link', { name: 'Pat One' })).toBeVisible()
  await page.getByRole('link', { name: 'Pat One' }).click()
  const dl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export for Foundry' }).click()
  expect(streets((await file(dl)).f)).toEqual(['Pat One'])
})

test('isolation: the Anarchy runner list still writes Chummer Anarchy export files', async ({ page }) => {
  await page.goto('/#/')
  await page.getByRole('button', { name: 'Shadowrun Anarchy 2.0' }).click() // a new browser picks its game first
  await signIn(page, '/#/', 'gil')
  await page.getByRole('button', { name: 'New runner' }).click()
  await page.getByRole('button', { name: 'Create runner' }).click()
  await page.getByLabel('Street name').fill('Anarchy Gil')
  await expect(page.getByRole('status', { name: 'Save status' })).toContainText('All changes saved')
  await page.goto('/')
  await page.getByRole('button', { name: 'Export for Foundry…' }).click()
  const dlg = page.getByRole('dialog', { name: 'Export runners for Foundry' })
  await expect(dlg).toContainText('For the Chummer Anarchy 2.0 importer in Foundry VTT: upload the file there')
  await dlg.getByRole('button', { name: 'All' }).click()
  const dl = page.waitForEvent('download')
  await dlg.getByRole('button', { name: 'Download 1 runner' }).click()
  const { name, f } = await file(dl)
  expect(name).toMatch(/\.ca2foundry\.json$/)
  expect(f).toMatchObject({ format: 'chummer-anarchy2-export', kind: 'runners' })
  expect(f.runners.map((r: { streetName: string }) => r.streetName)).toEqual(['Anarchy Gil'])
})
