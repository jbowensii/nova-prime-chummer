// Game data's catalog browser (both games, 0.9.1): a Book dropdown (all books, or one imported source or compendium),
// then the kinds with their counts (a list beside the entries; tabs across the top on a phone), the chosen kind's
// sub-categories when it has more than one, and that kind's entries. It opens on the kind last looked at in this browser,
// else the game's main kind (startKind). A search box looks across every kind; its results
// are grouped by kind. Needs attention shows only the entries with an issue (a value the book leaves out or the importer
// couldn't read, src/engine/formula.ts), each with its badge. Each game maps its catalog to BrowseKind rows
// (src/ui/tabs/Data.tsx, src/sr6/ui/Data.tsx).
import { useState, type ReactNode } from 'react'
import type { Issue } from '../engine/formula'
import type { CardEffect } from './EntryHover'
import { IssueBadges } from './Issues'
import { Prose } from './Prose'

export interface BrowseRow {
  key: string; name: string; source: string; page: number
  /** the sub-category inside its kind ("Handguns", "Cyberware: eyeware") */
  group?: string
  /** the printed values, one line */
  details?: string
  /** its description: searched, and shown under Description */
  text?: string
  /** other words a search finds it by (its category with its name, the names it is printed under) */
  search?: string
  /** after the source: Edited, House… */
  marks?: ReactNode
  /** its Edit button or link */
  action?: ReactNode
  /** what needs attention: shown as badges, and Needs attention lists only these rows */
  issues?: Issue[]
  /** what it does on a runner (SR6: its effects, applied or shown only) */
  effects?: CardEffect[]
}
export interface BrowseKind { id: string; label: string; rows: BrowseRow[] }
export interface Book { id: string; name: string }

const LIMIT = 200 // rows a table shows before "Show all" (a real book's gear or rules run to hundreds)
const OTHER = 'Other'
const cap = (s: string) => s ? s[0].toUpperCase() + s.slice(1) : s
// each row's search text lower-cased once (descriptions run to megabytes: not again on every keystroke)
const hays = new WeakMap<BrowseRow, string>()
const hay = (r: BrowseRow) => {
  let h = hays.get(r)
  if (h === undefined) hays.set(r, h = `${r.name} ${r.search ?? ''} ${r.details ?? ''} ${r.text ?? ''}`.toLowerCase())
  return h
}

