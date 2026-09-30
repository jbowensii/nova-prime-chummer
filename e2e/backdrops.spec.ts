import { test, expect, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { disc, stripes } from '../tests/png'

// Portrait backdrops and the background art strength slider. A generated transparent PNG (no artwork is committed) shows
// the backdrop around its disc in the builder, the runner list and the print sheet (a dark backdrop prints as white).
// Screenshots go to .extract/ (not committed).
const SHOTS = '.extract/screenshots/backdrops'
const PHONE = { width: 390, height: 844 }
const bg = (page: Page, sel: string) => page.locator(sel).first().evaluate(e => getComputedStyle(e).backgroundImage + ' ' + getComputedStyle(e).backgroundColor)

async function shots(page: Page, name: string) {
  const theme = (t: string) => page.evaluate(t => { document.documentElement.dataset.theme = t }, t)
  await theme('light')
  await page.screenshot({ path: `${SHOTS}/${name}-light.png` })
  await theme('dark')
  await page.screenshot({ path: `${SHOTS}/${name}-dark.png` })
  await page.setViewportSize(PHONE)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${name} scrolls sideways`).toBeLessThanOrEqual(0)
  await page.screenshot({ path: `${SHOTS}/${name}-phone.png` })
  await page.setViewportSize({ width: 1400, height: 900 })
  await theme('light')
}

test('pick a backdrop: it shows behind a transparent portrait in the builder, the list and the print sheet', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true })
  await page.goto('/')
  await page.getByRole('button', { name: 'New runner' }).click()
  await page.getByRole('button', { name: 'Create runner' }).click()
  await page.getByLabel('Street name').fill('Backdrop')
  await page.getByLabel('Portrait', { exact: true }).setInputFiles({ name: 'test-disc.png', mimeType: 'image/png', buffer: disc() })
  const face = page.locator('.portrait-row img.face')
  await expect(face).toHaveAttribute('src', /^data:image\/png;base64,/) // transparency kept
  await expect(page.getByRole('radio', { name: 'None' })).toBeChecked() // the look before backdrops
  expect(await bg(page, '.portrait-row img.face')).toContain('none')

  const saved = page.waitForResponse(r => r.request().method() === 'PUT')
  await page.getByRole('radio', { name: 'Neon' }).check()
  expect((await saved).status()).toBeLessThan(300)
  await expect(face).toHaveClass(/bd-neon/)
  expect(await bg(page, '.portrait-row img.face')).toContain('radial-gradient')
  expect(await bg(page, '.topbar .who img.face')).toContain('radial-gradient') // the editor header
  // keyboard: arrows move through the swatches
  await page.getByRole('radio', { name: 'Neon' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('radio', { name: 'Rain' })).toBeChecked()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('radio', { name: 'Neon' })).toBeChecked()
  await page.waitForTimeout(600)
  await shots(page, 'builder')
  const id = page.url().match(/#\/c\/([^/]+)/)![1]

  await page.goto('/')
  const thumb = page.locator('.dossier', { hasText: 'Backdrop' }).locator('img.face')
  await expect(thumb).toHaveClass(/bd-neon/)
  expect(await thumb.evaluate(e => getComputedStyle(e).backgroundImage)).toContain('radial-gradient')
  await shots(page, 'library')

  // print: a dark backdrop prints as white; a light one as itself
  await page.goto(`/#/c/${id}/print`)
  const printed = page.locator('.s-top > img.portrait')
  await expect(printed).toHaveClass(/bd-white/)
  expect(await bg(page, '.s-top > img.portrait')).toContain('rgb(255, 255, 255)')
  await page.screenshot({ path: `${SHOTS}/print-neon-as-white.png` })
  await page.goto(`/#/c/${id}/concept`)
  const again = page.waitForResponse(r => r.request().method() === 'PUT')
  await page.getByRole('radio', { name: 'Grid' }).check()
  expect((await again).status()).toBeLessThan(300)
  await page.goto(`/#/c/${id}/print`)
  await expect(printed).toHaveClass(/bd-grid/)
  expect(await bg(page, '.s-top > img.portrait')).toContain('linear-gradient')
  await page.screenshot({ path: `${SHOTS}/print-grid.png` })
})

