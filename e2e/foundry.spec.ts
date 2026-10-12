// 0.6.0: runners and book data download as Chummer Anarchy export v1 for the Foundry importer.
import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

async function newRunner(page: Page, name: string) {
  await page.goto('/')
  await page.getByRole('button', { name: 'New runner' }).click()
  await page.getByRole('button', { name: 'Create runner' }).click()
  await page.getByLabel('Street name').fill(name)
  await expect(page.getByRole('status', { name: 'Save status' })).toContainText('All changes saved')
}
const json = async (p: Promise<import('@playwright/test').Download>) => JSON.parse(readFileSync((await (await p).path())!, 'utf8'))

test('a runner downloads for Foundry from its editor', async ({ page }) => {
  await newRunner(page, 'Export Me')
  const dl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export for Foundry' }).click()
  expect((await dl).suggestedFilename()).toMatch(/^Export-Me-\d{4}-\d{2}-\d{2}\.ca2foundry\.json$/)
  const f = await json(dl)
  expect(f).toMatchObject({ format: 'chummer-anarchy2-export', version: 1, kind: 'runners' })
  expect(f.runners.map((r: { streetName: string }) => r.streetName)).toEqual(['Export Me'])
})

test('several runners download together from the runner list', async ({ page }) => {
  await newRunner(page, 'Pick One')
  await newRunner(page, 'Pick Two')
  await page.goto('/')
  await page.getByRole('button', { name: 'Export for Foundry…' }).click()
  const dlg = page.getByRole('dialog', { name: 'Export runners for Foundry' })
  await dlg.getByRole('button', { name: 'None' }).click()
  await dlg.getByRole('checkbox', { name: 'Pick One' }).check()
  await dlg.getByRole('checkbox', { name: 'Pick Two' }).check()
  const dl = page.waitForEvent('download')
  await dlg.getByRole('button', { name: 'Download 2 runners' }).click()
  const f = await json(dl)
  expect(f.runners.map((r: { streetName: string }) => r.streetName).sort()).toEqual(['Pick One', 'Pick Two'])
})

test('the GM downloads ticked books, with or without descriptions', async ({ page }) => {
  await page.goto('/#/data/foundry') // (folded on Game data: its address, as its header link, opens it)
  const panel = page.getByRole('region', { name: 'Export book data for Foundry' })
  await expect(panel.getByRole('checkbox', { name: /Include book descriptions/ })).toBeChecked()
  await expect(panel).toContainText('For your own Foundry only. Don’t share this file.')
  await panel.getByRole('button', { name: 'None' }).click()
  await panel.getByRole('checkbox', { name: /^TEST\b/ }).check()
  let dl = page.waitForEvent('download')
  await panel.getByRole('button', { name: 'Download book data' }).click()
  expect((await dl).suggestedFilename()).toMatch(/^books-\d{4}-\d{2}-\d{2}\.ca2foundry\.json$/)
  let f = await json(dl)
  expect(f.books.map((b: { source: { id: string } }) => b.source.id)).toEqual(['TEST'])
  expect(f.descriptions).toBe(true)
  await panel.getByRole('checkbox', { name: /Include book descriptions/ }).uncheck()
  dl = page.waitForEvent('download')
  await panel.getByRole('button', { name: 'Download book data' }).click()
  f = await json(dl)
  expect(f.descriptions).toBe(false)
  expect(JSON.stringify(f.books)).not.toContain('"description"')
})

test('book data doesn’t go out without the table rules when they can’t be loaded', async ({ page }) => {
  await page.route('**/custom/table-rules.xml', r => r.fulfill({ status: 500, body: 'boom' }))
  await page.goto('/#/data/foundry') // (folded on Game data: its address, as its header link, opens it)
  const panel = page.getByRole('region', { name: 'Export book data for Foundry' })
  let downloaded = false
  page.on('download', () => {
    downloaded = true
  })
  await panel.getByRole('button', { name: 'Download book data' }).click()
  await expect(panel.getByRole('alert')).toContainText('Couldn’t build the book data: the table rules couldn’t be fetched (status 500)')
  expect(downloaded).toBe(false)
})

test('a book’s own sample characters go out under that book', async ({ page }) => {
  await page.goto('/#/data/foundry') // (folded on Game data: its address, as its header link, opens it)
  const panel = page.getByRole('region', { name: 'Export book data for Foundry' })
  await panel.getByRole('button', { name: 'None' }).click()
  await panel.getByRole('checkbox', { name: /^PREGENS\b/ }).check()
  await panel.getByRole('checkbox', { name: /^TEST\b/ }).check()
  const dl = page.waitForEvent('download')
  await panel.getByRole('button', { name: 'Download book data' }).click()
  const f = await json(dl)
  const by = (id: string) => f.books.find((b: { source: { id: string } }) => b.source.id === id)
  expect(by('PREGENS').characters.map((r: { streetName: string }) => r.streetName)).toEqual(['Test Face'])
  expect(by('TEST').characters).toBeUndefined()
  await expect(panel.getByRole('status')).toHaveCount(0)
})

