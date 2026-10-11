import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { STATE } from './session'

async function newRunner(page: Page, name: string) {
  await page.goto('/')
  await page.getByRole('button', { name: 'New runner' }).click()
  await page.getByRole('button', { name: 'Create runner' }).click()
  await page.getByLabel('Street name').fill(name)
}

test('export a runner as XML, delete it, import the file back', async ({ page }) => {
  await newRunner(page, 'Roundtrip')
  await page.getByRole('link', { name: 'Attributes' }).click()
  await page.getByRole('button', { name: 'Raise Finesse' }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export file' }).click()
  const dl = await download
  expect(dl.suggestedFilename()).toBe('Roundtrip.xml')
  const file = await dl.path()
  const xml = readFileSync(file, 'utf8')
  expect(xml).toContain('streetName="Roundtrip"')
  expect(xml).toMatch(/<attributes str="1" agi="2"/)

  await page.goto('/')
  await page.locator('.dossier', { hasText: 'Roundtrip' }).getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('button', { name: 'Delete runner' }).click()
  await expect(page.getByRole('link', { name: 'Roundtrip' })).toHaveCount(0)
  await page.locator('input[type=file]').setInputFiles({ name: 'Roundtrip.xml', mimeType: 'application/xml', buffer: readFileSync(file) })
  await expect(page.getByRole('status')).toContainText('Imported Roundtrip')
  await expect(page.getByRole('link', { name: 'Roundtrip' })).toBeVisible()
})

test('a broken import file is refused with a reason', async ({ page }) => {
  await page.goto('/')
  await page.locator('input[type=file]').setInputFiles({ name: 'bad.ca2.json', mimeType: 'application/json', buffer: Buffer.from('{"nope": true}') })
  await expect(page.getByRole('status')).toContainText('bad.ca2.json: Missing formatVersion')
})

test('portrait: chosen, zoomed and dragged in its dialog, saved square, shown in the library', async ({ page }) => {
  await newRunner(page, 'Portrait')
  await page.getByRole('button', { name: 'Add a portrait…' }).click()
  const dlg = page.getByRole('dialog', { name: 'Portrait' })
  await dlg.getByLabel('Portrait file').setInputFiles('unraid/icon.png')
  const pic = dlg.locator('.pe-stage img')
  await expect(pic).toBeVisible()
  await dlg.getByLabel('Zoom').fill('2')
  const x0 = await pic.evaluate(e => (e as HTMLElement).offsetLeft)
  const box = (await dlg.locator('.pe-stage').boundingBox())!
  await page.mouse.move(box.x + 128, box.y + 128)
  await page.mouse.down()
  await page.mouse.move(box.x + 168, box.y + 128, { steps: 4 })
  await page.mouse.up()
  expect(await pic.evaluate(e => (e as HTMLElement).offsetLeft)).toBe(x0 + 40) // dragged right, still covering the square
  await dlg.getByRole('button', { name: 'Center' }).click()
  expect(await pic.evaluate(e => (e as HTMLElement).offsetLeft)).toBe(x0)
  await dlg.getByRole('button', { name: 'Save portrait' }).click()
  const face = page.locator('.portrait-row img.face')
  await expect.poll(() => face.evaluate(e => [(e as HTMLImageElement).naturalWidth, (e as HTMLImageElement).naturalHeight])).toEqual([384, 384])
  await expect(page.getByRole('button', { name: 'Change portrait…' })).toBeVisible()
  await page.waitForTimeout(600)
  await page.goto('/')
  const img = page.locator('.dossier img.face').first()
  await expect(img).toBeVisible()
  expect(await img.getAttribute('src')).toMatch(/^data:image\/(jpeg|png);base64,/) // PNG when it has transparent parts (the backdrop shows there)
})

test('phone width: the receipt collapses to a bar and opens on tap', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await newRunner(page, 'Phone')
  const receipt = page.locator('.receipt')
  await expect(receipt.locator('.peek')).toContainText('Left to spend')
  const closed = (await receipt.boundingBox())!.height
  expect(closed).toBeLessThan(80)
  await receipt.locator('.peek').click()
  expect((await receipt.boundingBox())!.height).toBeGreaterThan(300)
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth
    && [...document.querySelectorAll('.work p')].every(p => p.getBoundingClientRect().right <= innerWidth + 1))
  expect(await fits()).toBe(true) // no sideways page scroll, no clipped text
  await page.locator('.receipt .peek').click()
  for (const tab of ['Attributes', 'Skills', 'Shadow Amps', 'Gear & spells', 'Review']) {
    await page.getByRole('link', { name: tab, exact: true }).click()
    expect(await fits(), tab).toBe(true)
  }
})