test('the background art strength slider fades the layer, live, and is remembered', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Your runners' })).toBeVisible()
  const png = [...stripes()]
  const artId: string = await page.evaluate(async png => {
    const r = await fetch('./api/backgrounds', { method: 'POST', body: new Uint8Array(png), headers: { 'Content-Type': 'image/png', 'X-Filename': 'test-stripes.png' } })
    return (await r.json()).id
  }, png)
  try {
    await page.reload()
    const art = page.locator('.bg-art')
    const opacity = () => art.evaluate(e => getComputedStyle(e).opacity)
    await expect(art).toHaveCount(1)
    expect(await opacity()).toBe('1') // default: 100%, today's strengths
    await page.getByRole('button', { name: 'Settings' }).click()
    const d = page.getByRole('dialog', { name: 'Settings' })
    const slider = d.getByRole('slider', { name: 'Strength' })
    await expect(slider).toHaveValue('100')
    await expect(d.locator('.art-strength output')).toHaveText('100%')
    await slider.focus()
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await expect(d.locator('.art-strength output')).toHaveText('80%')
    expect(await opacity()).toBe('0.8') // live, without closing Settings
    await d.screenshot({ path: `${SHOTS}/settings-strength-light.png` })
    await d.getByRole('button', { name: 'Close' }).click()
    await page.reload()
    await expect(art).toHaveCount(1)
    expect(await opacity()).toBe('0.8')
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ca2.settings.v1')!).artStrength)).toBe(80)
    await page.getByRole('button', { name: 'Settings' }).click()
    await slider.focus()
    await page.keyboard.press('Home')
    await expect(d.locator('.art-strength output')).toHaveText('0%')
    expect(await opacity()).toBe('0') // 0 = off
    await page.keyboard.press('End')
    expect(await opacity()).toBe('1')
    await d.getByLabel('Plain page').check()
    await expect(slider).toBeDisabled()
    await d.getByLabel('Show background art').check()
  } finally {
    await page.evaluate(id => fetch(`./api/backgrounds/${id}`, { method: 'DELETE' }), artId)
  }
})

test('character sheet: weapons and spells apart, knowledge at the bottom, portrait beside the attributes, its own art switches', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Your runners' })).toBeVisible()
  const artId: string = await page.evaluate(async png => (await (await fetch('./api/backgrounds', { method: 'POST', body: new Uint8Array(png),
    headers: { 'Content-Type': 'image/png', 'X-Filename': 'test-stripes.png' } })).json()).id, [...stripes()])
  try {
    await page.getByRole('button', { name: 'New runner' }).click()
    await page.getByRole('button', { name: 'Create runner' }).click()
    await page.getByLabel('Street name').fill('Sheet Test')
    await page.getByLabel('Portrait', { exact: true }).setInputFiles({ name: 'test-disc.png', mimeType: 'image/png', buffer: disc() })
    await page.getByRole('radio', { name: 'Halftone' }).check()
    await page.getByLabel('keywords 1').fill('Invented street')
    await page.getByLabel('keywords 2').fill('Made-up origin')
    await page.waitForTimeout(600)
    await page.getByRole('link', { name: 'Print' }).click()
    const sheet = page.locator('.sheet')
    await expect(sheet.getByRole('heading', { name: 'Weapons', exact: true })).toBeVisible()
    await expect(sheet.getByRole('heading', { name: /Spells/ })).toHaveCount(0) // none: no section
    const know = sheet.locator('.s-know')
    await expect(know.getByRole('heading', { name: 'Languages & knowledge' })).toBeVisible()
    await expect(know).toContainText('Invented street')
    expect(await sheet.evaluate(e => e.lastElementChild!.classList.contains('s-know'))).toBe(true) // at the bottom
    const note = know.getByText('Knowledge skills have no rating')
    await expect(note).toBeVisible()
    // the portrait beside the attributes, over its backdrop
    const pic = sheet.locator('.s-top > img.portrait')
    await expect(pic).toHaveClass(/bd-halftone/)
    const [pb, ab] = [await pic.boundingBox(), await sheet.locator('.s-attrs').boundingBox()]
    expect(pb!.y + pb!.height).toBeGreaterThan(ab!.y) // reaches down to the attributes' line
    expect(pb!.x).toBeGreaterThanOrEqual(ab!.x + ab!.width) // to their right

    // sheet art: on screen by default, not printed unless asked
    const art = sheet.locator('.sheet-art')
    const shown = () => art.evaluate(e => getComputedStyle(e).display !== 'none')
    expect(await shown()).toBe(true)
    await page.emulateMedia({ media: 'print' })
    expect(await shown()).toBe(false)
    await expect(note).toBeHidden() // screen only
    await page.emulateMedia({ media: 'screen' })
    await page.getByLabel('Print it').check()
    await page.emulateMedia({ media: 'print' })
    expect(await shown()).toBe(true)
    await page.emulateMedia({ media: 'screen' })
    const slider = page.getByRole('slider', { name: 'Art strength' })
    await expect(slider).toHaveValue('100') // the page's strength until set
    await slider.focus()
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    expect(await art.evaluate(e => getComputedStyle(e).opacity)).toBe('0.9')
    await page.reload()
    expect(await art.evaluate(e => getComputedStyle(e).opacity)).toBe('0.9')
    await shots(page, 'sheet')
    await page.emulateMedia({ media: 'print' })
    await page.screenshot({ path: `${SHOTS}/sheet-print-preview.png`, fullPage: true })
    await page.setViewportSize(PHONE)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 'print preview scrolls sideways').toBeLessThanOrEqual(0)
    await page.screenshot({ path: `${SHOTS}/sheet-print-preview-phone.png`, fullPage: true })
    await page.setViewportSize({ width: 1400, height: 900 })
    await page.emulateMedia({ media: 'screen' })
    await page.getByLabel('Background art').uncheck()
    expect(await shown()).toBe(false)
    await page.getByLabel('Print it').uncheck()
  } finally {
    await page.evaluate(id => fetch(`./api/backgrounds/${id}`, { method: 'DELETE' }), artId)
  }
})
