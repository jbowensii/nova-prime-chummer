// Books: upload PDFs, see what each import produced, re-import or remove, and send unknown books to the AI
// (server/books.mjs). Progress comes from each book's status.xml, polled every 2 s while anything runs.
import { useEffect, useRef, useState } from 'react'
import { dupeGroups } from '../engine'
import type { Catalog } from '../model/types'
import { Modal, NonCanon } from './bits'
import { useRepo } from './repo'
import { AccountMenu, because, sessionEnded } from './auth'
import { SettingsButton } from './settings'

export interface Book { id: string; file?: string; state: string; message: string; source?: string; name?: string; canon?: boolean;
  recipe?: string; imported?: string; counts: Record<string, number>; busy: boolean; review?: 'done' | 'partial'
  /** core files the book's recipe couldn't read (the AI can read the weapons and armor tables) */
  coreUnread?: string[] }

const STATE: Record<string, string> = { queued: 'Waiting', converting: 'Reading the PDF', identifying: 'Recognizing the book',
  extracting: 'Extracting entries', 'needs-ai': 'Needs AI', proposing: 'Asking the AI', review: 'Ready to review',
  applying: 'Adding entries', done: 'Imported', failed: 'Failed', removed: 'Removed' }
const LIVE = ['queued', 'converting', 'identifying', 'extracting', 'proposing', 'applying']
export const PROVIDER_NAMES: Record<string, string> = { anthropic: 'Anthropic', openai: 'OpenAI-compatible', gemini: 'Google Gemini', anythingllm: 'AnythingLLM' }
const KINDS: [RegExp, string, string][] = [[/^amps/, 'amp', 'amps'], [/^spells/, 'spell', 'spells'], [/^complexforms/, 'complex form', 'complex forms'],
  [/^gear/, 'gear item', 'gear items'], [/^weapons/, 'weapon', 'weapons'], [/^armor/, 'armor', 'armor'], [/^rules/, 'rule', 'rules'],
  [/^skills/, 'skill', 'skills']]

/** "148 amps, 33 spells": entries per kind of overlay file (rules-base.xml and rules-magic.xml add up). */
function counts(c: Record<string, number>) {
  const n = new Map<string, number>()
  for (const [file, k] of Object.entries(c)) {
    const kind = KINDS.find(([re]) => re.test(file))
    const key = kind ? kind[1] : file.replace(/\.xml$/, '')
    n.set(key, (n.get(key) ?? 0) + k)
  }
  return [...n].map(([k, v]) => `${v} ${v === 1 ? k : KINDS.find(x => x[1] === k)?.[2] ?? k}`).join(', ')
}

/** A recipe's book with weapons or armor tables it couldn't read: the AI can propose their rows. */
const coreAi = (b: Book) => !!b.source && !!b.coreUnread?.some(f => f === 'weapons.xml' || f === 'armor.xml')

const UNREACHABLE = 'the server can’t be reached'

/** JSON from the Books API, or an Error carrying the server's own message. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`./api/${path}`, { cache: 'no-store', ...init }).catch(() => { throw new Error(UNREACHABLE) })
  if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? `the server answered ${r.status}`)
  return (r.status === 204 ? null : r.headers.get('content-type')?.includes('json') ? r.json() : r.text()) as Promise<T>
}

/** POST one file with upload progress (fetch can't report it; a book can be hundreds of MB, a backup GBs); the response text. */
export function sendFile(path: string, file: File, headers: Record<string, string>, onProgress: (pct: number) => void): Promise<string> {
  return new Promise((ok, fail) => {
    const x = new XMLHttpRequest()
    x.open('POST', `./api/${path}`)
    for (const [k, v] of Object.entries(headers)) x.setRequestHeader(k, v)
    x.upload.onprogress = e => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100))
    x.onload = () => {
      if (x.status === 401) { // the sign-in form comes up over the page
        sessionEnded()
        return fail(Object.assign(new Error('you were signed out: sign in again, then send it again'), { status: 401 }))
      }
      return x.status < 300 ? ok(x.responseText) : fail(Object.assign(new Error((() => { try { return JSON.parse(x.responseText).error } catch { return `the server answered ${x.status}` } })()), { status: x.status }))
    }
    x.onerror = () => fail(new Error(UNREACHABLE))
    x.send(file)
  })
}