test('Settings: theme, texture and print style apply and persist', async ({ page }) => {
  await page.goto('/')
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  const attr = (k: string) => page.evaluate(n => document.documentElement.dataset[n], k)
  expect(await bg()).toBe('rgb(245, 244, 240)') // book paper
  expect(await attr('texture')).toBe('accents')
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByLabel('Indigo (dark)').check()
  await page.getByLabel('Full book').check()
  await page.getByLabel('Full color').check()
  expect(await bg()).toBe('rgb(29, 25, 54)')
  await page.reload()
  expect(await bg()).toBe('rgb(29, 25, 54)')
  expect(await attr('texture')).toBe('full')
  expect(await attr('print')).toBe('color')
})

test('Finalize can be undone on the Review tab until earnings are recorded', async ({ page }) => {
  await newRunner(page, 'Oops')
  await page.getByRole('link', { name: 'Review' }).click()
  await page.getByRole('button', { name: 'Finalize runner' }).click()
  await page.getByRole('button', { name: 'Finalize', exact: true }).click()
  await expect(page.locator('.topbar .runstate')).toHaveText('Finalized')
  await page.getByRole('link', { name: 'Review' }).click()
  await page.getByRole('button', { name: 'Reopen creation' }).click()
  await expect(page.locator('.topbar .runstate')).toHaveText('Draft')
  await page.getByRole('button', { name: 'Finalize runner' }).click()
  await page.getByRole('button', { name: 'Finalize', exact: true }).click()
  await page.getByLabel('Nuyen earned').fill('1000')
  await page.getByRole('button', { name: 'Record earnings' }).click()
  await page.getByRole('button', { name: 'Record it' }).click()
  await page.getByRole('link', { name: 'Review' }).click()
  await expect(page.getByRole('button', { name: 'Reopen creation' })).toHaveCount(0)
  await expect(page.getByText(/the ledger has earnings/)).toBeVisible()
})

test('technomancer: Emerged amp, Tasking skill, living persona', async ({ page }) => {
  await newRunner(page, 'Resonance')
  await page.getByRole('link', { name: 'Attributes' }).click()
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Raise Resolve' }).click()
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Raise Presence' }).click()
  await page.getByRole('link', { name: 'Shadow Amps' }).click()
  await page.getByRole('button', { name: 'Add an amp' }).click()
  await page.getByRole('button', { name: 'Emerged', exact: true }).click()
  await page.getByLabel('Name').fill('Emerged')
  await page.getByRole('button', { name: 'Add amp' }).click()
  await expect(page.locator('.receipt')).toContainText('Living persona FW / Att')
  await expect(page.locator('.receipt')).toContainText('4 / 3')
  await page.getByRole('link', { name: 'Skills', exact: true }).click()
  await page.getByRole('button', { name: 'Raise Tasking' }).click()
  await page.getByRole('link', { name: 'Review' }).click()
  await expect(page.getByText('Tasking needs the Emerged amp')).toHaveCount(0)
})

