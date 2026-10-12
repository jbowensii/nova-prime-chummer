// Override files, both games' Game data (editors and the admin): Export my edits… saves the edits layer (all of it, or one
// book's entries) as an edits file in its own format (edits.xsd), each edit's own description in its <text> or
// <narrative>; Import edits… reads one and previews it (new entries, changes to the book's, conflicts with an edit already
// here, each conflict kept or taken), and only Save edits sends the chosen entries, one by one, through the edits routes
// (PUT /api/edits/<kind>/<id>, /api/sr6/edits/…), which check each as an edit made in the app.
import { useState } from 'react'
import { because } from './auth'
import { Modal } from './bits'
import { api } from './Books'
import { esc } from '../shared/xml'

export interface OverrideGame {
  /** the edits folder under the site root ("custom/edits/") and the routes' prefix ("edits") */
  dir: string; api: string
  /** the edits file's namespace and its root's prefix */
  ns: string; prefix: string
  /** entry tag → edit kind */
  tags: Record<string, string>
  /** the description element of an entry tag (an amp's <narrative>, else <text>) */
  descTag: (tag: string) => string
  /** what an imported entry leaves behind: the book's issues (and, where the edits layer can't hold them, formulas) */
  strip: string[]
  /** the catalog's entry of that kind and id: as the edits layer would write it, whether it's an edit, its description */
  current: (kind: string, id: string) => { xml: string; edited: boolean; text: string } | undefined
  books: { id: string; name: string }[]
  /** the export's file name: "chummer-edits", "sr6-edits" */
  file: string
}

type Status = 'added' | 'changed' | 'conflict' | 'same' | 'skip'
interface Row { kind: string; id: string; name: string; status: Status; fields: string[]; body: string; why?: string }
const STATUS: Record<Status, string> = { added: 'New entry', changed: 'Changes the book’s entry', conflict: 'Conflicts with your edit', same: 'Same as yours', skip: 'Left out' }

const parse = (xml: string) => {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  return doc.getElementsByTagName('parsererror').length ? null : doc
}
const kids = (el: Element) => [...el.children]

/** The edits file to save: the edits layer's entries (one book's, or all), each with its own description. */
export async function buildExport(g: OverrideGame, book: string): Promise<{ xml: string; count: number }> {
  const get = (f: string) => fetch(`./${g.dir}${f}`, { cache: 'no-cache' }).then(r => (r.ok ? r.text() : null))
  const [edits, texts] = await Promise.all([get('edits.xml'), get('texts.xml')])
  const doc = parse(edits ?? `<${g.prefix}:data xmlns:${g.prefix}="${g.ns}" kind="edits" version="1"></${g.prefix}:data>`)
  if (!doc) throw new Error('the edits file on the server can’t be read')
  const tdoc = texts ? parse(texts) : null
  const desc = new Map((tdoc ? kids(tdoc.documentElement) : []).map(t => [`${t.getAttribute('of')} ${t.getAttribute('id')}`, t.textContent ?? '']))
  let count = 0
  for (const el of kids(doc.documentElement)) {
    if (book && el.getAttribute('source') !== book) { if (el.previousSibling?.nodeType === 3) el.previousSibling.remove(); el.remove(); continue }
    count++
    const d = desc.get(`${g.tags[el.localName]} ${el.getAttribute('id')}`)
    if (!d) continue
    const tag = g.descTag(el.localName)
    let t = kids(el).find(k => k.localName === tag)
    if (!t) t = el.appendChild(doc.createElementNS(null, tag))
    t.textContent = d
  }
  return { xml: `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(doc.documentElement)}\n`, count }
}