/** Supported books: public/data/sources.xml as shipped (the merged catalog can't tell a shipped source from an import). */
async function supportedBooks(): Promise<{ id: string; name: string; canon: boolean }[]> {
  const r = await fetch('./data/sources.xml', { cache: 'no-cache' }).catch(() => null)
  if (!r?.ok) return []
  const doc = new DOMParser().parseFromString(await r.text(), 'text/xml')
  return [...doc.getElementsByTagName('source')].map(s => ({ id: s.getAttribute('id')!, name: s.getElementsByTagName('name')[0]?.textContent ?? '', canon: s.getAttribute('canon') === 'true' }))
}

export function BooksHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <header>
      <div style={{ flex: 1 }}><a className="brand" href="#/">Chummer <b>Anarchy</b> 2.0</a><h1>{title}</h1></div>
      <div className="row">{children}<a className="btn quiet" href="#/">Your runners</a><SettingsButton /><AccountMenu /></div>
    </header>
  )
}

interface PackSummary { app: string; created: string; files: string[]; replaces: string[] }
const tables = (files: string[]) => files.map(f => f.replace(/\.xml$/, '')).join(', ')

/** The core data as a data pack (server/books.mjs /api/datapack): download it, or load one onto this server — the way to
 *  core data without the core rulebook's PDF. Loading is two steps, like a restore: upload + check (a summary with a
 *  token), then load. The setup screen links here as #/books/datapack. */
