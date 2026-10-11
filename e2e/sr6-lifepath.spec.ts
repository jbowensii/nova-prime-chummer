import { test, expect } from '@playwright/test'
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { usersFile } from '../server/auth.mjs'
import { createServer } from '../server/server.mjs'
import { savedOnServer } from './session'

// SR6 lifepath end to end (the Sixth World Companion's rules) on a server of its own: the made-up SR6 fixture with the
// made-up lifepath set (tests/fixtures/sr6/lifepath/lifemodules.xml) and the fixture's invented creation rules (8 adult
// modules is 7 there, the best attribute rises by 4, one module may be taken twice, 2 karma a contact rating past the
// points). All names made up.
const PW = 'ada-password-1'
const SHOTS = '.extract/screenshots/sr6-lifepath'
let server: ReturnType<typeof createServer>, base = '', dir = ''

test.describe.configure({ mode: 'serial' })
test.use({ baseURL: async ({}, use) => use(base), storageState: { cookies: [], origins: [] }, viewport: { width: 1400, height: 900 } })

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'ca2-sr6-lifepath-e2e-'))
  const config = join(dir, 'library', '.config')
  cpSync('tests/fixtures/mini/custom', join(dir, 'custom'), { recursive: true })
  cpSync('tests/fixtures/sr6/custom', join(dir, 'custom', 'sr6'), { recursive: true })
  cpSync('tests/fixtures/sr6/lifepath/lifemodules.xml', join(dir, 'custom', 'sr6', 'imported', 'crb', 'lifemodules.xml'))
  mkdirSync(config, { recursive: true })
  writeFileSync(join(config, 'users.xml'), await usersFile([{ username: 'ada', password: PW, name: 'Ada Admin' }]))
  server = createServer({ staticDir: 'dist', charDir: join(dir, 'characters'), customDir: join(dir, 'custom'), libraryDir: join(dir, 'library') })
  await new Promise<void>((ok, fail) => server.once('error', fail).listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/`
  mkdirSync(SHOTS, { recursive: true })
})
test.afterAll(() => { server.stopJobs(); server.close() })

test('lifepath: opening modules, the best attribute, a module twice, typed contact points and karma past them', async ({ page }) => {
  await page.goto('/#/sr6')
  await page.getByLabel('Username').fill('ada')
  await page.getByLabel('Password', { exact: true }).fill(PW)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('button', { name: 'New runner' }).click()
  const dlg = page.getByRole('dialog', { name: 'New runner' })
  await dlg.getByLabel('Creation method').selectOption('lifepath')
  await dlg.getByLabel('Street name').fill('Lena Path')
  await dlg.getByRole('button', { name: 'Create runner' }).click()
  await expect(page).toHaveURL(/#\/sr6\/c\/[^/]+\/concept$/)
  const tabs = page.getByRole('navigation', { name: 'Character sections' }).getByRole('link')
  const work = page.locator('main.work'), budgets = page.getByRole('complementary', { name: 'Budgets' })

  // Creation method: the metatype (its karma), the opening modules, the best attribute and where its rest goes
  await tabs.filter({ hasText: 'Creation method' }).click()
  await page.getByLabel('Metatype', { exact: true }).selectOption({ label: 'Glimmerkin' })
  await expect(work).toContainText('Cradle Days')
  await expect(work).toContainText('First Hustle 3 skill points, 12,000¥, 2 contact points')
  await page.getByLabel('Best attribute', { exact: true }).selectOption('str')
  await page.getByLabel('Best attribute rest').selectOption('agi')  // Glimmerkin STR 1–4: 3 of the 4, 1 on AGI

  // seven adult modules, Dock Hand twice (a choice per copy); a third copy and a second doubled module aren't offered
  await page.getByRole('button', { name: 'Add Dock Hand' }).click()
  await expect(page.getByRole('button', { name: 'Add Dock Hand' })).toHaveText('Add again')
  await page.getByRole('button', { name: 'Add Dock Hand' }).click()
  await expect(page.getByRole('button', { name: 'Add Dock Hand' })).toHaveCount(0)
  for (const m of ['Clinic Aide', 'Wire Monkey', 'Night Market', 'Rooftop Chase', 'Odd Jobs']) {
    await page.getByRole('button', { name: `Add ${m}` }).click()
    await expect(page.getByRole('button', { name: `Add ${m}` })).toHaveCount(0)  // no second doubled module
  }
  await expect(page.getByRole('heading', { name: 'Adult modules: 7 of 7' })).toBeVisible()
  // awakened only: offered to this mundane runner too, marked (taken, it is a Review error)
  await expect(work.locator('tr', { hasText: 'Glow Study' })).toContainText('(for awakened runners)')
  const dock = work.locator('.row', { hasText: 'Dock Hand' })
  await expect(dock).toHaveCount(2)
  await dock.nth(0).getByLabel('Choice 1 (1)').selectOption('bod')
  await dock.nth(1).getByLabel('Choice 1 (1)').selectOption('str')
  await page.screenshot({ path: `${SHOTS}/method.png`, fullPage: true })

  // Attributes: STR at its maximum from the bonus, AGI one up
  await tabs.filter({ hasText: 'Attributes' }).click()
  // (the Creation method tab's rules name Strength too: wait for the Attributes tab)
  await expect(work.getByRole('heading', { name: 'Attributes', exact: true })).toBeVisible()
  await expect(work.locator('tr', { hasText: 'Strength' })).toContainText('4 max')
  await expect(work.locator('tr', { hasText: 'Agility' }).locator('td.num').first()).toHaveText('2')
  await expect(page.getByText('Attribute points:')).toContainText('4 left of 4')  // Rooftop Chase 2, both Dock Hand choices

  // Contacts: street points for a street contact, medical (and any-type) for a medical one, a rating past them in karma
  await tabs.filter({ hasText: 'Contacts & lifestyle' }).click()
  await expect(work).toContainText('12 left of 12')
  await page.getByRole('button', { name: 'Add a contact' }).click()
  await page.getByLabel('Contact 1 type 1').selectOption('street')
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Raise Contact 1 connection' }).click()
    await page.getByRole('button', { name: 'Raise Contact 1 loyalty' }).click()
  }
  await page.getByRole('button', { name: 'Add a contact' }).click()
  await page.getByLabel('Contact 2 type 1').selectOption('medical')
  await page.getByRole('button', { name: 'Raise Contact 2 connection' }).click()
  await page.getByRole('button', { name: 'Raise Contact 2 loyalty' }).click()
  await expect(work).toContainText('2 left of 12')  // Wire Monkey's matrix and engineering points
  await expect(work).not.toContainText('Ratings past the points')
  await page.getByRole('button', { name: 'Raise Contact 2 loyalty' }).click()
  await expect(work).toContainText('Ratings past the points: 2 karma.')
  await expect(budgets.locator('details', { hasText: 'Karma' }).locator('summary')).toContainText('31left of 40')  // Glimmerkin 7, the rating 2
  await page.screenshot({ path: `${SHOTS}/contacts.png`, fullPage: true })

  // the contacts table fits: both type selects side by side, Remove inside the box, no sideways scroll (desktop to phone)
  for (const width of [1400, 1024, 375]) {
    await page.setViewportSize({ width, height: 900 })
    const wrap = work.locator('.contacts-wrap')
    const fits = await wrap.evaluate(el => el.scrollWidth <= el.clientWidth && document.documentElement.scrollWidth <= document.documentElement.clientWidth)
    expect(fits, `no sideways scroll at ${width}px`).toBe(true)
    const box = (await wrap.boundingBox())!
    for (const name of ['Remove Contact 1', 'Remove Contact 2']) {
      const b = (await page.getByRole('button', { name }).boundingBox())!
      expect(b.x + b.width, `${name} inside at ${width}px`).toBeLessThanOrEqual(box.x + box.width + 0.5)
    }
    const [t1, t2] = [(await page.getByLabel('Contact 1 type 1').boundingBox())!, (await page.getByLabel('Contact 1 type 2').boundingBox())!]
    if (width > 400) expect(Math.abs(t1.y - t2.y), `type selects side by side at ${width}px`).toBeLessThan(2)
    await page.screenshot({ path: `${SHOTS}/contacts-${width}.png`, fullPage: true })
  }
  await page.setViewportSize({ width: 1400, height: 900 })

  // Review: none of the lifepath rules is broken; the file keeps it all
  await tabs.filter({ hasText: 'Review' }).click()
  await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible()
  for (const t of ['adult life modules taken', 'taken twice', 'best attribute', 'reaches its maximum', 'Contact points overspent'])
    await expect(work).not.toContainText(t)
  await savedOnServer(page, /bestAttr="str" bestExtra="agi"/)
  const folder = join(dir, 'characters', 'sr6', 'ada'), xml = readFileSync(join(folder, readdirSync(folder)[0]), 'utf8')
  expect(xml).toContain('bestAttr="str" bestExtra="agi"')
  expect(xml.match(/<lifemodule id="crb\.dock-hand"/g)).toHaveLength(2)
  expect(xml).toMatch(/<contact [^>]*types="medical"/)
})
