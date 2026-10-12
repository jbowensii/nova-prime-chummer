import { test, expect, type Page } from '@playwright/test'
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { usersFile } from '../server/auth.mjs'
import { createServer } from '../server/server.mjs'
import { pageGlyphs } from './pdf'

// SR6 printed sheets, 0.9.8: the Sheet type picker offers Printer-friendly, Full color, Book style (the official sheet's
// boxes), Neon (one dense page), Hex (one page of hexagons) and Dossier (magenta-barred panels). A made-up runner (Pat's,
// on a server of its own with the made-up SR6 fixture) prints in the four SR6-only styles: their sections, no sideways
// scroll on screen, the sheet in print emulation, and Letter/A4 PDFs (Book style two pages, Neon and Hex one, Dossier at
// most two). Anarchy's print page shows Printer-friendly when an SR6-only style is saved. Screenshots and PDFs
// go to .extract/screenshots/sr6-sheets (not committed).
const PW = { pat: 'pat-password-1' }
const SHOTS = '.extract/screenshots/sr6-sheets'
const PHONE = { width: 390, height: 844 },
  DESK = { width: 1400, height: 900 }
const RUNNER = `<?xml version="1.0" encoding="UTF-8"?>
<sr6:character xmlns:sr6="urn:chummer-sr6:character:1" formatVersion="1" id="neon-moth" streetName="Neon Moth" name="Mara Testwing" metatype="crb.glimmerkin" method="priority" updatedAt="2026-10-05T09:00:00.000Z">
  <background>Made up for the print tests: grew up reading arcade cabinets.</background>
  <build method="priority" magic="full" tradition="Kitchen hoodoo" drainAttr="log" powerPointsBought="0" initiation="0" submersion="0" karmaToNuyen="0">
    <priority column="metatype" letter="D"/><priority column="attributes" letter="B"/><priority column="magic" letter="A"/>
    <priority column="skills" letter="C"/><priority column="resources" letter="E"/>
    <attribute id="bod" points="2" adjust="0" karma="0"/><attribute id="agi" points="2" adjust="0" karma="0"/>
    <attribute id="rea" points="1" adjust="0" karma="0"/><attribute id="str" points="0" adjust="0" karma="0"/>
    <attribute id="wil" points="3" adjust="0" karma="0"/><attribute id="log" points="4" adjust="0" karma="0"/>
    <attribute id="int" points="3" adjust="0" karma="0"/><attribute id="cha" points="1" adjust="0" karma="0"/>
    <attribute id="edg" points="0" adjust="2" karma="0"/><attribute id="mag" points="0" adjust="3" karma="0"/>
    <attribute id="res" points="0" adjust="0" karma="0"/>
    <skill id="crb.tinkering" points="3" karma="0" spec="Gizmos"/>
    <skill id="crb.hexing" points="4" karma="0"/>
    <skill id="crb.gab" points="2" karma="0"/>
    <knowledge uid="k1" kind="language" native="true" points="0" karma="0">Sperethiel</knowledge>
    <knowledge uid="k2" kind="knowledge" points="2" karma="0">Arcade lore</knowledge>
    <quality uid="q1" id="crb.knack" level="1"/>
    <quality uid="q2" id="crb.butterfingers" level="1"/>
    <pick uid="p1" kind="spells" id="crb.glow-ward"/>
    <pick uid="p2" kind="rituals" id="crb.moon-circle"/>
    <purchase uid="w1" kind="weapons" id="crb.zap-gun" qty="1"><purchase uid="w1a" kind="gear" id="crb.zap-scope" qty="1"/></purchase>
    <purchase uid="w2" kind="weapons" id="crb.fizz-rifle-70" qty="1"/>
    <purchase uid="w3" kind="weapons" name="Made-up Shock Baton" cost="100" qty="1"/>
    <purchase uid="a1" kind="armor" id="crb.padded-vest" qty="1" worn="true"/>
    <purchase uid="u1" kind="augmentations" id="crb.glow-eyes" rating="2" qty="1"/>
    <purchase uid="e1" kind="electronics" id="crb.pocketdeck" qty="1"/>
    <purchase uid="e2" kind="programs" id="crb.glow-scan" qty="1"/>
    <purchase uid="g1" kind="gear" id="crb.tangle-rope" rating="2" qty="2"/>
    <purchase uid="v1" kind="vehicles" id="crb.putt-putt" qty="1"/>
    <contact uid="c1" name="Fixer Fred" archetype="Fixer" connection="3" loyalty="2"/>
    <contact uid="c2" name="Doc Pixel" archetype="Street doc" connection="2" loyalty="4"/>
    <lifestyle id="crb.cozy" months="1"/>
    <sin uid="s1" name="Moira Tinwing" kind="fake" rating="3"><licence name="Zap Gun licence" rating="3"/></sin>
  </build>
</sr6:character>`
const CA2 =
  '<ca2:character xmlns:ca2="urn:chummer-anarchy2:character:1" formatVersion="1" id="anarchy-neon" streetName="Ana Plain" metatype="elf" level="runner" updatedAt="2026-10-03T00:00:00.000Z"><build><attributes str="1" agi="1" wil="1" log="1" cha="1"/></build></ca2:character>'