/** What differs between the catalog's entry (its XML) and the file's: attribute names, "name", "parts", "description". */
function differs(g: OverrideGame, cur: { xml: string; text: string }, el: Element, desc: string): string[] {
  const a = parse(`<x>${cur.xml}</x>`)?.documentElement.firstElementChild
  if (!a) return ['entry']
  const names = new Set([...a.getAttributeNames(), ...el.getAttributeNames()].filter(n => n !== 'by'))
  const out = [...names].filter(n => (a.getAttribute(n) ?? '') !== (el.getAttribute(n) ?? ''))
  const xs = new XMLSerializer()
  const body = (x: Element) => kids(x).filter(k => !['name', 'title', 'text', 'narrative', 'issue', ...g.strip].includes(k.localName)).map(k => xs.serializeToString(k)).join('')
  const name = (x: Element) => kids(x).find(k => k.localName === 'name' || k.localName === 'title')?.textContent ?? ''
  if (name(a) !== name(el)) out.push('name')
  if (body(a) !== body(el)) out.push('parts')
  if (desc.trim() && desc.trim() !== cur.text.trim()) out.push('description')
  return out
}

/** The file's entries, each with what saving it would do, or why the file can't be read. */
export function readImport(g: OverrideGame, xml: string): { rows: Row[] } | { error: string } {
  const doc = parse(xml), root = doc?.documentElement
  if (!root || root.localName !== 'data' || root.namespaceURI !== g.ns || root.getAttribute('kind') !== 'edits')
    return { error: 'it isn’t an edits file of this game (an exported override file, or the edits layer’s edits.xml)' }
  const rows = kids(root).map((el): Row => {
    const kind = g.tags[el.localName], id = el.getAttribute('id') ?? ''
    const name = kids(el).find(k => k.localName === 'name' || k.localName === 'title')?.textContent ?? id
    if (!kind || !id) return { kind: kind ?? el.localName, id, name, status: 'skip', fields: [], body: '', why: `<${el.localName}> isn’t an entry an edit can hold` }
    const e = el.cloneNode(true) as Element, tag = g.descTag(el.localName)
    e.removeAttribute('by')
    for (const k of kids(e)) if (g.strip.includes(k.localName)) k.remove()
    const t = kids(e).find(k => k.localName === tag), desc = t?.textContent ?? ''
    if (t) t.textContent = ''
    const body = `<edit>${new XMLSerializer().serializeToString(e)}<description>${esc(desc)}</description></edit>`
    const cur = g.current(kind, id)
    if (!cur) return { kind, id, name, status: 'added', fields: [], body }
    const fields = differs(g, cur, e, desc)
    return { kind, id, name, status: !fields.length ? 'same' : cur.edited ? 'conflict' : 'changed', fields, body }
  })
  return { rows }
}

