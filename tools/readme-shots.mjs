/* global window */
// Captures the README's screenshots from a real running build: `npm run build && node tools/readme-shots.mjs`.
// Starts the real server (server/server.mjs) on localhost with a throwaway data folder, seeded only with the made-up
// fixtures in tests/fixtures (no book text, no real runners) and a stub in place of the PDF importer. The accounts are made
// here with random passwords that are never printed. Output: docs/images/*.png. Needs Playwright's Chromium (`npx playwright install chromium`).
import { chromium } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { usersFile } from '../server/auth.mjs'
import { createServer } from '../server/server.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
process.chdir(root)
const OUT = process.env.SHOTS_OUT ?? join(root, 'docs', 'images')
const only = process.argv.slice(2) // optional: shot names to (re)take
mkdirSync(OUT, { recursive: true })

const pw = () => randomBytes(12).toString('base64url')
const PW = { ada: pw(), gil: pw(), pat: pw() }
const dir = mkdtempSync(join(tmpdir(), 'readme-shots-'))
const config = join(dir, 'library', '.config')
cpSync('tests/fixtures/mini/custom', join(dir, 'custom'), { recursive: true })
cpSync('tests/fixtures/sr6/custom', join(dir, 'custom', 'sr6'), { recursive: true })
// one made-up example runner for "Load example characters" (the importer's golden file) and one finished career runner
const imported = join(dir, 'custom', 'sr6', 'imported')
mkdirSync(join(imported, 'crb', 'samples'), { recursive: true })
cpSync('tests/fixtures/sr6/sample-glow-runner.xml', join(imported, 'crb', 'samples', 'crb.glow-runner.xml'))
writeFileSync(
  join(imported, 'samples.xml'),
  '<?xml version="1.0" encoding="UTF-8"?>\n<samples>\n  <sample source="CRB" href="crb/samples/crb.glow-runner.xml" name="Glow Runner" role="Archetype" page="81"/>\n</samples>\n',
)
mkdirSync(config, { recursive: true })
writeFileSync(
  join(config, 'users.xml'),
  await usersFile([
    { username: 'ada', password: PW.ada, name: 'Ada Admin' },
    { username: 'gil', password: PW.gil, role: 'editor', name: 'Gil Editor' },
    { username: 'pat', password: PW.pat, role: 'player', name: 'Pat Player' },
  ]),
)
const mk = async (extra = {}) => {
  const s = createServer({
    staticDir: 'dist',
    charDir: join(dir, 'characters'),
    customDir: join(dir, 'custom'),
    libraryDir: join(dir, 'library'),
    python: [process.execPath, 'tests/fixtures/stub-worker.mjs'],
    ...extra,
  })
  await new Promise((ok, fail) => s.once('error', fail).listen(0, '127.0.0.1', ok))
  return s
}
const server = await mk()
const base = `http://127.0.0.1:${server.address().port}/`
const browser = await chromium.launch()
const VIEW = { width: 1100, height: 720 }
// every shot uses the app's own dark theme (Settings, Theme = Dark; stored as ca2.settings.v1) and a dark colour scheme
const ctxDark = async (opts, init) => {
  const ctx = await browser.newContext({ colorScheme: 'dark', ...opts })
  await ctx.addInitScript(() => localStorage.setItem('ca2.settings.v1', JSON.stringify({ texture: 'flat', theme: 'dark' })))
  if (init) await ctx.addInitScript(init, undefined)
  return ctx
}

async function signIn(page, user, hash) {
  await page.goto(base + hash)
  await page.getByLabel('Username').fill(user)
  await page.getByLabel('Password', { exact: true }).fill(PW[user])
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByLabel('Username').waitFor({ state: 'detached' })
}
async function newPage(user, hash, game = 'sr6') {
  const ctx = await browser.newContext({ viewport: VIEW, baseURL: base, colorScheme: 'dark' })
  await ctx.addInitScript(g => localStorage.setItem('chummer.game', g), game)
  // Anarchy's paper-grain texture roughly doubles a PNG: the shots use the Flat texture setting (Settings, Texture)
  await ctx.addInitScript(() => localStorage.setItem('ca2.settings.v1', JSON.stringify({ texture: 'flat', theme: 'dark' })))
  const page = await ctx.newPage()
  await signIn(page, user, hash)
  return page
}
const shot = async (page, name, opts = {}) => {
  await page.waitForTimeout(500)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: join(OUT, `${name}.png`), ...opts })
  console.log('shot', name)
}
const put = async (page, path, xml) => {
  const r = await page.request.put(base + path, { data: xml, headers: { Origin: base.replace(/\/$/, ''), 'Content-Type': 'application/xml' } })
  if (!r.ok()) throw new Error(`PUT ${path} ${r.status()} ${await r.text()}`)
}
const want = n => !only.length || only.includes(n)