let server: ReturnType<typeof createServer>,
  base = ''

test.describe.configure({ mode: 'serial' })
test.use({ baseURL: async ({}, use) => use(base), storageState: { cookies: [], origins: [] }, viewport: DESK })

test.beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ca2-sr6-sheets-e2e-')),
    config = join(dir, 'library', '.config')
  cpSync('tests/fixtures/mini/custom', join(dir, 'custom'), { recursive: true })
  cpSync('tests/fixtures/sr6/custom', join(dir, 'custom', 'sr6'), { recursive: true })
  mkdirSync(config, { recursive: true })
  writeFileSync(
    join(config, 'users.xml'),
    await usersFile([
      { username: 'ada', password: 'ada-password-1', name: 'Ada Admin' },
      { username: 'pat', password: PW.pat, role: 'player', name: 'Pat Player' },
    ]),
  )
  server = createServer({ staticDir: 'dist', charDir: join(dir, 'characters'), customDir: join(dir, 'custom'), libraryDir: join(dir, 'library') })
  await new Promise<void>((ok, fail) => server.once('error', fail).listen(0, '127.0.0.1', ok))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/`
  mkdirSync(SHOTS, { recursive: true })
})
test.afterAll(() => {
  server.stopJobs()
  server.close()
})

async function signIn(page: Page) {
  await page.goto('/#/sr6')
  await page.getByLabel('Username').fill('pat')
  await page.getByLabel('Password', { exact: true }).fill(PW.pat)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByLabel('Username')).toHaveCount(0)
}
const put = async (page: Page, path: string, xml: string) =>
  expect((await page.request.put(path, { data: xml, headers: { 'Content-Type': 'application/xml', Origin: new URL(base).origin } })).status()).toBeLessThan(300)
const fits = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
/** the printable width (px at 96 dpi) inside the sheets' 8 mm page margins */
const CONTENT = { Letter: Math.floor(8.5 * 96 - (2 * 8 * 96) / 25.4), A4: Math.floor((210 * 96) / 25.4 - (2 * 8 * 96) / 25.4) }
/** in print emulation at the page's content width: every box of the sheet lies inside it (`framed`: its four borders drawn) */
async function boxesInside(page: Page, sel: string, box: string, format: keyof typeof CONTENT, framed: boolean) {
  await page.setViewportSize({ width: CONTENT[format], height: 1000 })
  const out = await page.locator(`${sel} ${box}`).evaluateAll(
    (els, [w, framed]) =>
      els.flatMap(e => {
        const r = e.getBoundingClientRect(),
          cs = getComputedStyle(e),
          id = e.querySelector('h2')?.textContent ?? e.className
        return [
          r.left < 0 && `${id}: left ${r.left}`,
          r.right > w && `${id}: right ${r.right} > ${w}`,
          ...(framed ? ['Top', 'Right', 'Bottom', 'Left'] : []).map(s =>
            parseFloat(cs.getPropertyValue(`border-${s.toLowerCase()}-width`)) > 0 ? '' : `${id}: no ${s} border`,
          ),
        ].filter(Boolean)
      }),
    [CONTENT[format], framed] as const,
  )
  expect(out, `${format}: ${out.join('; ')}`).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), format).toBeLessThanOrEqual(0)
  await page.setViewportSize(DESK)
}

/** screen view (desktop and phone, no sideways scroll), print emulation, then Letter and A4 PDFs of at most `pages` pages */
const BOXES: Record<string, [string, boolean]> = {
  'article.sr6-book': ['.k-box', true],
  'article.sr6-neon': ['section, .n-top, .n-keys', false],
  'article.sr6-hex': ['section', false],
  'article.sr6-dossier': ['.d-panel', true],
}
async function shootAndPrint(page: Page, sel: string, name: string, pages: number, atMost = false) {
  await fits(page)
  await page.screenshot({ path: `${SHOTS}/${name}-screen.png`, fullPage: true })
  await page.setViewportSize(PHONE)
  await fits(page)
  await page.screenshot({ path: `${SHOTS}/${name}-phone.png`, fullPage: true })
  await page.setViewportSize(DESK)
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator(sel)).toBeVisible()
  await expect(page.locator('.sheet-tools')).toBeHidden()
  for (const format of ['Letter', 'A4'] as const) {
    await boxesInside(page, sel, BOXES[sel][0], format, BOXES[sel][1])
    const glyphs = pageGlyphs(await page.pdf({ format, printBackground: true, path: `${SHOTS}/${name}-${format.toLowerCase()}.pdf` }))
    if (atMost) expect(glyphs.length, `${name} ${format}: ${glyphs}`).toBeLessThanOrEqual(pages)
    else expect(glyphs.length, `${name} ${format}: ${glyphs}`).toBe(pages)
    expect(
      glyphs.every(k => k > 400),
      `${name} ${format}: a near-empty page (${glyphs})`,
    ).toBe(true)
  }
  await page.emulateMedia({ media: 'screen' })
}

test('SR6 print: the Sheet type picker offers all six; Book style, Neon, Hex and Dossier print the runner', async ({ page }) => {
  await signIn(page)
  await put(page, '/api/sr6/characters/neon-moth', RUNNER)
  await page.goto('/#/sr6/c/neon-moth/print')
  await page.reload()
  const type = page.getByRole('combobox', { name: 'Sheet type' })
  await expect(type.locator('option')).toHaveText(['Printer-friendly', 'Full color', 'Book style', 'Neon', 'Hex', 'Dossier'])
  // the plain sheet's numbers, to check the new ones against
  const plain = page.locator('article.sheet.sr6-sheet')
  await expect(plain.locator('h1')).toHaveText('Neon Moth')
  const physical = await plain.locator('.sr6-boxes').first().locator('span').count()
  const stun = await plain.locator('.sr6-boxes').nth(1).locator('span').count()
  const defense = (await plain.locator('tr', { hasText: 'Defense Rating' }).locator('b').innerText()).trim()
  expect(physical).toBeGreaterThan(0)

  // Book style: the official sheet's sections in its order, on two pages
  await type.selectOption('book')
  const book = page.locator('article.sr6-book')
  await expect(book).toBeVisible()
  await expect(plain).toHaveCount(0)
  await expect(book.getByRole('heading', { level: 2 })).toHaveText([
    'Personal data',
    'Attributes',
    'Skills',
    'IDs / lifestyles / currency',
    'Core combat info',
    'Condition monitor',
    'Qualities',
    'Contacts',
    'Ranged weapons',
    'Armor',
    'Augmentations',
    'Gear',
    'Melee weapons',
    'Matrix stats',
    'Vehicle',
    'Spells / preparations / rituals / complex forms',
    'Adept powers or other abilities',
    'Notes',
  ])
  await expect(book.locator('.k-who').first()).toContainText('Neon Moth')
  await expect(book.getByRole('region', { name: 'Personal data' })).toContainText('Glimmerkin')
  await expect(book.getByRole('region', { name: 'Attributes' }).locator('.k-f', { hasText: 'Defense rating' })).toContainText(defense)
  await expect(book.getByRole('img', { name: `Physical damage track: ${physical} boxes` })).toBeVisible()
  await expect(book.getByRole('img', { name: `Stun damage track: ${stun} boxes` })).toBeVisible()
  // three boxes a row, the rest of the official 18 blacked out
  const track = book.getByRole('img', { name: /^Physical damage track/ })
  await expect(track.locator('span')).toHaveCount(Math.max(18, Math.ceil(physical / 3) * 3))
  await expect(track.locator('span.off')).toHaveCount(Math.max(18, Math.ceil(physical / 3) * 3) - physical)
  await expect(book.getByRole('img', { name: /^Edge points: \d+$/ }).locator('svg')).toHaveCount(7)
  await expect(book.getByRole('region', { name: 'Skills' })).toContainText('Gizmos')
  await expect(book.getByRole('region', { name: 'Core combat info' })).toContainText('Padded Vest')
  await expect(book.getByRole('region', { name: 'Ranged weapons' }).locator('tr', { hasText: 'Fizz Rifle' })).toContainText('SA/BF')
  await expect(book.getByRole('region', { name: 'Ranged weapons' })).toContainText('with Zap Scope')
  await expect(book.getByRole('region', { name: 'Melee weapons' })).toContainText('Made-up Shock Baton')
  await expect(book.getByRole('region', { name: 'Augmentations' })).toContainText('Glow Eyes')
  await expect(book.getByRole('region', { name: 'Matrix stats' })).toContainText('Pocketdeck')
  await expect(book.getByRole('region', { name: 'Matrix stats' })).toContainText('Glow Scan')
  await expect(book.getByRole('region', { name: 'Vehicle' })).toContainText('Putt-Putt')
  await expect(book.getByRole('region', { name: 'Spells / preparations / rituals / complex forms' })).toContainText('Glow Ward')
  await expect(book.getByRole('region', { name: 'Qualities' }).locator('tr', { hasText: 'Butterfingers' })).toContainText('Negative')
  await expect(book.getByRole('region', { name: 'Contacts' })).toContainText('Doc Pixel')
  await expect(book.getByRole('region', { name: 'IDs / lifestyles / currency' })).toContainText('Zap Gun licence 3')
  await shootAndPrint(page, 'article.sr6-book', 'book', 2)

  // Neon: one page, the best pools up front
  await type.selectOption('neon')
  const neon = page.locator('article.sr6-neon')
  await expect(neon).toBeVisible()
  await expect(book).toHaveCount(0)
  await expect(neon.locator('h1')).toHaveText('Neon Moth')
  await expect(neon.locator('.n-role')).toContainText('Glimmerkin')
  for (const h of [
    'Attributes',
    'Condition',
    'Qualities',
    'Contacts',
    'Dice pools',
    'Skills',
    'Weapons',
    'Armor & augmentations',
    'Magic',
    'Matrix',
    'Gear',
    'Vehicles & drones',
  ])
    await expect(neon.getByRole('heading', { name: h, exact: true })).toBeVisible()
  await expect(neon.getByRole('list', { name: 'Key numbers' }).or(neon.locator('.n-keys'))).toContainText(`Defense${defense}`)
  await expect(neon.getByRole('img', { name: `Physical: ${physical} boxes` }).locator('i')).toHaveCount(physical)
  const best = neon.getByRole('region', { name: 'Dice pools' }).locator('.n-best > div')
  const pools = (await best.locator('b').allInnerTexts()).map(Number)
  expect(pools.length).toBeGreaterThan(0)
  expect(pools).toEqual([...pools].sort((a, b) => b - a)) // the best first
  await expect(neon.getByRole('region', { name: 'Weapons' }).locator('tr', { hasText: 'Zap Gun' })).toContainText('9/7/—/—/—')
  await expect(neon.getByRole('region', { name: 'Magic' })).toContainText('Glow Ward')
  // dark ink on white; the accents only rule and frame
  expect(await neon.evaluate(e => getComputedStyle(e).backgroundColor)).toBe('rgb(255, 255, 255)')
  expect(await neon.locator('h1').evaluate(e => getComputedStyle(e).color)).toBe('rgb(16, 32, 40)')
  await shootAndPrint(page, 'article.sr6-neon', 'neon', 1)

  // Hex: one page; attributes as hexagons, every skill in brackets, the tracks on a dark band
  await type.selectOption('hex')
  const hex = page.locator('article.sr6-hex')
  await expect(hex).toBeVisible()
  await expect(neon).toHaveCount(0)
  await expect(hex.getByRole('heading', { level: 2 })).toHaveText(['Personal data', 'Attributes', 'Skills', 'Core combat', 'Qualities', 'Edge'])
  await expect(hex.getByRole('region', { name: 'Personal data' })).toContainText('Neon Moth')
  await expect(hex.getByRole('region', { name: 'Personal data' })).toContainText('Glimmerkin')
  await expect(hex.locator('.x-attrs > div > span')).toHaveText(['BOD', 'AGI', 'REA', 'STR', 'WIL', 'LOG', 'INT', 'CHA', 'M/R'])
  await expect(hex.locator('.x-attrs svg')).toHaveCount(9)
  await expect(hex.getByRole('region', { name: 'Attributes' }).locator('.x-f', { hasText: 'Defense Rating' })).toContainText(defense)
  // every catalog skill: the runner's, and the rest at rank 0
  const skills = hex.getByRole('region', { name: 'Skills' })
  await expect(skills.locator('li', { hasText: 'Tinkering (LOG)' })).toContainText('Gizmos')
  await expect(skills.locator('li', { hasText: 'Wirespeak (RES)' })).toContainText('[0]')
  const combat = hex.getByRole('region', { name: 'Core combat' })
  await expect(combat.locator('tr', { hasText: 'Zap Gun' })).toContainText('8(c)')
  await expect(combat.locator('tr', { hasText: 'Padded Vest' })).toContainText('Worn')
  await expect(combat.locator('.x-big svg')).toHaveCount(3)
  await expect(hex.getByRole('region', { name: 'Qualities' })).toContainText('Butterfingers')
  await expect(hex.getByRole('region', { name: 'Edge' }).locator('.x-costs b')).toHaveText(['1', '2', '3', '4', '5'])
  const band = hex.getByRole('region', { name: 'Condition monitor' })
  const hexTrack = band.getByRole('img', { name: `Physical damage track: ${physical} boxes` })
  await expect(hexTrack.locator('svg')).toHaveCount(Math.max(18, Math.ceil(physical / 3) * 3))
  await expect(hexTrack.locator('svg.off')).toHaveCount(Math.max(18, Math.ceil(physical / 3) * 3) - physical)
  await expect(band.getByRole('img', { name: `Stun damage track: ${stun} boxes` }).locator('svg.off')).toHaveCount(15 - stun)
  await expect(band.getByRole('img', { name: /^Overflow: \d+ boxes$/ })).toBeVisible()
  // the band is dark ink, and keeps it printed
  expect(await band.evaluate(e => [getComputedStyle(e).backgroundColor, getComputedStyle(e).printColorAdjust])).toEqual(['rgb(16, 32, 40)', 'exact'])
  await shootAndPrint(page, 'article.sr6-hex', 'hex', 1)

  // Dossier: magenta-barred panels, up to two pages
  await type.selectOption('dossier')
  const dos = page.locator('article.sr6-dossier')
  await expect(dos).toBeVisible()
  await expect(hex).toHaveCount(0)
  for (const h of [
    'Personal data',
    'Edge / Nuyen',
    'Portrait',
    'Attributes',
    'Qualities',
    'Condition monitor',
    'Skills',
    'Weapons',
    'Armor',
    'Augmentations',
    'Contacts',
    'Gear',
    'IDs / lifestyles',
    'Magic',
    'Vehicles & drones',
    'Notes',
  ])
    await expect(dos.getByRole('heading', { name: h, exact: true })).toBeVisible()
  expect(
    await dos.getByRole('heading', { name: 'Personal data' }).evaluate(e => {
      const cs = getComputedStyle(e)
      return [cs.backgroundColor, cs.color, cs.textTransform]
    }),
  ).toEqual(['rgb(168, 0, 106)', 'rgb(255, 255, 255)', 'uppercase'])
  const personal = dos.getByRole('region', { name: 'Personal data' })
  await expect(personal.locator('.d-pairs > div', { hasText: 'Alias' })).toContainText('Neon Moth')
  await expect(personal.locator('.d-pairs > div').nth(1)).toContainText('Mara Testwing')
  await expect(personal.locator('.d-pairs > div', { hasText: 'Magic/Resonance' })).toContainText('Full magician')
  await expect(dos.getByRole('region', { name: 'Edge / Nuyen' }).getByRole('img', { name: /^Edge points: \d+$/ })).toBeVisible()
  const attrs = dos.getByRole('region', { name: 'Attributes' })
  for (const r of ['Body', 'Charisma', 'Edge', 'Magic', 'Minor Actions', 'Initiative (Matrix)', 'Initiative (Astral)', 'Lift/Carry'])
    await expect(attrs.getByRole('rowheader', { name: r, exact: true })).toBeVisible()
  const quals = dos.getByRole('region', { name: 'Qualities' })
  await expect(quals.locator('table').first()).toContainText('Knack')
  await expect(quals.locator('table').last()).toContainText('Butterfingers')
  await expect(dos.getByRole('img', { name: `Physical damage track: ${physical} boxes` }).locator('span')).toHaveCount(physical)
  await expect(dos.getByRole('img', { name: `Stun damage track: ${stun} boxes` }).locator('span')).toHaveCount(stun)
  await expect(dos.getByRole('region', { name: 'Condition monitor' })).toContainText('Overflow')
  await expect(dos.getByRole('region', { name: 'Skills' }).locator('tr', { hasText: 'Tinkering' })).toContainText('Gizmos')
  await expect(dos.getByRole('region', { name: 'Skills' })).toContainText('Lang: Sperethiel (Native)')
  await expect(dos.getByRole('region', { name: 'Weapons' }).locator('.d-ranged tr', { hasText: 'Fizz Rifle' })).toContainText('SA/BF')
  await expect(dos.getByRole('region', { name: 'Weapons' }).locator('.d-melee')).toContainText('Made-up Shock Baton')
  await expect(dos.getByRole('region', { name: 'Armor' }).locator('tr', { hasText: 'Defensive rating' })).toContainText(defense)
  await expect(dos.locator('.d-foot')).toContainText('created with Chummer')
  await shootAndPrint(page, 'article.sr6-dossier', 'dossier', 2, true)

  // Settings on an SR6 page offers the same six
  await page.getByRole('button', { name: 'Settings' }).click()
  const dlg = page.getByRole('dialog', { name: 'Settings' })
  await expect(dlg.getByRole('group', { name: 'Printed sheet' }).getByRole('radio')).toHaveCount(6)
  await expect(dlg.getByRole('radio', { name: 'Dossier' })).toBeChecked()
  await dlg.getByRole('button', { name: 'Close' }).click()

  // Anarchy has no Neon, Hex or Dossier: its print page shows Printer-friendly for them
  await put(page, '/api/characters/anarchy-neon', CA2)
  await page.goto('/#/c/anarchy-neon/print')
  await page.reload()
  await expect(page.locator('article.sheet')).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Sheet type' }).locator('option')).toHaveText(['Printer-friendly', 'Full color', 'Book style'])
  await expect(page.getByRole('combobox', { name: 'Sheet type' })).toHaveValue('plain')
})