/** "Book": All books, then each source that has entries. */
export function BookSelect({ books, value, onChange }: { books: Book[]; value: string; onChange: (id: string) => void }) {
  return (
    <label className="inline book-pick">Book
      <select value={value} onChange={e => onChange(e.target.value)} aria-label="Book">
        <option value="">All books</option>{books.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
    </label>
  )
}

function Rows({ rows, className }: { rows: BrowseRow[]; className?: string }) {
  const [all, setAll] = useState(false)
  const shown = all ? rows : rows.slice(0, LIMIT)
  return (
    <div className="scroll-x">
      <table className={`data browse ${className ?? ''}`.trim()}><thead><tr><th>Entry</th><th>Values</th><th /></tr></thead>
        <tbody>{shown.map(r => (
          <tr key={r.key}><td><b>{r.name}</b> <span className="srcline"><span className="src">{r.source} p.{r.page}</span>{r.marks}<IssueBadges issues={r.issues} source={r.source} /></span></td>
            <td><span className="muted">{r.details}</span>
              {!!r.effects?.length && <div className="muted small">Effects: {r.effects.map(x => `${x.text}${x.state === 'applied' ? '' : ` (${x.state})`}`).join(' · ')}</div>}
              {r.text && <details className="desc"><summary>Description</summary><Prose text={r.text} /></details>}</td><td className="num">{r.action}</td></tr>
        ))}</tbody></table>
      {shown.length < rows.length && <p className="muted">Showing {shown.length} of {rows.length}. Search to narrow it, or{' '}
        <button type="button" className="btn small quiet" onClick={() => setAll(true)}>Show all {rows.length}</button></p>}
    </div>
  )
}

/** The kind the browser opens on: the one this browser last looked at (`remember`, its storage key), else `main`, else the
 *  first with entries. Storage that's blocked or holds a kind that's gone falls back the same way. */
export function startKind(kinds: BrowseKind[], main?: string, remember?: string): string | undefined {
  let last: string | null = null
  try { last = remember ? localStorage.getItem(remember) : null } catch { /* private mode, blocked: not remembered */ }
  return [last, main].find(id => id && kinds.some(k => k.id === id)) ?? kinds.find(k => k.rows.length)?.id ?? kinds[0]?.id
}

export function CatalogBrowser({ kinds, books, tableClass, main, remember }: {
  kinds: BrowseKind[]; books: Book[]; tableClass?: string
  /** the kind it opens on when none is remembered (Game data: Amps, Qualities) */
  main?: string
  /** the browser storage key that remembers the last kind looked at (per game) */
  remember?: string
}) {
  const [book, setBook] = useState('')
  const [q, setQ] = useState('')
  const [attention, setAttention] = useState(false)
  const bookRows = kinds.map(k => ({ ...k, rows: book ? k.rows.filter(r => r.source === book) : k.rows }))
  const needing = bookRows.reduce((n, k) => n + k.rows.filter(r => r.issues?.length).length, 0)
  const inBook = attention ? bookRows.map(k => ({ ...k, rows: k.rows.filter(r => r.issues?.length) })) : bookRows
  const [kindId, setKindState] = useState(() => startKind(kinds, main, remember))
  const setKind = (id: string) => {
    setKindState(id)
    try { if (remember) localStorage.setItem(remember, id) } catch { /* not remembered */ }
  }
  const [group, setGroup] = useState('')
  const t = q.trim().toLowerCase()
  const kind = inBook.find(k => k.id === kindId) ?? inBook[0]
  const groups = kind ? [...new Set(kind.rows.map(r => r.group || OTHER))].sort((a, b) => a === OTHER ? 1 : b === OTHER ? -1 : a.localeCompare(b)) : []
  const rows = kind?.rows.filter(r => !group || (r.group || OTHER) === group) ?? []
  const hits = t ? inBook.map(k => ({ ...k, rows: k.rows.filter(r => hay(r).includes(t)) }))
    .filter(k => k.rows.length) : []
  const pick = (id: string) => { setKind(id); setGroup('') }

  return (
    <section className="browser" aria-label="Catalog">
      <div className="row browse-top">
        <BookSelect books={books} value={book} onChange={b => { setBook(b); setGroup('') }} />
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search everything" aria-label="Search the catalog" />
        <button type="button" className="attention" aria-pressed={attention} disabled={!needing && !attention}
          title="Entries whose book leaves a value out, or prints one the importer couldn’t read"
          onClick={() => {
            const on = !attention, first = bookRows.find(k => k.rows.some(r => r.issues?.length))
            setAttention(on); setGroup('')
            if (on && first && !bookRows.find(k => k.id === kindId)?.rows.some(r => r.issues?.length)) setKind(first.id)
          }}>Needs attention <span className="n">{needing}</span></button>
      </div>
      {t ? (
        <div className="browse-hits">
          {hits.length === 0 && <p className="muted">Nothing matches “{q}”.</p>}
          {hits.map(k => <section key={k.id} aria-label={k.label}><h3>{k.label} <span className="muted">({k.rows.length})</span></h3>
            <Rows key={`${k.id} ${book} ${t}`} rows={k.rows} className={tableClass} /></section>)}
        </div>
      ) : kind && (
        <div className="browse-body">
          <div className="kinds" role="group" aria-label="Kind">
            {inBook.map(k => <button key={k.id} type="button" aria-pressed={k.id === kind.id} className={k.rows.length ? undefined : 'none'}
              onClick={() => pick(k.id)}>{k.label} <span className="n">{k.rows.length}</span></button>)}
          </div>
          <div className="browse-main">
            <h3>{kind.label}</h3>
            {groups.length > 1 && <div className="groups" role="group" aria-label="Category">
              <button type="button" aria-pressed={!group} onClick={() => setGroup('')}>All <span className="n">{kind.rows.length}</span></button>
              {groups.map(g => <button key={g} type="button" aria-pressed={g === group} onClick={() => setGroup(g)}>
                {cap(g)} <span className="n">{kind.rows.filter(r => (r.group || OTHER) === g).length}</span></button>)}
            </div>}
            {rows.length === 0 ? <p className="muted">No {kind.label.toLowerCase()}{attention ? ' needs attention' : ''}{book ? ' in this book' : attention ? '' : ' yet'}.</p>
              : <Rows key={`${kind.id} ${book} ${group}`} rows={rows} className={tableClass} />}
          </div>
        </div>
      )}
    </section>
  )
}
