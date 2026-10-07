// @vitest-environment node
// A restart in the middle of a queue (an update recreating the container during Books → Re-import all): the next start
// re-queues the books, in their order, in both games, and they import as usual. Three Libraries, made-up files:
// statuses only (what 0.10.2 left on disk), a jobs.json left by a stop, and a stop during a running job.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, vi } from 'vitest'
import { createServer } from './_signin'

vi.setConfig({ testTimeout: 40000 })
type Srv = { close: () => void; listen: (p: number, cb: () => void) => void; address: () => { port: number }; started: Promise<void>; stopJobs: () => void }
type Book = { id: string; state: string; message: string; busy: boolean }
const STUB = [process.execPath, 'tests/fixtures/stub-worker.mjs']
const PDF = (marker = '') => Buffer.concat([Buffer.from(`%PDF-1.4 made up ${marker}\n`), Buffer.alloc(256)])

/** a book folder: its PDF (unless pdf is false), upload record and status */
function folder(lib: string, id: string, state: string, message = '', { pdf = true, marker = '' } = {}) {
  mkdirSync(join(lib, id), { recursive: true })
  if (pdf) writeFileSync(join(lib, id, 'original.pdf'), PDF(marker))
  writeFileSync(join(lib, id, 'upload.xml'), `<upload file="${id}.pdf" size="273" sha256="${id}" uploaded="2026-10-06T00:00:00Z"/>\n`)
  if (state) writeFileSync(join(lib, id, 'status.xml'), `<status state="${state}" updated="2026-10-07T06:00:00Z">${message}</status>\n`)
}

async function start(dir: string): Promise<{ srv: Srv; base: string }> {
  const srv: Srv = createServer({ staticDir: 'public', charDir: join(dir, 'chars'), customDir: join(dir, 'custom'),
    libraryDir: join(dir, 'library'), python: STUB })
  const base = await new Promise<string>(ok => srv.listen(0, () => ok(`http://127.0.0.1:${srv.address().port}`)))
  return { srv, base }
}
const list = async (base: string, api = 'books'): Promise<Book[]> => (await fetch(`${base}/api/${api}`)).json()
async function settled(base: string, api: string, id: string, state = 'done') {
  await vi.waitFor(async () => expect((await list(base, api)).find(b => b.id === id)).toMatchObject({ state, busy: false }),
    { timeout: 25000, interval: 50 })
}
const runs = (log: string) => readFileSync(log, 'utf8').trim().split('\n').filter(l => /^(sr6:)?run /.test(l)).map(l => l.split(' ')[1])

test('statuses left by a restart: the cut-off books are re-imported in upload order, in both games', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ca2-resume-status-')), lib = join(dir, 'library'), log = join(dir, 'stub.log')
  vi.stubEnv('STUB_LOG', log)
  folder(lib, 'b1-was-running', 'failed', 'made-up error\nstopped (SIGTERM, after 1800s at most)')
  folder(lib, 'b2-was-queued', 'failed', 'Interrupted by a restart — re-import')
  folder(lib, 'b3-mid-step', 'converting')
  folder(lib, 'b4-no-pdf', 'queued', '', { pdf: false })
  folder(lib, 'b5-done', 'done')
  folder(lib, 'b6-timed-out', 'failed', 'timed out after 1800s (SIGTERM)')
  folder(join(lib, 'sr6'), 's1-mid-step', 'extracting')
  const { srv, base } = await start(dir)
  try {
    await srv.started
    for (const id of ['b1-was-running', 'b2-was-queued', 'b3-mid-step']) await settled(base, 'books', id)
    await settled(base, 'sr6/books', 's1-mid-step')
    expect(runs(log)).toEqual(['b1-was-running', 'b2-was-queued', 'b3-mid-step', 's1-mid-step'])
    const books = await list(base)
    expect(books.find(b => b.id === 'b4-no-pdf')).toMatchObject({ state: 'failed', message: 'Interrupted by a restart — re-import' })
    expect(books.find(b => b.id === 'b6-timed-out')).toMatchObject({ state: 'failed' }) // a time limit: not the restart's
    expect(readFileSync(join(lib, 'b5-done', 'status.xml'), 'utf8')).toContain('updated="2026-10-07T06:00:00Z"') // untouched
  } finally { srv.stopJobs(); srv.close(); vi.unstubAllEnvs() }
})