try {
  // STEPS. Name shots on the command line to retake only those; with none named, all are taken.
  const sr6 = await newPage('pat', '#/sr6', 'sr6')

  // first run: a server with no accounts shows the first-admin page (nothing is entered)
  if (want('first-admin')) {
    const d2 = mkdtempSync(join(tmpdir(), 'readme-shots-empty-'))
    const empty = await mk({ charDir: join(d2, 'characters'), customDir: join(d2, 'custom'), libraryDir: join(d2, 'library') })
    const ctx = await ctxDark({ viewport: { width: 1100, height: 560 } }, () => localStorage.setItem('chummer.game', 'ca2'))
    const p = await ctx.newPage()
    await p.goto(`http://127.0.0.1:${empty.address().port}/`)
    await p.waitForTimeout(1500)
    await shot(p, 'first-admin')
    await ctx.close()
    empty.stopJobs?.()
    empty.close()
    rmSync(d2, { recursive: true, force: true })
  }

  // the picker: a browser that has not chosen a game yet
  if (want('game-picker')) {
    const ctx = await ctxDark({ viewport: { width: 1100, height: 560 } })
    const p = await ctx.newPage()
    await p.goto(base) // the picker comes before sign-in
    await p.waitForTimeout(1000)
    await shot(p, 'game-picker')
    await ctx.close()
  }

  // Shadowrun 6, as a player
  await put(sr6, 'api/sr6/characters/career-wisp-1', readFileSync('tests/fixtures/sr6/runner-career.xml', 'utf8'))
  await sr6.goto(base + '#/sr6')
  await sr6.getByRole('button', { name: 'Load example characters' }).click()
  await sr6.getByText('Added 1 example character.').waitFor()
  if (want('sr6-runners')) await shot(sr6, 'sr6-runners')
  if (want('sr6-ledger')) {
    await sr6.goto(base + '#/sr6/c/career-wisp-1/ledger')
    await shot(sr6, 'sr6-ledger')
  }
  if (want('sr6-print')) {
    await sr6.goto(base + '#/sr6/c/career-wisp-1/print')
    await shot(sr6, 'sr6-print', { clip: { x: 0, y: 0, width: 1100, height: 1000 } })
  }

  // a draft runner, built with the made-up fixture
  await sr6.goto(base + '#/sr6')
  await sr6.getByRole('button', { name: 'New runner' }).click()
  const dlg = sr6.getByRole('dialog', { name: 'New runner' })
  await dlg.getByLabel('Street name').fill('Zip Spark')
  await dlg.getByRole('button', { name: 'Create runner' }).click()
  await sr6.waitForURL(/concept$/)
  const tabs = sr6.getByRole('navigation', { name: 'Character sections' }).getByRole('link')
  await tabs.filter({ hasText: 'Creation method' }).click()
  for (const [col, l] of [
    ['Magic or Resonance', 'A'],
    ['Attributes', 'B'],
    ['Skills', 'C'],
    ['Metatype', 'D'],
    ['Resources', 'E'],
  ])
    await sr6.getByLabel(`${col} priority`).selectOption(l)
  await sr6.getByLabel('Metatype', { exact: true }).selectOption({ label: 'Glimmerkin (5 adjustment points)' })
  await sr6.getByLabel('Magic kind').selectOption('full')
  if (want('sr6-method')) await shot(sr6, 'sr6-method')
  await tabs.filter({ hasText: 'Attributes' }).click()
  for (let i = 0; i < 2; i++) await sr6.getByRole('button', { name: 'Raise Body points' }).click()
  await sr6.getByRole('button', { name: 'Raise Edge adjustment' }).click()
  if (want('sr6-attributes')) await shot(sr6, 'sr6-attributes')
  await tabs.filter({ hasText: 'Gear' }).click()
  if (want('sr6-gear')) await shot(sr6, 'sr6-gear')
  await tabs.filter({ hasText: 'Review' }).click()
  if (want('sr6-review')) await shot(sr6, 'sr6-review')

  // Shadowrun 6, as a GM
  const gil = await newPage('gil', '#/sr6/npcs', 'sr6')
  await gil.getByRole('button', { name: 'Load book NPCs' }).click()
  await gil.getByText(/^Loaded \d+/).waitFor()
  if (want('sr6-npcs')) await shot(gil, 'sr6-npcs')
  if (want('sr6-designer')) {
    await gil.goto(base + '#/sr6/designs')
    await gil.locator('button.primary').first().click()
    await shot(gil, 'sr6-designer')
  }
  if (want('sr6-table-setup')) {
    await gil.goto(base + '#/sr6/table')
    await shot(gil, 'sr6-table-setup')
  }
  if (want('sr6-game-data')) {
    await gil.goto(base + '#/sr6/data')
    await shot(gil, 'sr6-game-data')
  }

  // the admin
  const ada = await newPage('ada', '#/sr6/books', 'sr6')
  if (want('sr6-books')) await shot(ada, 'sr6-books')
  if (want('settings')) {
    await ada.getByRole('button', { name: 'Settings' }).click()
    await ada.waitForTimeout(500)
    await shot(ada, 'settings')
  }

  // Anarchy
  const an = await newPage('pat', '#/', 'ca2')
  await an.getByRole('button', { name: 'Load example characters' }).click()
  await an.waitForTimeout(800)
  if (want('anarchy-runners')) await shot(an, 'anarchy-runners')
  await an.getByRole('button', { name: 'New runner' }).click()
  await an.getByRole('button', { name: 'Create runner' }).click()
  await an.getByLabel('Street name').fill('Smoke Test')
  await an.getByRole('link', { name: 'Attributes' }).click()
  for (const a of ['Brawn', 'Finesse', 'Resolve', 'Wits', 'Presence']) for (let i = 0; i < 2; i++) await an.getByRole('button', { name: `Raise ${a}` }).click()
  await an.getByRole('link', { name: 'Skills', exact: true }).click()
  for (const k of ['Athletics', 'Stealth', 'Perception', 'Influence', 'Network'])
    for (let i = 0; i < 2; i++) await an.getByRole('button', { name: `Raise ${k}` }).click()
  await an.getByRole('link', { name: 'Gear & spells' }).click()
  await an.getByRole('button', { name: 'Add from the book' }).first().click()
  await an.getByRole('option').filter({ hasText: 'Vest' }).click()
  await an.getByRole('link', { name: 'Shadow Amps' }).click()
  await an.getByRole('button', { name: 'Add an amp' }).click()
  if (want('anarchy-amps')) await shot(an, 'anarchy-amps')
  await an.getByRole('button', { name: 'Close', exact: true }).click()
  await an.getByRole('link', { name: 'Review' }).click()
  await an.getByRole('button', { name: 'Finalize runner' }).click()
  if (want('anarchy-finalize')) await shot(an, 'anarchy-finalize')
  await an.getByRole('button', { name: 'Finalize', exact: true }).click()
  await an.getByLabel('Nuyen earned').fill('50000')
  await an.getByLabel('Run', { exact: true }).fill('Smoke run')
  await an.getByRole('button', { name: 'Record earnings' }).click()
  await an.getByRole('button', { name: 'Record it' }).click()
  if (want('anarchy-ledger')) await shot(an, 'anarchy-ledger')
  await an.getByRole('link', { name: 'Print' }).click()
  if (want('anarchy-print')) await shot(an, 'anarchy-print', { clip: { x: 0, y: 0, width: 1100, height: 900 } })
  await an.goto(base + '#/table')
  if (want('anarchy-table-setup')) await shot(an, 'anarchy-table-setup')
} finally {
  await browser.close()
  server.stopJobs?.()
  server.close()
  rmSync(dir, { recursive: true, force: true })
}
