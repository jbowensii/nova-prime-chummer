import { test, expect, type Page } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { inflateSync, constants } from 'node:zlib'

// 0.8.3, the owner's report on 0.8.2: the header's icon row from the left, 20% bigger icons, "New runner" (and the other
// main actions) as icons, tooltips above the icon; on the print page the sheet type back on the toolbar and no page that
// holds next to nothing. Screenshots to .extract/screenshots/0.8.3 (not committed); V083_TAG=before: screenshots only,
// of the build before the change.
const SHOTS = '.extract/screenshots/0.8.3'
const TAG = process.env.V083_TAG ?? 'after'
const PHONE = { width: 390, height: 844 }

/** The glyphs each page of a Chromium PDF shows, in page order (the hex strings its content streams draw). */
function pageGlyphs(pdf: Buffer): number[] {
  const s = pdf.toString('latin1')
  const obj = (n: string) => { const i = s.search(new RegExp(`(^|\\s)${n} 0 obj\\b`)); return i < 0 ? '' : s.slice(i, s.indexOf('endobj', i)) }
  const refs = (x: string) => x.match(/\d+(?= 0 R)/g) ?? []
  const stream = (n: string) => {
    const at = s.search(new RegExp(`(^|\\s)${n} 0 obj\\b`)), a = s.indexOf('stream', at) + 6, b = s.indexOf('endstream', a)
    const raw = pdf.subarray(s[a] === '\r' ? a + 2 : a + 1, b)
    return /\/FlateDecode/.test(s.slice(at, a)) ? inflateSync(raw, { finishFlush: constants.Z_SYNC_FLUSH }).toString('latin1') : raw.toString('latin1')
  }
  const pages = (n: string): string[] => { const o = obj(n); return /\/Type\s*\/Pages\b/.test(o) ? refs(o.match(/\/Kids\s*\[([^\]]*)\]/)![1]).flatMap(pages) : [n] }
  const root = refs(s.match(/\/Root\s+\d+ 0 R/)![0])[0]
  return pages(refs(obj(root).match(/\/Pages\s+\d+ 0 R/)![0])[0]).map(p => {
    const c = obj(p).match(/\/Contents\s*(\[[^\]]*\]|\d+ 0 R)/)
    return (c ? refs(c[1]) : []).reduce((n, r) => n + (stream(r).match(/<([0-9A-Fa-f]+)>\s*Tj|\[[^\]]*\]\s*TJ/g) ?? [])
      .reduce((m, t) => m + (t.match(/<([0-9A-Fa-f]+)>/g) ?? []).reduce((k, h) => k + (h.length - 2) / 4, 0), 0), 0)
  })
}

const settings = (page: Page, patch: object) => page.evaluate(p => { const s = JSON.parse(localStorage.getItem('ca2.settings.v1') ?? '{}')
  localStorage.setItem('ca2.settings.v1', JSON.stringify({ ...s, ...p })) }, patch)

test('the header: icons from the left, 20% bigger, New runner an icon; the tooltip above the icon, inside the window', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Your runners' })).toBeVisible()
  await page.mouse.move(0, 0)
  await page.screenshot({ path: `${SHOTS}/${TAG}-header-desktop.png`, clip: { x: 0, y: 0, width: 1400, height: 300 } })
  const nav = page.getByRole('navigation', { name: 'Main menu' })
  const npcs = nav.getByRole('link', { name: 'NPCs & Critters' })
  await npcs.hover()
  await page.screenshot({ path: `${SHOTS}/${TAG}-tooltip.png`, clip: { x: 0, y: 0, width: 1400, height: 300 } })
  await page.mouse.move(0, 0)
  await page.setViewportSize(PHONE)
  await page.screenshot({ path: `${SHOTS}/${TAG}-header-phone.png`, clip: { x: 0, y: 0, ...PHONE, height: 460 } })
  await page.setViewportSize({ width: 1400, height: 900 })
  if (TAG !== 'after') return

  // New runner: the yellow icon, its name in the tooltip
  const add = page.getByRole('button', { name: 'New runner' })
  await expect(add).toHaveText('')
  await expect(add).toHaveAttribute('data-tip', 'New runner')
  await expect(add).toHaveClass(/primary/)
  for (const [where, size] of [['desktop', { width: 1400, height: 900 }], ['phone', PHONE]] as const) {
    await page.setViewportSize(size)
    // the row starts at the title's left edge, under it; every icon 20% bigger than 0.8.1's (20px in 38.4px)
    const title = (await page.locator('.pagehead .titles').boundingBox())!
    const row = (await page.locator('.pagehead .bars').boundingBox())!
    expect(Math.abs(row.x - title.x), where).toBeLessThanOrEqual(1)
    expect(row.y, where).toBeGreaterThanOrEqual(title.y + title.height - 1)
    const first = (await page.locator('.pagehead .bars .ibtn').first().boundingBox())!
    expect(Math.abs(first.x - title.x), where).toBeLessThanOrEqual(1)
    for (const b of await page.locator('.pagehead .ibtn').all()) {
      const box = (await b.boundingBox())!
      expect(box.width, where).toBeCloseTo(38.4 * 1.2, 0)
      expect(box.height, where).toBeCloseTo(38.4 * 1.2, 0)
      expect((await b.locator('svg.icon').boundingBox())!.width, where).toBe(24)
    }
  }
  await page.setViewportSize({ width: 1400, height: 900 })

  // the tooltip: above the icon, gone when the pointer leaves, back on keyboard focus
  const tip = page.getByRole('tooltip')
  await npcs.hover()
  await expect(tip).toHaveText('NPCs & Critters')
  let t = (await tip.boundingBox())!, l = (await npcs.boundingBox())!
  expect(t.y + t.height).toBeLessThanOrEqual(l.y)
  expect(t.x + t.width / 2).toBeCloseTo(l.x + l.width / 2, 0)
  await page.mouse.move(0, 0)
  await expect(tip).toBeHidden()
  await npcs.focus()
  await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab') // keyboard focus: :focus-visible
  await expect(tip).toHaveText('NPCs & Critters')
  expect((await tip.boundingBox())!.y + (await tip.boundingBox())!.height).toBeLessThanOrEqual((await npcs.boundingBox())!.y)
  await page.locator('h1').click()
  await expect(tip).toBeHidden()

  // no room above (the icon at the window's top): below it instead
  await page.addStyleTag({ content: 'body { min-height: 400vh; }' })
  await page.evaluate(y => scrollTo(0, y), l.y - 4) // from the top of the page
  l = (await npcs.boundingBox())!
  expect(l.y).toBeLessThan(10)
  await npcs.hover()
  await expect(tip).toBeVisible()
  t = (await tip.boundingBox())!
  expect(t.y).toBeGreaterThanOrEqual(l.y + l.height)
  await page.evaluate(() => scrollTo(0, 0))

  // at the window's edges: the account's long tip (its name and role) on a phone stays on the screen
  await page.setViewportSize(PHONE)
  for (const b of [page.locator('.pagehead .ibtn').first(), page.locator('.account > button')]) {
    await b.hover()
    await expect(tip).toBeVisible()
    t = (await tip.boundingBox())!
    expect(t.x).toBeGreaterThanOrEqual(0)
    expect(t.x + t.width).toBeLessThanOrEqual(PHONE.width)
  }
  await page.screenshot({ path: `${SHOTS}/${TAG}-tooltip-phone-edge.png`, clip: { x: 0, y: 0, ...PHONE, height: 460 } })
})

