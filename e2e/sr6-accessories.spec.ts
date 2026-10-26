// Accessories on their host (src/sr6/catalog/domain/categories.ts, budgets.ts hostBonus), on the made-up SR6 fixture: a
// Torqlimb accessory goes on the Torqlimb arm (the picker offers only accessories that fit this host), its bonus lands
// on the arm only (the line, the sheet's line and Review's derived values show the arm's own Strength; the runner's stays).
import { test, expect, type Page } from '@playwright/test'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { usersFile } from '../server/auth.mjs'
import { createServer } from '../server/server.mjs'

const PW = 'pat-password-1'
let server: ReturnType<typeof createServer>,
  base = ''

test.use({ baseURL: async ({}, use) => use(base), storageState: { cookies: [], origins: [] }, viewport: { width: 1400, height: 900 } })

test.beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ca2-sr6-acc-e2e-'))
  cpSync('tests/fixtures/mini/custom', join(dir, 'custom'), { recursive: true })
  cpSync('tests/fixtures/sr6/custom', join(dir, 'custom', 'sr6'), { recursive: true })
  // eyeware/earware hosts (slot-based) and their enhancements, with a weapon accessory that must never be offered to them
  const add = (file: string, xml: string) => {
    const p = join(dir, 'custom', 'sr6', 'imported', 'crb', file)
    writeFileSync(
      p,
      readFileSync(p, 'utf8').replace(
        '</sr6:data>',
        `${xml}
</sr6:data>`,
      ),
    )
  }
  add(
    'augmentations.xml',
    `<augmentation id="crb.cyberears-basic" source="CRB" page="285" type="cyberware" category="Earware" essence="0.1" capacity="4" avail="2" cost="3000"><name>Cyberears</name><slot id="cyberear-implant" value="4"/><text/></augmentation>
  <augmentation id="crb.cybereyes-basic" source="CRB" page="285" type="cyberware" category="Eyeware" essence="0.1" capacity="4" avail="2" cost="4000"><name>Cybereyes</name><slot id="cybereye-implant" value="4"/><text/></augmentation>`,
  )
  add(
    'gear.xml',
    `<gear id="crb.audio-enhancement" source="CRB" page="276" category="Audio enhancement" capacity="[1]" avail="1" cost="500"><name>Audio enhancement</name><fits slot="audio"/><fits slot="cyberear-implant"/><text/></gear>
  <gear id="crb.select-sound-filter" source="CRB" page="276" category="Audio enhancement" capacity="[1]" avail="1" cost="500"><name>Select sound filter</name><fits slot="audio"/><fits slot="cyberear-implant"/><text/></gear>
  <gear id="crb.image-link" source="CRB" page="275" category="Visual enhancement" capacity="[1]" avail="1" cost="25"><name>Image link</name><fits slot="optical"/><fits slot="cybereye-implant"/><text/></gear>
  <gear id="crb.fn-p93-flashlight" source="CRB" page="259" category="Weapon accessory" avail="1" cost="75"><name>FN P93 Flashlight</name><fits slot="top"/><fits slot="under"/><text/></gear>`,
  )
  mkdirSync(join(dir, 'library', '.config'), { recursive: true })
  writeFileSync(join(dir, 'library', '.config', 'users.xml'), await usersFile([{ username: 'pat', password: PW, role: 'player', name: 'Pat Player' }]))
  server = createServer({ staticDir: 'dist', charDir: join(dir, 'characters'), customDir: join(dir, 'custom'), libraryDir: join(dir, 'library') })
  await new Promise<void>((ok, fail) => server.once('error', fail).listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/`
})
test.afterAll(() => {
  server.stopJobs()
  server.close()
})

async function signIn(page: Page) {
  await page.goto('/#/sr6')
  await page.getByLabel('Username').fill('pat')
  await page.getByLabel('Password', { exact: true }).fill(PW)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByLabel('Username')).toHaveCount(0)
}

test('a cyberlimb accessory goes on the arm, and its bonus is the arm’s only', async ({ page }) => {
  await signIn(page)
  await page.getByRole('button', { name: 'New runner' }).click()
  const nr = page.getByRole('dialog', { name: 'New runner' })
  await nr.getByLabel('Street name').fill('Chrome Arm')
  await nr.getByRole('button', { name: 'Create runner' }).click()
  await expect(page).toHaveURL(/#\/sr6\/c\/[^/]+\/concept$/)
  const tabs = page.getByRole('navigation', { name: 'Character sections' }).getByRole('link')
  const work = page.locator('main.work'),
    dlg = page.getByRole('dialog')

  // Review before: the runner's Strength
  await tabs.filter({ hasText: 'Review' }).click()
  const strength = page.locator('.sr6-derived div', { hasText: /^Strength/ }).locator('dd')
  const str = Number(await strength.innerText())

  // the arm, shown with its category
  await tabs.filter({ hasText: 'Augmentations' }).click()
  await work.getByRole('button', { name: 'Add an augmentation…' }).click()
  await dlg.getByPlaceholder('Search').fill('torqlimb')
  await dlg.getByText('Torqlimb: Limb (synthetic)').click()
  if (await dlg.getByRole('button', { name: 'Add', exact: true }).count()) await dlg.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(dlg).toHaveCount(0)
  await expect(work.getByText('Torqlimb: Limb (synthetic)').first()).toBeVisible()

  // its accessories: only ones that fit this host are offered — the Torqlimb's is, the eyeware's (Glare filter) is not
  await work.getByRole('button', { name: 'Add an accessory to Torqlimb: Limb (synthetic)' }).click()
  await expect(dlg).toContainText('Torqlimb accessory: Plating 1')
  await expect(dlg.locator('li', { hasText: 'Glare filter' })).toHaveCount(0)
  // (a rated accessory is one entry per rating: the level is picked outright)
  await dlg.getByText('Torqlimb accessory: Plating 2', { exact: true }).click()
  await expect(dlg).toHaveCount(0)

  // a Strength bonus on the plating: the arm's own Strength
  await work.getByRole('button', { name: 'Add a bonus to Torqlimb accessory: Plating 2 on Torqlimb: Limb (synthetic)' }).click()
  await dlg.getByLabel('Bonus to').selectOption({ label: 'Strength' })
  await dlg.getByLabel('Value').fill('2')
  await dlg.getByRole('button', { name: 'Add bonus' }).click()
  await expect(dlg).toHaveCount(0)
  await expect(work.getByLabel('Torqlimb: Limb (synthetic): its own values')).toHaveText(`This item: STR ${str + 2}`)

  // Review: the runner's Strength unchanged; the arm's listed with its own
  await tabs.filter({ hasText: 'Review' }).click()
  await expect(strength).toHaveText(String(str))
  await expect(page.locator('.sr6-derived div', { hasText: 'Torqlimb: Limb (synthetic)' }).locator('dd')).toHaveText(`STR ${str + 2}`)

  // the sheet: the arm's line with its accessory and its own Strength
  await tabs.filter({ hasText: 'Print' }).click()
  await expect(page.getByText(`Torqlimb accessory: Plating 2 (STR ${str + 2})`).first()).toBeVisible()
})

test('cyberears and cybereyes are offered their own enhancements and never a weapon accessory', async ({ page }) => {
  await signIn(page)
  await page.getByRole('button', { name: 'New runner' }).click()
  const nr = page.getByRole('dialog', { name: 'New runner' })
  await nr.getByLabel('Street name').fill('Ears And Eyes')
  await nr.getByRole('button', { name: 'Create runner' }).click()
  await expect(page).toHaveURL(/#\/sr6\/c\/[^/]+\/concept$/)
  const tabs = page.getByRole('navigation', { name: 'Character sections' }).getByRole('link')
  const work = page.locator('main.work'),
    dlg = page.getByRole('dialog')
  await tabs.filter({ hasText: 'Augmentations' }).click()
  for (const [host, offered, other] of [
    ['Cyberears', ['Audio enhancement', 'Select sound filter'], 'Image link'],
    ['Cybereyes', ['Image link'], 'Audio enhancement'],
  ] as const) {
    await work.getByRole('button', { name: 'Add an augmentation…' }).click()
    await dlg.getByPlaceholder('Search').fill(host)
    await dlg.getByText(host, { exact: false }).first().click()
    if (await dlg.getByRole('button', { name: 'Add', exact: true }).count()) await dlg.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(dlg).toHaveCount(0)
    await work.getByRole('button', { name: new RegExp(`^Add an accessory to .*${host}`) }).click()
    for (const name of offered) await expect(dlg).toContainText(name)
    await expect(dlg.locator('li', { hasText: other })).toHaveCount(0)
    await expect(dlg.locator('li', { hasText: 'FN P93 Flashlight' })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(dlg).toHaveCount(0)
  }
})
