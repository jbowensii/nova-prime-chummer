import { test, expect, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { makePng } from '../tests/png'

// 0.8.1 menus: every page's header is the same icon bar (hover/focus tooltips, the current page marked), the print page's
// background art sits behind one "Background" button, and 100% strength shows the art strongly. Screenshots of every menu,
// light, dark and phone, go to .extract/screenshots/0.8.1 (not committed).
const SHOTS = '.extract/screenshots/0.8.1'
const TAG = process.env.MENUS_TAG ?? 'after' // MENUS_TAG=before: screenshots only, of the build before the change
const PHONE = { width: 390, height: 844 }

/** A made-up night skyline: a gradient sky, a sun and dark blocks (no artwork is committed). */
const skyline = () =>
  makePng(480, 320, (x, y) => {
    const t = y / 320
    if (Math.hypot(x - 330, y - 120) < 60) return [255, 196, 40]
    const h = 150 + ((Math.floor(x / 40) * 53) % 110)
    if (y > 320 - h + (x % 40 < 4 ? 400 : 0)) return (x + y) % 17 === 0 ? [255, 214, 90] : [28, 22, 50]
    return [Math.round(40 + 180 * t), Math.round(20 + 30 * t), Math.round(110 - 30 * t)]
  })

async function shots(page: Page, name: string, full = false) {
  const theme = (t: string) =>
    page.evaluate(t => {
      const s = JSON.parse(localStorage.getItem('ca2.settings.v1') ?? '{}')
      localStorage.setItem('ca2.settings.v1', JSON.stringify({ ...s, theme: t }))
      document.documentElement.dataset.theme = t
    }, t)
  await theme('light')
  await page.screenshot({ path: `${SHOTS}/${TAG}-${name}-light.png`, fullPage: full })
  await theme('dark')
  await page.screenshot({ path: `${SHOTS}/${TAG}-${name}-dark.png`, fullPage: full })
  await page.setViewportSize(PHONE)
  if (TAG === 'after') expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${name} scrolls sideways`).toBeLessThanOrEqual(0)
  await page.screenshot({ path: `${SHOTS}/${TAG}-${name}-phone.png` })
  await page.setViewportSize({ width: 1400, height: 900 })
  await theme('light')
}
const printStyle = (page: Page, print: string) =>
  page.evaluate(p => {
    const s = JSON.parse(localStorage.getItem('ca2.settings.v1') ?? '{}')
    localStorage.setItem('ca2.settings.v1', JSON.stringify({ ...s, print: p }))
  }, print)

test('every menu as icons with tooltips; the print page background behind one button, strong at 100%', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true })
  await page.goto('/')
  const artId: string = await page.evaluate(
    async png =>
      (
        await (
          await fetch('./api/backgrounds', {
            method: 'POST',
            body: new Uint8Array(png),
            headers: { 'Content-Type': 'image/png', 'X-Filename': 'menus-skyline.png' },
          })
        ).json()
      ).id,
    [...skyline()],
  )
  try {
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Your runners' })).toBeVisible()
    if (TAG === 'after') {
      const nav = page.getByRole('navigation', { name: 'Main menu' })
      await expect(nav.getByRole('link', { name: 'Your runners' })).toHaveAttribute('aria-current', 'page')
      // hover text: a visible tooltip on hover and on keyboard focus
      const npcs = nav.getByRole('link', { name: 'NPCs & Critters' })
      // (0.8.3: one tooltip element above the icon, icons.tsx installTips; e2e/v083.spec.ts checks where it goes)
      const tip = page.getByRole('tooltip')
      await npcs.hover()
      await expect(tip).toHaveText('NPCs & Critters')
      await page.mouse.move(0, 0)
      await expect(tip).toBeHidden()
      await npcs.focus()
      await page.keyboard.press('Shift+Tab')
      await page.keyboard.press('Tab') // keyboard focus: :focus-visible
      await expect(tip).toHaveText('NPCs & Critters')
      await page.screenshot({ path: `${SHOTS}/${TAG}-tooltip.png`, clip: { x: 0, y: 0, width: 1400, height: 260 } })
    }
    await shots(page, 'runners')
    for (const [hash, name] of [
      ['npcs', 'npcs'],
      ['compendiums', 'compendiums'],
      ['campaigns', 'campaigns'],
      ['books', 'books'],
      ['rules', 'rules'],
      ['data', 'data'],
      ['trash', 'trash'],
    ]) {
      await page.goto(`/#/${hash}`)
      await expect(page.locator('main h1')).toBeVisible()
      if (TAG === 'after')
        await expect(page.getByRole('navigation', { name: 'Main menu' }).locator('[aria-current="page"]')).toHaveCount(hash === 'trash' ? 0 : 1)
      await shots(page, name)
    }
    // account menu open
    await page.goto('/')
    await page.locator('.account > button').click()
    await page.screenshot({ path: `${SHOTS}/${TAG}-account-menu.png`, clip: { x: 0, y: 0, width: 1400, height: 420 } })
    await page.keyboard.press('Escape')

    // a runner: the editor's bar, then the print page
    await page.getByRole('button', { name: 'New runner' }).click()
    await page.getByRole('button', { name: 'Create runner' }).click()
    await page.getByLabel('Street name').fill('Menu Check')
    await page.waitForTimeout(600)
    await shots(page, 'editor')
    for (const style of ['plain', 'book']) {
      await printStyle(page, style)
      await page.getByRole('link', { name: 'Print' }).click()
      await expect(page.locator('.sheet-art')).toHaveCount(1)
      if (TAG === 'after') {
        await expect(page.getByLabel('Art strength')).toHaveCount(0) // behind the button now
        const bg = page.getByRole('button', { name: 'Background' })
        await bg.click()
        const d = page.getByRole('dialog', { name: 'Background' })
        await expect(d.getByLabel('Art strength')).toBeFocused() // focus moves in, onto the strength
        await d.getByLabel('Art strength').fill('100')
        await page.screenshot({ path: `${SHOTS}/${TAG}-print-${style}-popover.png` })
        await page.keyboard.press('Escape')
        await expect(d).toBeHidden()
        await expect(bg).toBeFocused() // and back
        await bg.click()
        await page.mouse.click(5, 890) // outside closes it too
        await expect(d).toBeHidden()
      } else {
        await page.getByLabel('Art strength').fill('100')
      }
      await shots(page, `print-${style}-100`, true)
      await page.goBack()
    }
  } finally {
    await page.evaluate(id => fetch(`./api/backgrounds/${id}`, { method: 'DELETE' }), artId)
    await printStyle(page, 'plain')
  }
})

test('six main-menu icons fit a 320px and a 375px phone: no sideways scroll, each icon at least 44px', async ({ page }) => {
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Main menu' })
  await expect(nav).toBeVisible()
  // the admin has eight; keep six of them, in one row as the bar lays six out
  await nav.evaluate(n => {
    while (n.children.length > 6) n.lastElementChild!.remove()
    ;(n as HTMLElement).style.setProperty('--cols', '6')
  })
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 700 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${width}px scrolls sideways`).toBeLessThanOrEqual(0)
    const boxes = await nav.locator('a').evaluateAll(els => els.map(e => e.getBoundingClientRect()))
    expect(boxes).toHaveLength(6)
    expect(new Set(boxes.map(b => Math.round(b.top))).size, `${width}px: one row`).toBe(1)
    for (const b of boxes) expect(b.width, `${width}px icon width`).toBeGreaterThanOrEqual(44)
    const bar = await page.locator('.menubar').evaluate(e => e.getBoundingClientRect().right)
    expect(boxes[5].right, `${width}px last icon inside the page's padding`).toBeLessThanOrEqual(bar + 0.5)
  }
  await page.setViewportSize({ width: 1400, height: 900 })
})
