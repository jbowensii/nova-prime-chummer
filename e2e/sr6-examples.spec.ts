import { test, expect, type Page } from '@playwright/test'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { usersFile } from '../server/auth.mjs'
import { createServer } from '../server/server.mjs'

// SR6 book copies end to end, on a server of its own with the made-up SR6 fixture (tests/fixtures/sr6/custom copied to
// custom/sr6/) plus a made-up sample runner (tests/fixtures/sr6/sample-glow-runner.xml, the importer's golden file, in
// imported/samples.xml as an import lists it) and a made-up sample contact in npcs.xml. Pat (a player) loads the example
// characters on Your runners; Gil (an editor) loads the book NPCs: grunts, the contact, critters, spirits and sprites.
const PW = { gil: 'gil-password-1', pat: 'pat-password-1' }
const DESK = { width: 1400, height: 900 }
const CONTACT = '  <npc id="crb.fixer-fred" source="CRB" page="210" group="Contact" bod="2" agi="2" rea="3" str="2" wil="3" log="4" int="4" cha="5" ess="6"><name>Fixer Fred</name><skills>Gab 5</skills><text/></npc>\n'
// how 0.9.0 loaded a sample contact: a grunt of group Contact under its book key
const OLD_CONTACT = '<?xml version="1.0" encoding="UTF-8"?>\n<sr6:character xmlns:sr6="urn:chummer-sr6:character:1" formatVersion="1" id="old-fred" streetName="Fixer Fred" metatype="" method="priority" updatedAt="2026-10-03T00:00:00.000Z" sampleKey="CRB|crb.fixer-fred">'
  + '<npc kind="grunt" group="Contact" fromKind="npcs" fromId="crb.fixer-fred" fromName="Fixer Fred" fromSource="CRB" fromPage="210"><stat key="cha" value="5"/></npc><build method="priority" magic="mundane"/></sr6:character>\n'
// Wild Life printing the same Fuzzbeast and a tougher Rustmole (made up), and a 0.9.4 copy of its Fuzzbeast
const WILD_LIFE = '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="critters" version="1">\n'
  + '  <critter id="wl.fuzzbeast" source="WL" page="40" category="critter" bod="4" agi="3" rea="4" str="5" wil="2" log="1" int="3" cha="1" ess="6" edg="1" dr="6" init="7 + 1D6" actions="1/1" cm="10" move="10/15/+1"><name>Fuzzbeast</name><skills>Sneaking 3, Running 2</skills><powers>Glimmer, Thick Fur</powers><weaknesses>Allergy (soap, mild)</weaknesses><attacks>Bite 4P</attacks><text>Made-up words of its own.</text></critter>\n'
  + '  <critter id="wl.rustmole" source="WL" page="41" category="critter" bod="6" agi="2" rea="3" str="2" wil="2" log="1" int="4" cha="1" ess="5.3" edg="1" dr="5" init="7 + 1D6" actions="1/1" cm="9" move="5/9/+1"><name>Rustmole</name><skills>Sneaking 4</skills><powers>Glimmer</powers><attacks>Claws 3P</attacks><augmentations>Made-up Iron Teeth</augmentations><text/></critter>\n</sr6:data>\n'
const WL_FUZZ = '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<sr6:character xmlns:sr6="urn:chummer-sr6:character:1" formatVersion="1" id="wl-fuzz" streetName="Fuzzbeast" metatype="" method="priority" updatedAt="2026-10-03T00:00:00.000Z" sampleKey="WL|wl.fuzzbeast">'
  + '<npc kind="critter" fromKind="critters" fromId="wl.fuzzbeast" fromName="Fuzzbeast" fromSource="WL" fromPage="40"><stat key="bod" value="4"/></npc><build method="priority" magic="mundane"/></sr6:character>\n'
let server: ReturnType<typeof createServer>, base = '', importedDir = ''

test.describe.configure({ mode: 'serial' })
test.use({ baseURL: async ({}, use) => use(base), storageState: { cookies: [], origins: [] }, viewport: DESK })