test('Amp Builder: apply a book add-on', async ({ page }) => {
  await newRunner(page, 'Rigger')
  await page.getByRole('link', { name: 'Shadow Amps' }).click()
  await page.getByRole('button', { name: 'Add an amp' }).click()
  await page.getByRole('button', { name: 'Gear', exact: true }).click()
  await page.getByLabel('Name').fill('Gadget')
  const before = await page.locator('.ampfoot b').first().textContent()
  await page.getByLabel('Apply a book add-on').selectOption('test.static-shroud')
  const after = await page.locator('.ampfoot b').first().textContent()
  expect(Number(after)).toBe(Number(before) - 1) // Static Shroud (made-up TEST book): a −1 drawback
})

test('a runner saved from two browsers: conflict dialog, save mine as a new file', async ({ browser }) => {
  const a = await browser.newPage({ storageState: STATE }), b = await browser.newPage({ storageState: STATE })
  await newRunner(a, 'Twice')
  await a.waitForTimeout(700) // autosave
  const url = a.url()
  await b.goto(url)
  await b.getByLabel('Street name').fill('Twice (from B)')
  await b.waitForTimeout(700)
  await a.getByLabel('Real name').fill('Saved from A')
  await expect(a.getByRole('heading', { name: 'Saved elsewhere' })).toBeVisible()
  await expect(a.getByRole('status', { name: 'Save status' })).toHaveText('Not saved — changed in another browser; choose which version to keep.')
  await a.getByLabel('File name if you save yours as a new file').fill('Twice A copy')
  await a.getByRole('button', { name: 'Save mine as a new file' }).click()
  await expect(a).not.toHaveURL(url)
  await a.goto('/')
  await expect(a.getByRole('link', { name: 'Twice (from B)' })).toBeVisible()
  await expect(a.getByRole('link', { name: 'Twice A copy' })).toBeVisible()
})

test('runners saved in the browser move to the server on first load', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.setItem('ca2.library.v1', JSON.stringify([{ formatVersion: 1, id: 'legacy-1',
    identity: { name: '', streetName: 'Legacy Browser Runner', metatype: 'human', background: '', notes: '' },
    narrative: { keywords: [], dispositions: [], cues: [] }, level: 'runner', package: 'free',
    build: { attributes: { str: 1, agi: 1, wil: 1, log: 1, cha: 1 }, skills: [], knowledge: [], amps: [], items: [] },
    career: [], overrides: [], updatedAt: '2026-09-01T00:00:00Z' }])))
  await page.reload()
  await expect(page.getByRole('status').first()).toContainText('Moved 1 runner from this browser to the server')
  await expect(page.getByRole('link', { name: 'Legacy Browser Runner' })).toBeVisible()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ca2.library.v1') ?? '[]').length)).toBe(0)
})

test('a book amp printed with levels: one entry per level in the picker, the Amp Builder steps between them', async ({ page }) => {
  await newRunner(page, 'Glider')
  await page.getByRole('link', { name: 'Shadow Amps' }).click()
  await page.getByRole('button', { name: 'Add an amp' }).click()
  await page.getByPlaceholder('Search the book’s amps').fill('Glide Step')
  const picker = page.locator('.picker li')
  await expect(picker).toHaveCount(3) // made-up TEST2 Glide Step 1-3
  await expect(picker.nth(1)).toContainText('Level 2 (1–3)')
  await picker.filter({ hasText: 'Glide Step 1' }).getByText('Glide Step 1', { exact: true }).click()
  await expect(page.locator('.ampfoot b').first()).toHaveText('2')
  await page.getByLabel('Level').selectOption({ label: 'Glide Step 3' })
  await expect(page.getByLabel('Name')).toHaveValue('Glide Step 3')
  await expect(page.locator('.ampfoot b').first()).toHaveText('6') // the made-up core: adept 2 + two narrative effects at 2
  await page.getByRole('button', { name: 'Add amp' }).click()
  await expect(page.getByRole('cell', { name: /Glide Step 3/ })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Rating 6' })).toBeVisible()
})
