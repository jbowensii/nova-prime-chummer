import { test, expect, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { disc } from '../tests/png'

// 0.5.8 Book style: a third "Printed sheet" laid out like the rulebook's example sheet, with the runner's own numbers
// (read here off the Printer-friendly sheet, which uses the same engine); Printer-friendly still shows the old sheet.
const SHOTS = '.extract/screenshots/0.5.8'
const printed = async (page: Page, label: string) => {
  await page.getByRole('button', { name: 'Settings' }).click()
  const d = page.getByRole('dialog', { name: 'Settings' })
  await d.getByRole('radio', { name: label }).check()
  await d.getByRole('button', { name: 'Close' }).click()
}
const cells = (row: ReturnType<Page['locator']>) => row.locator('td').allInnerTexts().then(t => t.map(x => x.trim()))

test('book style sheet: the runner on one page like the rulebook example; Printer-friendly shows the old sheet', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true })
  await page.goto('/')
  await page.getByRole('button', { name: 'Load example characters' }).click()
  const href = (await page.locator('.dossier', { hasText: 'Test Face' }).first().locator('a.title').getAttribute('href'))!
  const id = href.split('/')[2]
  await page.goto(`/#/c/${id}/concept`)
  await page.getByRole('button', { name: 'Add a portrait…' }).click()
  const dlg = page.getByRole('dialog', { name: 'Portrait' })
  await dlg.getByLabel('Portrait file').setInputFiles({ name: 'test-disc.png', mimeType: 'image/png', buffer: disc() })
  const saved = page.waitForResponse(r => r.request().method() === 'PUT')
  await dlg.getByRole('button', { name: 'Save portrait' }).click()
  expect((await saved).status()).toBeLessThan(300)

  // the old sheet's numbers
  await page.goto(`/#/c/${id}/print`)
  await expect(page.locator('.sheet h1')).toHaveText('Test Face')
  const old = page.locator('.sheet')
  const infl = await cells(old.locator('tr', { has: page.getByRole('cell', { name: 'Influence', exact: true }) }))
  const eyes = await cells(old.locator('tr', { hasText: 'Toy Eyes' }))
  const zap = await cells(old.locator('.s-weapons tr', { hasText: 'Zap Pistol' }))
  const none = await cells(old.locator('tr', { hasText: 'No armor' }))
  const attrs = await old.locator('.s-attrs b').allInnerTexts()
  expect(attrs).toHaveLength(6)

  await page.goto(`/#/c/${id}/review`)
  await printed(page, 'Book style')
  await page.goto(`/#/c/${id}/print`)
  const book = page.locator('article.book-sheet')
  await expect(book).toBeVisible()
  await expect(page.locator('.sheet')).toHaveCount(0)
  await expect(book.getByRole('heading', { level: 1 })).toHaveText('Test Face')
  expect(await book.locator('.b-attrs b').allInnerTexts()).toEqual(attrs)
  await expect(book.locator('.b-attrs')).toContainText('Edge')

  const skills = book.getByRole('table', { name: 'Skills' })
  const row = skills.locator('tr', { has: page.getByRole('cell', { name: 'Influence', exact: true }) })
  expect((await cells(row)).slice(0, 4)).toEqual([infl[0], infl[1], infl[2], infl[3]]) // Skill, Rating, +Att., = DP
  const rr = Number(infl[4] || 0)
  expect(rr).toBeGreaterThan(0)
  await expect(row.locator('.b-rr i')).toHaveCount(rr)
  await expect(row.locator('.b-rr')).toContainText(`RR ${rr}`)
  const spec = skills.locator('tr.b-spec', { hasText: 'Fibbing' }).first()
  await expect(spec).toContainText('+2')
  const pad = (l: ReturnType<Page['locator']>) => l.locator('td').first().evaluate(e => parseFloat(getComputedStyle(e).paddingLeft))
  expect(await pad(spec)).toBeGreaterThan(await pad(row))

  const amp = book.getByRole('table', { name: 'Shadow Amps' }).locator('tr', { hasText: 'Toy Eyes' })
  await expect(amp).toContainText('Toy Eyes (chrome)') // the fixture's name for cyberware
  expect((await cells(amp)).slice(1)).toEqual(eyes.slice(-2)) // Essence, Rating

  const w = book.getByRole('table', { name: 'Weapons & Spells' }).locator('tr', { hasText: 'Zap Pistol' })
  await expect(w).toContainText(`DV ${zap[1].split('\n')[0]}`)
  await expect(w).toContainText(`[${zap[2].split('/').join(' / ')}]`)

  const wounds = book.getByRole('region', { name: 'Wounds' })
  await expect(wounds.getByRole('img', { name: /^Wound boxes: \d+ light, \d+ serious, 1 incapacitated$/ })).toBeVisible()
  expect((await cells(wounds.locator('tr', { hasText: 'No armor' }))).slice(1)).toEqual(none.slice(1))
  await expect(wounds).toContainText('Padded coat')
  await expect(wounds).toContainText('Mental')

  for (const [h, text] of [['Keywords', 'Made-up face'], ['Dispositions', 'Never early.'], ['Cues', 'Trust me.']]) {
    const s = book.getByRole('region', { name: h })
    await expect(s).toContainText(text)
    expect(await s.locator('li').first().evaluate(e => getComputedStyle(e).fontFamily)).toContain('Caveat')
  }
  expect(await book.locator('h1').evaluate(e => getComputedStyle(e).fontFamily)).toContain('Permanent Marker')
  const risk = book.getByRole('table', { name: 'Risk Level' })
  await expect(risk.locator('tbody tr')).toHaveCount(4)
  await expect(risk.locator('tbody tr').nth(3)).toContainText('15 dice')
  await expect(book).toContainText('3+ = disaster')
  await expect(book.locator('.b-panel')).toHaveCSS('print-color-adjust', 'exact')
  await expect(book.locator('.b-panel img.b-portrait')).toHaveCSS('border-radius', '50%')
  await page.screenshot({ path: `${SHOTS}/book-style-light.png`, fullPage: true })

  await page.emulateMedia({ media: 'print' })
  await page.setViewportSize({ width: 756, height: 994 }) // US Letter inside the 8 mm margins, at 96 dpi
  await expect(book.locator('.b-panel')).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/book-style-print.png`, fullPage: true })
  // one page, on US Letter and on A4
  for (const format of ['Letter', 'A4']) {
    const pdf = (await page.pdf({ format, printBackground: true, path: `${SHOTS}/book-style-${format.toLowerCase()}.pdf` })).toString('latin1')
    expect(pdf.match(/\/Type\s*\/Page[^s]/g), format).toHaveLength(1)
  }
  await page.emulateMedia({ media: 'screen' })
  await page.setViewportSize({ width: 1400, height: 900 })

  await page.goto(`/#/c/${id}/review`)
  await printed(page, 'Printer-friendly')
  await page.goto(`/#/c/${id}/print`)
  await expect(page.locator('.sheet h1')).toHaveText('Test Face')
  await expect(page.locator('article.book-sheet')).toHaveCount(0)
})