test.beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ca2-sr6-examples-e2e-')), config = join(dir, 'library', '.config')
  const imported = importedDir = join(dir, 'custom', 'sr6', 'imported')
  cpSync('tests/fixtures/mini/custom', join(dir, 'custom'), { recursive: true })
  cpSync('tests/fixtures/sr6/custom', join(dir, 'custom', 'sr6'), { recursive: true })
  const npcs = join(imported, 'crb', 'npcs.xml')
  writeFileSync(npcs, readFileSync(npcs, 'utf8').replace('</sr6:data>', `${CONTACT}</sr6:data>`))
  mkdirSync(join(imported, 'crb', 'samples'), { recursive: true })
  cpSync('tests/fixtures/sr6/sample-glow-runner.xml', join(imported, 'crb', 'samples', 'crb.glow-runner.xml'))
  writeFileSync(join(imported, 'samples.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<samples>\n'
    + '  <sample source="CRB" href="crb/samples/crb.glow-runner.xml" name="Glow Runner" role="Archetype" page="81"/>\n</samples>\n')
  mkdirSync(config, { recursive: true })
  writeFileSync(join(config, 'users.xml'), await usersFile([{ username: 'ada', password: 'ada-password-1', name: 'Ada Admin' },
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
const row = (page: Page, name: string) => page.locator('.dossier').filter({ has: page.getByRole('link', { name, exact: true }) })
const status = (page: Page) => page.locator('p.banner[role=status]')

test('Your runners: Load example characters copies the book’s sample runners once', async ({ page }) => {
  await signIn(page, '/#/sr6', 'pat')
  await expect(page.getByText('No runners yet.')).toBeVisible()
  await page.getByRole('button', { name: 'Load example characters' }).click()
  await expect(status(page)).toHaveText('Added 1 example character.')
  await expect(row(page, 'Glow Runner')).toContainText('Glimmerkin, Priority')
  await page.getByRole('button', { name: 'Load example characters' }).click()
  await expect(status(page)).toHaveText('The example characters are already in your runners.')
  await expect(row(page, 'Glow Runner')).toHaveCount(1)
  // the copy is Pat's own runner, built from the stat block, with what didn't map in its notes
  await row(page, 'Glow Runner').getByRole('link', { name: 'Glow Runner' }).click()
  await expect(page).toHaveURL(/#\/sr6\/c\/[^/]+\/concept$/)
  await expect(page.getByLabel('Notes')).toHaveValue(/Skills not in the catalog: Basket Weaving 2\./)
  // players never see NPCs
  await expect(page.getByRole('link', { name: 'NPCs & Critters' })).toHaveCount(0)
})

test('NPCs & Critters: Load book NPCs copies the grunts, the sample contact, critters, spirits and sprites once', async ({ page }) => {
  await signIn(page, '/#/sr6/npcs', 'gil')
  await expect(page.getByRole('heading', { name: 'NPCs & Critters' })).toBeVisible()
  // a copy of the contact from 0.9.0, a grunt of group Contact: Load book NPCs makes it a contact and doesn't add another
  await page.locator('input[type=file]').setInputFiles([{ name: 'fred.xml', mimeType: 'application/xml', buffer: Buffer.from(OLD_CONTACT) }])
  await expect(status(page)).toHaveText('Imported Fixer Fred.')
  await expect(row(page, 'Fixer Fred')).toContainText('Grunt')
  await page.getByRole('button', { name: 'Load book NPCs' }).click()
  await expect(status(page)).toHaveText('Added 9 book NPCs. 1 sample contact is a contact now.')
  await expect(row(page, 'Fixer Fred')).toHaveCount(1)
  await expect(row(page, 'Fixer Fred').locator('.npckind')).toHaveText('Contact')
  await expect(row(page, 'Corner Goon').locator('.npckind')).toHaveText('Grunt PR 2')
  await expect(row(page, 'Fuzzbeast').locator('.npckind')).toHaveText('Critter')
  await expect(row(page, 'Spirit of Puddles').locator('.npckind')).toHaveText('Spirit F 3')
  await expect(row(page, 'Glitch Sprite').locator('.npckind')).toHaveText('Sprite L 3')
  await expect(page.locator('.dossier')).toHaveCount(10)
  await page.getByRole('button', { name: 'Load book NPCs' }).click()
  await expect(status(page)).toHaveText('The book NPCs are already in your NPCs.')
  // the contact's block says Contact, not Grunt · Contact; New NPC lists it under its own kind
  await row(page, 'Fixer Fred').getByRole('link', { name: 'Fixer Fred' }).click()
  await expect(page.getByRole('region', { name: 'NPC block' })).toContainText('Contact')
  await expect(page.getByRole('region', { name: 'NPC block' })).not.toContainText('Grunt')
  await page.goto('/#/sr6/npcs')
  await page.getByRole('button', { name: 'New NPC' }).click()
  const dlg = page.getByRole('dialog')
  await expect(dlg.getByLabel('From the catalog').locator('option', { hasText: 'Fixer Fred' })).toHaveCount(0) // not a grunt
  await dlg.getByLabel('Kind').selectOption({ label: 'Contact' })
  await expect(dlg.getByLabel('From the catalog').locator('option')).toHaveText(['Fixer Fred', 'Blank'])
})

test('NPCs & Critters: a critter in two books loads once when the same, numbered when not; Tidy book copies sorts the old copies', async ({ page }) => {
  // Wild Life comes in after the core rulebook's NPCs were loaded, with a 0.9.4 copy of its Fuzzbeast
  mkdirSync(join(importedDir, 'wl'), { recursive: true })
  writeFileSync(join(importedDir, 'wl', 'critters.xml'), WILD_LIFE)
  const index = join(importedDir, 'index.xml')
  writeFileSync(index, readFileSync(index, 'utf8').replace('</overlays>', '  <file href="wl/critters.xml"/>\n</overlays>'))
  await signIn(page, '/#/sr6/npcs', 'gil')
  await page.locator('input[type=file]').setInputFiles([{ name: 'fuzz.xml', mimeType: 'application/xml', buffer: Buffer.from(WL_FUZZ) }])
  await expect(status(page)).toHaveText('Imported Fuzzbeast.')
  await expect(row(page, 'Fuzzbeast')).toHaveCount(2)
  // the confirm lists what moves and what's renamed; Keep them changes nothing
  await page.getByRole('button', { name: 'Tidy book copies' }).click()
  const dlg = page.getByRole('dialog', { name: 'Tidy book copies' })
  await expect(dlg.getByRole('list', { name: 'To the NPC trash' }).getByRole('listitem')).toHaveText(['Fuzzbeast (WL p.40)'])
  await expect(dlg.getByRole('list', { name: 'Renamed' }).getByRole('listitem')).toHaveText(['Rustmole (CRB p.223) → Rustmole #1'])
  await dlg.getByRole('button', { name: 'Keep them' }).click()
  await expect(row(page, 'Fuzzbeast')).toHaveCount(2)
  await page.getByRole('button', { name: 'Tidy book copies' }).click()
  await dlg.getByRole('button', { name: 'Tidy up' }).click()
  await expect(status(page)).toHaveText('Moved to the NPC trash: Fuzzbeast. Renamed: Rustmole #1.')
  await expect(row(page, 'Fuzzbeast')).toHaveCount(1)
  await expect(row(page, 'Rustmole #1')).toHaveCount(1)
  await expect(page.getByRole('link', { name: 'Trash (1)' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Tidy book copies' })).toHaveCount(0)
  // Load book NPCs adds Wild Life's tougher Rustmole as #2, not its Fuzzbeast; pressing again adds nothing
  await page.getByRole('button', { name: 'Load book NPCs' }).click()
  await expect(status(page)).toHaveText('Added 1 book NPC.')
  await expect(row(page, 'Rustmole #2')).toHaveCount(1)
  await expect(row(page, 'Fuzzbeast')).toHaveCount(1)
  await page.getByRole('button', { name: 'Load book NPCs' }).click()
  await expect(status(page)).toHaveText('The book NPCs are already in your NPCs.')
  await expect(page.getByRole('button', { name: 'Tidy book copies' })).toHaveCount(0)
})