test('a book’s NPCs go out under that book', async ({ page }) => {
  await page.goto('/#/data/foundry') // (folded on Game data: its address, as its header link, opens it)
  const panel = page.getByRole('region', { name: 'Export book data for Foundry' })
  await panel.getByRole('button', { name: 'None' }).click()
  await panel.getByRole('checkbox', { name: /^TESTC\b/ }).check()
  await panel.getByRole('checkbox', { name: /^PREGENS\b/ }).check()
  const dl = page.waitForEvent('download')
  await panel.getByRole('button', { name: 'Download book data' }).click()
  const f = await json(dl)
  const by = (id: string) => f.books.find((b: { source: { id: string } }) => b.source.id === id)
  expect(by('TESTC').npcs.map((r: { streetName: string; npc: unknown }) => [r.streetName, r.npc])).toEqual([
    ['Made-Up Goon', { kind: 'npc', tier: 'regular', fightingSpirit: 'low' }],
  ])
  expect(by('PREGENS').npcs).toBeUndefined()
})

test('a sample that can’t be read is left out and named; the book data still downloads', async ({ page }) => {
  await page.route('**/custom/imported/pregens/samples/*.xml', r => r.fulfill({ status: 404, body: '' }))
  await page.goto('/#/data/foundry') // (folded on Game data: its address, as its header link, opens it)
  const panel = page.getByRole('region', { name: 'Export book data for Foundry' })
  await panel.getByRole('button', { name: 'None' }).click()
  await panel.getByRole('checkbox', { name: /^PREGENS\b/ }).check()
  await panel.getByRole('checkbox', { name: /^TESTC\b/ }).check()
  const dl = page.waitForEvent('download')
  await panel.getByRole('button', { name: 'Download book data' }).click()
  const f = await json(dl)
  const by = (id: string) => f.books.find((b: { source: { id: string } }) => b.source.id === id)
  expect(by('PREGENS').characters).toBeUndefined()
  expect(by('TESTC').characters.map((r: { streetName: string }) => r.streetName)).toEqual(['Test Face'])
  await expect(panel.getByRole('status')).toContainText('Test Face (PREGENS): couldn’t be fetched.')
})

test('a compendium downloads like a book, marked compendium, with its own text', async ({ page }) => {
  const src = `F${Date.now().toString(36).toUpperCase().slice(-6)}` // the e2e server keeps compendiums between runs
  await page.goto('/#/compendiums')
  await page.getByRole('button', { name: 'New compendium' }).click()
  const d = page.getByRole('dialog', { name: 'New compendium' })
  await d.getByLabel('Name').fill('Export Gear')
  await d.getByLabel('Source id').fill(src)
  await d.getByRole('button', { name: 'Create compendium' }).click()
  await expect(page.getByRole('heading', { name: 'Export Gear', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: 'Add an item' }).click()
  const f1 = page.getByRole('dialog').last()
  await f1.getByLabel('Name', { exact: true }).fill('Made-up Lamp')
  await f1.getByLabel('Description', { exact: true }).fill('Our own lamp text.')
  await f1.getByRole('button', { name: 'Add item' }).click()
  await expect(page.locator('.toast', { hasText: 'Added Made-up Lamp.' })).toBeVisible()

  const dl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export for Foundry' }).click()
  expect((await dl).suggestedFilename()).toBe(`compendium-${src}-${new Date().toLocaleDateString('en-CA')}.ca2foundry.json`)
  const f = await json(dl)
  expect(f).toMatchObject({ kind: 'books', descriptions: true })
  expect(f.books).toHaveLength(1)
  expect(f.books[0].source).toMatchObject({ id: src, name: 'Export Gear', canon: false, compendium: true })
  expect(f.books[0].items).toEqual([expect.objectContaining({ name: 'Made-up Lamp', source: src, description: 'Our own lamp text.' })])
  expect(f.tableRules).toEqual([])

  await page.goto('/#/compendiums')
  await page.getByRole('button', { name: 'Delete Export Gear' }).click()
  await page.getByRole('button', { name: 'Delete compendium' }).click()
  await expect(page.getByRole('region', { name: 'Your compendiums' })).not.toContainText('Export Gear')
})