export function OverrideFiles({ g, reload }: { g: OverrideGame; reload: () => Promise<void> }) {
  const [exporting, setExporting] = useState(false), [book, setBook] = useState('')
  const [file, setFile] = useState<{ name: string; rows: Row[] } | null>(null)
  const [take, setTake] = useState<Set<string>>(new Set()) // conflicts taken from the file
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(''), [err, setErr] = useState(''), [refused, setRefused] = useState<string[]>([])
  const key = (r: Row) => `${r.kind} ${r.id}`

  async function save() {
    setBusy(true); setErr('')
    try {
      const { xml, count } = await buildExport(g, book)
      if (!count) { setErr(book ? 'No edits of that book to export.' : 'No edits to export yet.'); return }
      const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }))
      Object.assign(document.createElement('a'), { href: url, download: `${g.file}${book ? `-${book.toLowerCase()}` : ''}.xml` }).click()
      setTimeout(() => URL.revokeObjectURL(url), 0)
      setExporting(false); setMsg(`Exported ${count === 1 ? '1 edit' : `${count} edits`}.`)
    } catch (x) { setErr(because('Couldn’t export', (x as Error).message)) } finally { setBusy(false) }
  }
  async function open(f: File) {
    setMsg(''); setErr(''); setRefused([])
    if (f.size > 4 * 1024 * 1024) return setErr(`${f.name} is larger than 4 MB: it isn’t an edits file.`)
    const r = readImport(g, await f.text())
    if ('error' in r) return setErr(`Can’t import ${f.name}: ${r.error}.`)
    setTake(new Set()); setFile({ name: f.name, rows: r.rows })
  }
  const chosen = file?.rows.filter(r => r.status === 'added' || r.status === 'changed' || (r.status === 'conflict' && take.has(key(r)))) ?? []
  async function apply() {
    setBusy(true)
    const bad: string[] = []
    for (const r of chosen) {
      try { await api(`${g.api}/${r.kind}/${encodeURIComponent(r.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/xml' }, body: r.body }) }
      catch (x) { bad.push(`${r.name}: ${(x as Error).message}`) }
    }
    await reload()
    const done = chosen.length - bad.length
    setMsg(`Saved ${done === 1 ? '1 edit' : `${done} edits`} from ${file!.name}.`); setRefused(bad)
    setFile(null); setBusy(false)
  }

  const count = (s: Status) => file?.rows.filter(r => r.status === s).length ?? 0
  return <>
    <div className="row overrides">
      <button type="button" className="btn small" onClick={() => { setMsg(''); setErr(''); setExporting(true) }}>Export my edits…</button>
      <label className="btn small file">Import edits…
        <input type="file" accept=".xml,application/xml,text/xml" aria-label="Import edits" disabled={busy}
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void open(f) }} /></label>
      <span className="muted">An override file: your edits as a file, to keep or to load on another server.</span>
    </div>
    <div role="status" aria-live="polite">{msg && <p className="ok">{msg}</p>}</div>
    {refused.length > 0 && <div className="warn"><p>Not saved:</p><ul>{refused.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
    {err && !exporting && <p className="err" role="alert">{err}</p>}

    <Modal open={exporting} onClose={() => setExporting(false)} title="Export my edits"
      actions={<><button className="btn" onClick={() => setExporting(false)}>Cancel</button>
        <button className="btn primary" disabled={busy} onClick={() => void save()}>Export</button></>}>
      <p>An edits file with every edit (or one book’s), each with its own description. Import edits loads it here or on another server.</p>
      <label className="inline">Book <select value={book} onChange={e => setBook(e.target.value)}>
        <option value="">All books</option>{g.books.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      {err && <p className="err" role="alert">{err}</p>}
    </Modal>

    <Modal open={!!file} onClose={() => setFile(null)} title={`Import ${file?.name ?? ''}`}
      actions={<><button className="btn" onClick={() => setFile(null)}>Cancel</button>
        <button className="btn primary" disabled={busy || !chosen.length} onClick={() => void apply()}>
          {chosen.length ? `Save ${chosen.length === 1 ? '1 edit' : `${chosen.length} edits`}` : 'Nothing to save'}</button></>}>
      {file && <div className="stack">
        <p>{[[count('added'), 'new'], [count('changed'), 'changing the book'], [count('conflict'), 'conflicting with your edits'],
          [count('same'), 'the same as yours'], [count('skip'), 'left out']].filter(([n]) => n).map(([n, w]) => `${n} ${w}`).join(', ') || 'No entries'}.
          Nothing is saved until Save edits; each entry is checked as an edit made here.</p>
        <div className="scroll-x"><table className="data override-preview"><thead><tr><th>Entry</th><th>What it does</th><th>Keep</th></tr></thead>
          <tbody>{file.rows.map(r => <tr key={key(r)} className={r.status}>
            <td><b>{r.name}</b> <span className="src">{r.kind} · {r.id}</span></td>
            <td className={r.status === 'conflict' ? 'warn' : r.status === 'skip' ? 'muted' : undefined}>{STATUS[r.status]}{r.fields.length ? `: ${r.fields.join(', ')}` : ''}{r.why ? `: ${r.why}` : ''}</td>
            <td>{r.status === 'conflict' && <select aria-label={`${r.name}: keep`} value={take.has(key(r)) ? 'theirs' : 'mine'}
              onChange={e => setTake(t => { const n = new Set(t); if (e.target.value === 'theirs') n.add(key(r)); else n.delete(key(r)); return n })}>
              <option value="mine">Keep mine</option><option value="theirs">Take theirs</option></select>}</td>
          </tr>)}</tbody></table></div>
      </div>}
    </Modal>
  </>
}
