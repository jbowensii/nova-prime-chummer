import { test, expect } from '@playwright/test'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { usersFile } from '../server/auth.mjs'
import { createServer } from '../server/server.mjs'

// Old catalog ids (owner decision D2), end to end on a server of its own with the made-up SR6 fixture: a runner saved
// before a re-import bought Fizz Rounds as gear and Spring Tendons under the id its rating range was part of. Opened, it
// shows both from the catalog under their new kind and id, and the saved file holds the new ids and the record.
const PW = 'pat-password-1'
const OLD = `<?xml version="1.0" encoding="UTF-8"?>
<sr6:character xmlns:sr6="urn:chummer-sr6:character:1" formatVersion="1" id="old-ids-1" streetName="Rusty Key" metatype="" method="priority" updatedAt="2026-01-02T00:00:00.000Z">
  <build method="priority" magic="mundane" powerPointsBought="0" initiation="0" submersion="0" karmaToNuyen="0">
    <purchase uid="g1" kind="gear" id="crb.fizz-rounds" name="Fizz Rounds" qty="3"/>
    <purchase uid="g2" kind="augmentations" id="crb.spring-tendons-1-4" name="Spring Tendons" rating="2" qty="1"/>
  </build>
</sr6:character>
`
let server: ReturnType<typeof createServer>, base = '', dir = ''

test.use({ baseURL: async ({}, use) => use(base), storageState: { cookies: [], origins: [] }, viewport: { width: 1400, height: 900 } })

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'ca2-sr6-migrate-e2e-'))
  cpSync('tests/fixtures/mini/custom', join(dir, 'custom'), { recursive: true })
  cpSync('tests/fixtures/sr6/custom', join(dir, 'custom', 'sr6'), { recursive: true })
  mkdirSync(join(dir, 'library', '.config'), { recursive: true })
  writeFileSync(join(dir, 'library', '.config', 'users.xml'), await usersFile([{ username: 'pat', password: PW, role: 'player', name: 'Pat Player' }]))
  mkdirSync(join(dir, 'characters', 'sr6', 'pat'), { recursive: true })
  writeFileSync(join(dir, 'characters', 'sr6', 'pat', 'old-ids-1.xml'), OLD)
  server = createServer({ staticDir: 'dist', charDir: join(dir, 'characters'), customDir: join(dir, 'custom'), libraryDir: join(dir, 'library') })
  await new Promise<void>((ok, fail) => server.once('error', fail).listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/`
})
test.afterAll(() => { server.stopJobs(); server.close() })

test('a runner saved with old ids loads them under the new ones, saved once with the record', async ({ page }) => {
  await page.goto('/#/sr6/c/old-ids-1/gear')
  await page.getByLabel('Username').fill('pat')
  await page.getByLabel('Password', { exact: true }).fill(PW)
  await page.getByRole('button', { name: 'Sign in' }).click()
  const ammo = page.locator('section', { has: page.getByRole('heading', { name: 'Ammunition types' }) })
  await expect(ammo.getByRole('row', { name: /Fizz Rounds/ })).toBeVisible()
  await expect(page.locator('section', { has: page.getByRole('heading', { name: 'Other gear' }) })).toContainText('None yet.')
  await page.goto('/#/sr6/c/old-ids-1/augmentations')
  await expect(page.getByRole('row', { name: /Spring Tendons/ })).toBeVisible()
  // the migration is saved by itself (the autosave), the file then holding the new ids
  const file = join(dir, 'characters', 'sr6', 'pat', 'old-ids-1.xml')
  await expect.poll(() => readFileSync(file, 'utf8')).toContain('kind="ammotypes" id="crb.fizz-rounds"')
  const xml = readFileSync(file, 'utf8')
  expect(xml).toContain('kind="augmentations" id="crb.spring-tendons.2"')  // (the level's entry, levels.ts: its rating is the level)
  expect(xml).toMatch(/<migrated from="gear\/crb\.fizz-rounds" to="ammotypes\/crb\.fizz-rounds" at="[^"]+"\/>/)
  expect(xml.match(/<migrated /g)).toHaveLength(2)
})