test('print: the sheet type on the toolbar again; Letter and A4, both styles, no page left holding next to nothing', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true })
  await page.goto('/')
  await settings(page, { print: 'plain' })
  // (its own copy of the made-up test book's Test Face: other specs pad the shared copies)
  const id = 'v083-long-skills'
  const face = { xml: readFileSync('tests/fixtures/mini/custom/imported/testc/samples/testc.test-face.xml', 'utf8').replace('id="testc.test-face"', `id="${id}"`) }
  const specs = (k: number) => Array.from({ length: k }, (_, i) => `<spec>custom:Made-up trick ${i + 1}</spec>`).join('')
  const xml = face.xml.replace('<skill id="perception" rating="2"/>', `<skill id="perception" rating="2">${specs(16)}</skill>`)
    .replace('<skill id="close-combat" rating="1"/>', `<skill id="close-combat" rating="1">${specs(16)}</skill>`)
  expect(xml).not.toBe(face.xml)
  const put = await page.request.put(`/api/characters/${id}`, { data: xml, headers: { 'Content-Type': 'application/xml', Origin: new URL(page.url()).origin } })
  expect(put.status()).toBeLessThan(300)

  await page.goto(`/#/c/${id}/print`)
  await page.reload()
  await expect(page.locator('.sheet h1')).toHaveText('Test Face')
  await page.screenshot({ path: `${SHOTS}/${TAG}-print-toolbar.png`, clip: { x: 0, y: 0, width: 1400, height: 220 } })
  if (TAG !== 'after') return

  const print = page.getByRole('button', { name: 'Print or save as PDF' })
  await expect(print).toHaveText('')
  await expect(print).toHaveAttribute('data-tip', 'Print or save as PDF')
  const type = page.getByRole('combobox', { name: 'Sheet type' })
  await expect(type).toHaveValue('plain')
  await expect(type.locator('option')).toHaveText(['Printer-friendly', 'Full color', 'Book style'])
  await type.selectOption('book')
  await expect(page.locator('article.book-sheet')).toBeVisible()
  await expect(page.locator('.sheet')).toHaveCount(0)
  await type.hover()
  await expect(page.getByRole('tooltip')).toHaveText('Sheet type')
  await page.screenshot({ path: `${SHOTS}/${TAG}-print-toolbar-book.png`, clip: { x: 0, y: 0, width: 1400, height: 220 } })
  await page.reload() // kept in this browser, as Settings → Printed sheet
  await expect(page.locator('article.book-sheet')).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Sheet type' })).toHaveValue('book')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ca2.settings.v1')!).print)).toBe('book')

  for (const style of ['plain', 'book'] as const) {
    await page.getByRole('combobox', { name: 'Sheet type' }).selectOption(style)
    await expect(page.locator(style === 'book' ? 'article.book-sheet' : 'article.sheet')).toBeVisible()
    for (const format of ['Letter', 'A4']) {
      const glyphs = pageGlyphs(await page.pdf({ format, printBackground: true, path: `${SHOTS}/${style}-${format.toLowerCase()}.pdf` }))
      expect(glyphs.length, `${style} ${format}`).toBeLessThanOrEqual(style === 'book' ? 2 : 3)
      expect(glyphs.every(n => n > 0), `${style} ${format}: a blank page (${glyphs})`).toBe(true)
      // every page but the last is full: none holds only the header
      expect(glyphs.slice(0, -1).every(n => n > 400), `${style} ${format}: a near-empty page (${glyphs})`).toBe(true)
    }
  }
  // the same runner, with the old rule (each column kept whole): page 1 held only the header
  await page.getByRole('combobox', { name: 'Sheet type' }).selectOption('plain')
  await page.addStyleTag({ content: '.sheet .s-cols > section, .sheet > section { break-inside: avoid !important; }' })
  expect(pageGlyphs(await page.pdf({ format: 'Letter', printBackground: true }))[0]).toBeLessThan(400)
})