test('a queue left in jobs.json runs again in its own order, and its Re-import all goes on', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ca2-resume-jobs-')), lib = join(dir, 'library'), log = join(dir, 'stub.log')
  const custom = join(dir, 'custom')
  vi.stubEnv('STUB_LOG', log)
  folder(lib, 'z1-second', 'queued')
  folder(lib, 'z2-first', 'converting', '', { marker: 'slow' }) // running at the stop (1.5 s: still busy when asked)
  folder(join(lib, 'sr6'), 'y1-third', 'queued')
  const reimport = (game: string, id: string) => {
    const [pre, l, c] = game === 'sr6' ? [['sr6'], join(lib, 'sr6'), join(custom, 'sr6')] : [[], lib, custom]
    return { game, id, steps: [[...pre, 'remove', join(l, id), '--custom', c], [...pre, 'run', join(l, id), '--custom', c, '--reuse']] }
  }
  mkdirSync(join(lib, '.config'), { recursive: true })
  writeFileSync(join(lib, '.config', 'jobs.json'), JSON.stringify({
    jobs: [reimport('ca2', 'z2-first'), reimport('ca2', 'z1-second'), reimport('sr6', 'y1-third')],
    batches: { ca2: { queued: ['z1-second', 'z2-first'], skipped: [{ id: 'z0', why: 'no PDF' }] }, sr6: null } }))
  const { srv, base } = await start(dir)
  try {
    await srv.started
    // the page opened after the restart finds the batch for its progress line
    expect(await (await fetch(`${base}/api/books/reimport-all`)).json())
      .toEqual({ queued: ['z1-second', 'z2-first'], skipped: [{ id: 'z0', why: 'no PDF' }] })
    expect((await list(base)).find(b => b.id === 'z1-second')).toMatchObject({ busy: true }) // (queued, or importing by now)
    for (const id of ['z2-first', 'z1-second']) await settled(base, 'books', id)
    await settled(base, 'sr6/books', 'y1-third')
    expect(runs(log)).toEqual(['z2-first', 'z1-second', 'y1-third'])
    expect(await (await fetch(`${base}/api/books/reimport-all`)).json()).toEqual({ queued: [], skipped: [] }) // done
    await vi.waitFor(() => expect(existsSync(join(lib, '.config', 'jobs.json'))).toBe(false)) // an idle queue: no file
  } finally { srv.stopJobs(); srv.close(); vi.unstubAllEnvs() }
})

test('a stop during Re-import all: the running book is not failed, and the next start finishes the queue', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ca2-resume-stop-')), lib = join(dir, 'library')
  folder(lib, 'c1-slow', '', '', { marker: 'slow' })
  folder(lib, 'c2-next', '')
  const one = await start(dir)
  await one.srv.started
  const r = await (await fetch(`${one.base}/api/books/reimport-all`, { method: 'POST' })).json()
  expect(r.queued).toEqual(['c1-slow', 'c2-next'])
  await vi.waitFor(async () => expect((await list(one.base)).find(b => b.id === 'c1-slow')).toMatchObject({ state: 'importing' }),
    { timeout: 10000, interval: 20 })
  one.srv.stopJobs() // the container stopping (SIGTERM)
  one.srv.close()
  await new Promise(ok => setTimeout(ok, 300))
  expect(readFileSync(join(lib, 'c1-slow', 'status.xml'), 'utf8')).not.toContain('state="failed"')
  expect(JSON.parse(readFileSync(join(lib, '.config', 'jobs.json'), 'utf8')).jobs.map((j: { id: string }) => j.id))
    .toEqual(['c1-slow', 'c2-next'])
  const two = await start(dir)
  try {
    await two.srv.started
    for (const id of ['c1-slow', 'c2-next']) await settled(two.base, 'books', id)
    expect(existsSync(join(lib, 'c2-next', 'import.xml'))).toBe(true)
  } finally { two.srv.stopJobs(); two.srv.close() }
})
