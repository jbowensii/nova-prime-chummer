// @vitest-environment node
// Core data on the server. Start-up: a server without custom/imported/core/ whose Library holds the core rulebook
// re-imports it, then the Conversion Guide and DHSA; with core data in place it leaves the Library alone. Core tables a
// recipe couldn't read go through the AI review into custom/imported/core/. Stub worker in place of Python.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, vi } from 'vitest'
import { createServer } from './_signin'

vi.setConfig({ testTimeout: 30000 })

function library(dir: string) {
  const book = (id: string, recipe: string, source: string) => {
    mkdirSync(join(dir, 'library', id), { recursive: true })
    writeFileSync(join(dir, 'library', id, 'original.pdf'), '%PDF-1.4 stub\n')
    writeFileSync(join(dir, 'library', id, 'import.xml'), `<import recipe="${recipe}" source="${source}" file="${id}.pdf"><files/><report/></import>\n`)
    writeFileSync(join(dir, 'library', id, 'status.xml'), '<status state="done" updated="2026-09-28T00:00:00Z"></status>\n')
  }
  book('a-dhsa', 'dhsa', 'DHSA')
  book('b-qref', 'qref', 'QREF')
  book('c-cg', 'cg', 'CG')
  book('d-crb', 'crb', 'CRB')
}

async function start(dir: string, calls: number) {
  const log = join(dir, 'calls.log')
  writeFileSync(log, '')
  vi.stubEnv('STUB_LOG', log)
  const srv = createServer({
    staticDir: 'public',
    charDir: join(dir, 'chars'),
    customDir: join(dir, 'custom'),
    libraryDir: join(dir, 'library'),
    python: [process.execPath, 'tests/fixtures/stub-worker.mjs'],
  })
  await srv.started
  // the calls logged and every job ended (jobs.json goes once the queue is empty): a stop mid-job would leave that job
  // in jobs.json and the next start would resume it
  const jobs = join(dir, 'library', '.config', 'jobs.json')
  for (let i = 0; i < 600 && (readFileSync(log, 'utf8').split('\n').filter(Boolean).length < calls || existsSync(jobs)); i++)
    await new Promise(r => setTimeout(r, 25))
  await new Promise(r => setTimeout(r, 200)) // nothing more comes
  srv.stopJobs()
  return readFileSync(log, 'utf8').split('\n').filter(Boolean)
}

test('no core data and a core rulebook in the Library: it is re-imported first, then the CG and DHSA', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ca2-core-'))
  library(dir)
  const calls = await start(dir, 6)
  expect(calls.map(c => c.split(' ').slice(0, 2).join(' '))).toEqual(['remove d-crb', 'run d-crb', 'remove c-cg', 'run c-cg', 'remove a-dhsa', 'run a-dhsa'])
  expect(calls.every(c => c.endsWith(join(dir, 'custom')))).toBe(true) // the importer finds the core files in <custom>/imported/core
})

const CORE = ['ampeffects', 'amptypes', 'armor', 'attributes', 'levels', 'lifestyles', 'metatypes', 'packages', 'pricing', 'skills', 'vehicles', 'weapons']
const core = (dir: string, names: string[]) => {
  mkdirSync(join(dir, 'custom', 'imported', 'core'), { recursive: true })
  for (const n of names)
    writeFileSync(join(dir, 'custom', 'imported', 'core', `${n}.xml`), `<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="${n}" version="1"/>\n`)
}

test('core data in place: the Library is left alone', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ca2-core-'))
  library(dir)
  core(dir, CORE)
  expect(await start(dir, 0)).toEqual([])
})

test('a core the CRB can’t complete is tried once per book file and app version, not on every start', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ca2-core-'))
  library(dir)
  core(
    dir,
    CORE.filter(n => n !== 'lifestyles'),
  ) // one table the book didn't give
  expect(await start(dir, 6)).toHaveLength(6)
  expect(await start(dir, 0)).toEqual([]) // the next start: already tried
  writeFileSync(join(dir, 'library', 'd-crb', 'import.xml'), '<import recipe="crb" source="CRB" file="d-crb.pdf" sha256="other"><files/><report/></import>\n')
  expect((await start(dir, 6)).map(c => c.split(' ').slice(0, 2).join(' '))[1]).toBe('run d-crb') // a new file: tried again
})

test('core tables a recipe couldn’t read: the AI reads them, the accepted rows become the core file, the book lists it as read by AI', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ca2-core-'))
  const custom = join(dir, 'custom'),
    lib = join(dir, 'library')
  core(dir, CORE)
  for (const [id, rows] of [
    ['crb', '<row kind="core-unread" file="weapons.xml" page="142" mdPages="144-144"/><row kind="core-unread" file="levels.xml"/>'],
    ['lv', '<row kind="core-unread" file="levels.xml" page="84" mdPages="86-87"/>'],
    ['other', ''],
  ]) {
    mkdirSync(join(lib, id), { recursive: true })
    writeFileSync(
      join(lib, id, 'import.xml'),
      `<import recipe="${id}" source="${id.toUpperCase()}" file="${id}.pdf"><files/><report>${rows}</report></import>\n`,
    )
    writeFileSync(join(lib, id, 'status.xml'), '<status state="done" updated="2026-09-28T00:00:00Z"></status>\n')
  }
  const srv = createServer({
    staticDir: 'public',
    charDir: join(dir, 'chars'),
    customDir: custom,
    libraryDir: lib,
    python: [process.execPath, 'tests/fixtures/stub-worker.mjs'],
  })
  await new Promise<void>(ok => srv.listen(0, ok))
  const base = `http://127.0.0.1:${srv.address().port}/api`
  const state = async (id: string) => {
    for (let i = 0; i < 600; i++) {
      const b = (await (await fetch(`${base}/books`)).json()).find((x: { id: string }) => x.id === id)
      if (!b.busy && !['queued', 'proposing', 'applying'].includes(b.state)) return b
      await new Promise(r => setTimeout(r, 25))
    }
  }
  try {
    expect(await state('crb')).toMatchObject({ source: 'CRB', coreUnread: ['weapons.xml', 'levels.xml'] })
    expect((await fetch(`${base}/books/other/ai`, { method: 'POST' })).status).toBe(409) // a recipe's book with nothing unread
    expect((await fetch(`${base}/books/lv/ai?dryRun=1`, { method: 'POST' })).status).toBe(200) // any core table, not only weapons and armor
    expect(await (await fetch(`${base}/books/crb/ai?dryRun=1`, { method: 'POST' })).json()).toEqual({ parts: 4, provider: 'anthropic' })
    expect((await fetch(`${base}/books/crb/ai`, { method: 'POST' })).status).toBe(202)
    expect(await state('crb')).toMatchObject({ state: 'review', review: 'done' })
    const review = (await (await fetch(`${base}/review/crb`)).text()).replace('state="pending"', 'state="accepted"')
    expect(review).toContain('core="true"')
    const put = await fetch(`${base}/review/crb?apply=1`, { method: 'PUT', headers: { 'Content-Type': 'application/xml' }, body: review })
    expect(put.status).toBe(202) // no source, name or canon: the rows cite the book as imported
    expect(await state('crb')).toMatchObject({ state: 'done', coreUnread: ['levels.xml'], coreAi: ['weapons.xml'] })
    expect(readFileSync(join(custom, 'imported', 'core', 'weapons.xml'), 'utf8')).toContain('<item id="pea-shooter" kind="weapon"')
  } finally {
    srv.stopJobs()
    srv.close()
  }
})
