import { test, expect, type Page } from '@playwright/test'

// The Shadowrun 6 look (src/sr6/ui/theme.css): every #/sr6 page carries it (data-game="sr6": Montserrat magenta headings,
// the book page's colors, light and dark, the "SHADOWRUN 6 // …" folio); Anarchy's pages keep theirs exactly; the game
// picker mixes both (each card in its own game's look).
const look = (page: Page) => page.evaluate(() => {
  const h1 = getComputedStyle(document.querySelector('main h1')!), body = getComputedStyle(document.body)
  return { game: document.documentElement.dataset.game, font: h1.fontFamily, heading: h1.color, bg: body.backgroundColor, folio: !!document.querySelector('.sr6-folio') }
})
const dark = (page: Page) => page.evaluate(() => { document.documentElement.dataset.theme = 'dark' })

test('SR6 pages carry the SR6 theme, light and dark; Anarchy pages don’t', async ({ page }) => {
  await page.goto('/#/sr6')
  await expect(page.getByRole('heading', { name: 'Your runners' })).toBeVisible()
  expect(await look(page)).toEqual({ game: 'sr6', font: expect.stringMatching(/^Montserrat/), heading: 'rgb(150, 3, 112)', bg: 'rgb(249, 249, 248)', folio: true })
  await dark(page)
  expect(await look(page)).toMatchObject({ heading: 'rgb(255, 108, 207)', bg: 'rgb(18, 12, 21)' })
  await page.reload() // the theme is this browser's setting, not the page's: back to light
  await page.goto('/#/sr6/rules')
  await expect(page.getByRole('heading', { name: 'Rules' })).toBeVisible()
  expect(await look(page)).toMatchObject({ game: 'sr6', heading: 'rgb(150, 3, 112)' })

  await page.goto('/#/')
  await expect(page.getByRole('heading', { name: 'Your runners' })).toBeVisible()
  expect(await look(page)).toEqual({ game: 'ca2', font: expect.stringMatching(/Goldman/), heading: 'rgb(123, 54, 30)', bg: 'rgb(245, 244, 240)', folio: false })
  await dark(page)
  expect(await look(page)).toMatchObject({ heading: 'rgb(241, 187, 0)', bg: 'rgb(29, 25, 54)' })
})

test.describe('a fresh browser', () => {
  test.use({ storageState: { cookies: [], origins: [] } })
  test('the game picker mixes both looks: the SR6 card in SR6’s, Anarchy’s in Anarchy’s', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Choose your game' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.dataset.game)).toBe('pick')
    const font = (name: string) => page.getByRole('button', { name }).locator('.name').evaluate(e => getComputedStyle(e).fontFamily)
    expect(await font('Shadowrun 6th World')).toMatch(/^Montserrat/)
    expect(await font('Shadowrun Anarchy 2.0')).toMatch(/Goldman/)
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
  })
})