function DataPack({ reload }: { reload: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null)
  const [preview, setPreview] = useState<{ token: string; pack: PackSummary } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null), headRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => { if (/^#\/books\/datapack$/.test(location.hash)) { fileRef.current?.scrollIntoView({ block: 'center' }); fileRef.current?.focus() } }, [])
  // the preview's heading takes focus; once it's gone (cancelled or loaded) the picker gets it back when it's usable again
  const back = useRef(false)
  useEffect(() => {
    if (preview) { headRef.current?.focus(); back.current = true }
    else if (!busy && back.current) { back.current = false; fileRef.current?.focus() }
  }, [preview, busy])
  const why = (e: unknown) => (e as Error).message

  /** Two steps, like a backup: the server makes the pack, then the browser fetches it by token as a plain download. */
  const download = async () => {
    setMsg(null)
    setBusy('Making the data pack…')
    try {
      const { token } = await api<{ token: string }>('datapack', { method: 'POST' })
      const a = document.createElement('a')
      a.href = `./api/datapack/${token}`
      a.download = '' // the server's name: chummer-anarchy2-datapack-<date>.zip
      a.click()
      setMsg({ text: 'The data pack is ready. Your browser is saving it.' })
    } catch (e) { setMsg({ err: true, text: because('Couldn’t make the data pack', why(e)) }) }
    setBusy(null)
  }

  const refused = (e: unknown) => {
    const status = (e as { status?: number }).status
    setMsg({ err: true, text: status === 413 ? 'This file is larger than 50 MB, so it isn’t a data pack. Choose a data pack made by this app.'
      : status === 400 || status === 415 ? `${because('This file can’t be loaded', why(e))} Choose a data pack made by this app.`
      : because('Couldn’t load the data pack', why(e)) })
  }

  const upload = async (file: File | undefined) => {
    if (!file) return
    setMsg(null)
    setBusy('Checking the data pack…')
    try { setPreview(JSON.parse(await sendFile('datapack/import', file, { 'Content-Type': 'application/zip' }, () => {}))) }
    catch (e) { refused(e) }
    setBusy(null)
  }

  const load = async (token: string) => {
    setPreview(null)
    setBusy('Loading the data pack…')
    try {
      const r = await api<{ files: string[] }>(`datapack/import/${token}`, { method: 'POST' })
      setMsg({ text: `Data pack loaded: ${r.files.length} core ${r.files.length === 1 ? 'table' : 'tables'} replaced.` })
      reload()
    } catch (e) { refused(e) }
    setBusy(null)
  }

  const p = preview?.pack
  return (
    <section className="datapack" id="datapack">
      <h2>Core data</h2>
      <p className="muted">The rules tables the app is built on, made when the core rulebook is imported. A data pack carries them to
        another server without the book: it holds no descriptions, PDFs or keys. Loading one replaces the tables it holds.</p>
      <div className="row">
        <button className="btn" disabled={!!busy} onClick={() => void download()}>Download data pack</button>
        <label className="btn file" aria-disabled={!!busy || !!preview}>Upload data pack
          <input ref={fileRef} type="file" accept=".zip,application/zip" aria-label="Upload data pack" disabled={!!busy || !!preview}
            onChange={e => { void upload(e.target.files?.[0]); e.target.value = '' }} />
        </label>
      </div>
      {preview && p && (
        <div className="restore-preview">
          <h3 ref={headRef} tabIndex={-1}>Load this data pack?</h3>
          <dl>
            {([['Made', new Date(p.created).toLocaleString()], ['App version', p.app],
              ['Tables', `${p.files.length} of 12: ${tables(p.files)}`],
              ['Replaces', p.replaces.length ? tables(p.replaces) : 'Nothing: the server has none of these tables yet'],
              ...(p.files.length > p.replaces.length && p.replaces.length ? [['Adds', tables(p.files.filter(f => !p.replaces.includes(f)))]] : [])] as [string, string][])
              .map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
          {p.replaces.length > 0 && <p className="err">The server’s current copies of those tables are overwritten. House rules, edits and imported books stay.</p>}
          <div className="row">
            <button className="btn" onClick={() => setPreview(null)}>Cancel</button>
            <button className="btn primary" onClick={() => void load(preview.token)}>Load data pack</button>
          </div>
        </div>
      )}
      <div role="status" aria-live="polite">
        {busy && <p className="muted">{busy}</p>}
        {msg && !msg.err && <p className="banner">{msg.text}</p>}
      </div>
      <div role="alert">{msg?.err && <p className="banner err">{msg.text}</p>}</div>
    </section>
  )
}

export function BooksScreen({ c, reload }: { c: Catalog; reload: () => void }) {
  const repo = useRepo()
  const [books, setBooks] = useState<Book[] | null>(null)
  const [supported, setSupported] = useState<{ id: string; name: string; canon: boolean }[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [uploading, setUploading] = useState<{ name: string; pct: number } | null>(null)
  const [removing, setRemoving] = useState<Book | null>(null)
  const [withFiles, setWithFiles] = useState(false)
  const [asking, setAsking] = useState<{ book: Book; fresh: boolean; parts?: number; provider?: string | null; keySet?: boolean } | null>(null)
  const [report, setReport] = useState<{ book: Book; rows: Record<string, string>[] } | null>(null)
  const [over, setOver] = useState(false)
  const [offline, setOffline] = useState(false)
  const [live, setLive] = useState('') // spoken only: upload start/end and state changes
  const settled = useRef<string | null>(null)
  const states = useRef(new Map<string, string>())

  // a failed poll keeps the last list and keeps polling; only a real answer replaces it
  const refresh = () => api<Book[]>('books').then(b => { setOffline(false); setBooks(b) }, () => setOffline(true))
  useEffect(() => { if (repo.mode === 'server') { void refresh(); void supportedBooks().then(setSupported) } }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const running = books?.some(b => b.busy || LIVE.includes(b.state))
  useEffect(() => {
    if (!running && !offline) return
    const t = setInterval(refresh, 2000)
    return () => clearInterval(t)
  }, [running, offline]) // eslint-disable-line react-hooks/exhaustive-deps

  // a finished import or removal changes the catalog: load it again
  useEffect(() => {
    if (!books) return
    const key = books.filter(b => !b.busy && !LIVE.includes(b.state)).map(b => `${b.id}:${b.state}:${b.imported}`).join(' ')
    if (settled.current !== null && settled.current !== key) reload()
    settled.current = key
    const changed = books.filter(b => states.current.has(b.id) && states.current.get(b.id) !== b.state)
    if (changed.length) setLive(changed.map(b => `${b.name ?? b.file ?? b.id}: ${STATE[b.state] ?? b.state}`).join('. '))
    states.current = new Map(books.map(b => [b.id, b.state]))
  }, [books]) // eslint-disable-line react-hooks/exhaustive-deps

  if (repo.mode !== 'server') return (
    <main className="lib">
      <BooksHeader title="Books" />
      <p>Importing books needs the app’s server, which stores the PDFs and runs the importer. Start it with <code>npm run serve</code> or the Docker image, then open this page there.</p>
    </main>
  )

  const upload = async (files: FileList | File[] | null) => {
    const pdfs = [...files ?? []]
    const bad = pdfs.filter(f => !/\.pdf$/i.test(f.name) && f.type !== 'application/pdf')
    if (bad.length) setMsg(`${bad.map(f => f.name).join(', ')} isn’t a PDF, so it was left out.`)
    for (const f of pdfs.filter(f => !bad.includes(f))) {
      setUploading({ name: f.name, pct: 0 })
      setLive(`Uploading ${f.name}`)
      try {
        await sendFile('books', f, { 'Content-Type': 'application/pdf', 'X-Filename': encodeURIComponent(f.name) }, pct => setUploading({ name: f.name, pct }))
        setLive(`Uploaded ${f.name}`)
      }
      catch (e) { setMsg(`${because(`Couldn’t upload ${f.name}`, (e as Error).message)}${(e as { status?: number }).status === 413 ? ' Books can be up to 500 MB.' : (e as { status?: number }).status === 401 ? '' : ' Try again.'}`) }
    }
    setUploading(null)
    void refresh()
  }

  const act = async (what: string, run: () => Promise<unknown>) => {
    try { await run() } catch (e) { setMsg(because(`Couldn’t ${what}`, (e as Error).message)) }
    void refresh()
  }

  /** `fresh`: finished proposals exist; sending again replaces them and the decisions made on them. */
  const ask = async (book: Book, fresh = false) => {
    setAsking({ book, fresh })
    try {
      const [dry, settings] = await Promise.all([api<{ parts: number; provider: string | null }>(`books/${book.id}/ai?dryRun=1`, { method: 'POST' }), api<string>('ai-settings')])
      setAsking({ book, fresh, ...dry, keySet: !!dry.provider && settings.includes(`<key provider="${dry.provider}" set="true"`) })
    }
    catch (e) { setAsking(null); setMsg(because('Couldn’t prepare the AI import', (e as Error).message)) }
  }

  const openReport = async (book: Book) => {
    try {
      const doc = new DOMParser().parseFromString(await api<string>(`books/${book.id}/report`), 'text/xml')
      setReport({ book, rows: [...doc.getElementsByTagName('row')].map(r => Object.fromEntries([...r.attributes].map(a => [a.name, a.value]))) })
    } catch (e) { setMsg(because('Couldn’t open the report', (e as Error).message)) }
  }

  const importedSources = new Set((books ?? []).filter(b => b.state === 'done' && b.source).map(b => b.source))
  const dupes = report?.book.source ? [...dupeGroups(c).values()]
    .map(ids => ids.map(id => c.amps.get(id) ?? c.items.get(id) ?? c.rules.get(id)!).filter(Boolean))
    .filter(g => g.some(e => e.source === report.book.source)) : []
  const provider = asking?.provider ? PROVIDER_NAMES[asking.provider] ?? asking.provider : null

  return (
    <main className="lib books">
      <BooksHeader title="Books"><a className="btn quiet" href="#/books/ai">AI settings</a></BooksHeader>
      <p>Upload the PDFs you own. Books the app knows are imported at once; any other book can be read by an AI you set up, and you
        check its entries before they’re added. The PDFs stay on this server and are never served to anyone.</p>
      <div role="status" aria-live="polite">
        {offline && <p className="banner err">The server can’t be reached — retrying.</p>}
        {msg && <p className="banner">{msg} <button className="btn small quiet" onClick={() => setMsg(null)}>Dismiss</button></p>}
        <span className="sr-only">{live}</span>
      </div>

      <label className={`drop${over ? ' over' : ''}`}
        onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); if (!uploading) void upload(e.dataTransfer.files) }}>
        {uploading ? <span>Uploading {uploading.name}: {uploading.pct}%<progress max={100} value={uploading.pct} /></span>
          : <span><b>Drop PDF files here</b> or <u>choose files</u></span>}
        <input type="file" accept="application/pdf,.pdf" multiple aria-label="Choose PDF files" disabled={!!uploading}
          onChange={e => { void upload(e.target.files); e.target.value = '' }} />
      </label>

      <DataPack reload={reload} />

      <h2>Your books</h2>
      {books === null ? <p className="muted">Loading books…</p> : books.length === 0 ? <p className="muted">No books uploaded yet.</p> : books.map(b => (
        <div className="book" key={b.id}>
          <div>
            <div className="title">{b.name ?? b.file ?? b.id}
              {b.source && <> <span className="src" title={c.sources.get(b.source)?.name}>{b.source}</span></>}
              {b.canon === false && <> <NonCanon /></>}
            </div>
            <div className="meta">
              <span className={`state ${b.state}`}>{STATE[b.state] ?? b.state}</span>
              {b.name && b.file && <> {b.file}</>}
              {b.recipe && <> · {b.recipe === 'ai' ? 'read by AI' : `recipe ${b.recipe}`}</>}
              {b.imported && <> · {new Date(b.imported).toLocaleDateString()}</>}
              {b.state === 'done' && Object.keys(b.counts).length > 0 && <> · {counts(b.counts)}</>}
            </div>
            {b.message && b.state !== 'done' && <div className={b.state === 'failed' ? 'err' : 'muted'}>{b.message}</div>}
            {b.state === 'done' && b.message && <div className="muted">{b.message}</div>}
            {!!b.coreUnread?.length && <div className="err">Couldn’t read these core tables: {b.coreUnread.map(f => f.replace(/\.xml$/, '')).join(', ')}.
              {coreAi(b) ? ' Read them with AI, or upload a data pack.' : ' Upload a data pack with them.'}</div>}
          </div>
          <div className="row">
            {b.state === 'needs-ai' && (b.review === 'done'
              ? <button className="btn small quiet" disabled={b.busy} onClick={() => void ask(b, true)}>Extract with AI again</button>
              : <button className="btn small primary" disabled={b.busy} onClick={() => void ask(b)}>Extract with AI</button>)}
            {coreAi(b) && ['done', 'failed', 'review'].includes(b.state) && (b.review === 'done'
              ? <button className="btn small quiet" disabled={b.busy} onClick={() => void ask(b, true)}>Read the tables with AI again</button>
              : <button className="btn small primary" disabled={b.busy} onClick={() => void ask(b)}>Read the tables with AI</button>)}
            {b.review && (!b.source || coreAi(b)) && !LIVE.includes(b.state) && <a className="btn small primary" href={`#/books/${b.id}/review`}>Review</a>}
            {b.state === 'done' && <button className="btn small quiet" onClick={() => void openReport(b)}>Report</button>}
            {['done', 'failed', 'removed', 'needs-ai'].includes(b.state) && b.recipe !== 'ai' &&
              <button className="btn small quiet" disabled={b.busy} onClick={() => void act('re-import the book', () => api(`books/${b.id}/reimport`, { method: 'POST' }))}>Re-import</button>}
            {!LIVE.includes(b.state) && <button className="btn small quiet" disabled={b.busy} onClick={() => { setWithFiles(b.state === 'removed'); setRemoving(b) }}>Remove</button>}
          </div>
        </div>
      ))}

      <h2 style={{ marginTop: '1.5rem' }}>Supported books</h2>
      <p className="muted">These are read by a recipe, with no AI. Upload the PDF and its amps, spells, gear, rules and sample runners are added.</p>
      <ul className="supported">
        {supported.map(s => (
          <li key={s.id}>
            <span><b>{s.id}</b> {s.name} {!s.canon && <NonCanon />}</span>
            {importedSources.has(s.id) ? <span className="ok">Imported</span> : <span className="muted">Not yet</span>}
          </li>
        ))}
      </ul>

      <Modal open={!!removing} onClose={() => setRemoving(null)} title={`Remove ${removing?.name ?? removing?.file ?? 'this book'}?`}
        actions={<><button className="btn" onClick={() => setRemoving(null)}>Keep</button>
          <button className="btn danger" onClick={() => { const b = removing!; setRemoving(null); void act('remove the book', () => api(`books/${b.id}${withFiles ? '?files=1' : ''}`, { method: 'DELETE' })) }}>Remove book</button></>}>
        <p>Its amps, spells, gear, rules, descriptions and sample runners leave the app. Runners that use them keep working from their own copies.</p>
        <label className="check"><input type="checkbox" checked={withFiles} onChange={e => setWithFiles(e.target.checked)} />
          Also delete the PDF and its text. Without them the book can’t be re-imported until you upload it again.</label>
      </Modal>

      <Modal open={!!asking} onClose={() => setAsking(null)} title="Extract with AI"
        actions={<><button className="btn" onClick={() => setAsking(null)}>Cancel</button>
          {provider && asking?.keySet && <button className="btn primary" onClick={() => { const b = asking!.book; setAsking(null); void act('start the AI import', () => api(`books/${b.id}/ai${asking!.fresh ? '?fresh=1' : ''}`, { method: 'POST' })) }}>Send to {provider}</button>}</>}>
        {asking?.parts === undefined ? <p className="muted">Counting the parts…</p> : !provider ? (
          <p>No AI provider is chosen yet. Set one up in <a href="#/books/ai">AI settings</a>, then come back.</p>
        ) : !asking.keySet ? (
          <p>No key is saved for {provider}. Add one in <a href="#/books/ai">AI settings</a>, then come back.</p>
        ) : <>
          {asking.fresh && <p className="err">This book’s proposals are already waiting for review. Sending it again replaces them, and the decisions you made on them are lost.</p>}
          <p>This sends the book’s text to {provider}. Continue?</p>
          <p className="muted">It goes in {asking.parts} {asking.parts === 1 ? 'part' : 'parts'}, one request each, charged to your {provider} account.
            The entries it finds wait for your review before anything is added.</p>
        </>}
      </Modal>

      <Modal open={!!report} onClose={() => setReport(null)} title={`Report: ${report?.book.name ?? ''}`}>
        {report && <>
          {report.rows.length === 0 ? <p>Everything in the book matched.</p> : <>
            <p>What didn’t match what the book prints:</p>
            <div className="scroll-x"><table className="data"><tbody>
              {report.rows.map((r, i) => <tr key={i}>{Object.entries(r).map(([k, v]) => <td key={k}><span className="muted">{k}</span> {v}</td>)}</tr>)}
            </tbody></table></div>
          </>}
          {dupes.length > 0 && <>
            <h3 style={{ marginTop: '1rem' }}>Also in other books</h3>
            <div className="scroll-x"><table className="data"><tbody>
              {dupes.map((g, i) => <tr key={i}>{g.map(e => <td key={e.id}>
                <b>{'name' in e ? e.name : e.title}</b> <span className="src">{e.source} p.{e.page}</span>
                {'printedRating' in e && e.printedRating != null && <> · rating {e.printedRating}</>}
              </td>)}</tr>)}
            </tbody></table></div>
          </>}
        </>}
      </Modal>
    </main>
  )
}
