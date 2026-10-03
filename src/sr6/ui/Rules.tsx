// SR6 Rules (everyone): the core rulebook's rule sections (the rules kind), by chapter in book order, each section under
// its parent, with its text from the private texts file. Searchable by title and text. No SR6 table rules in S1.
import { useMemo, useState } from 'react'
import { isAdmin, useMe } from '../../ui/auth'
import { PageHeader } from '../../ui/nav'
import type { Sr6Catalog, Sr6Entry } from '../model/types'

/** The rules in reading order: chapters as the book has them, each section followed by its subsections. */
function ordered(rules: Sr6Entry[]) {
  const byPage = [...rules].sort((a, b) => a.page - b.page)
  const ids = new Set(rules.map(r => r.id)), out: Sr6Entry[] = [], kids = new Map<string, Sr6Entry[]>()
  for (const r of byPage) if (r.attrs.parent && ids.has(r.attrs.parent)) kids.set(r.attrs.parent, [...kids.get(r.attrs.parent) ?? [], r])
  const walk = (r: Sr6Entry) => { out.push(r); for (const k of kids.get(r.id) ?? []) walk(k) }
  for (const r of byPage) if (!r.attrs.parent || !ids.has(r.attrs.parent)) walk(r)
  return out
}

export function Sr6Rules({ c }: { c: Sr6Catalog }) {
  const [q, setQ] = useState('')
  const [chapter, setChapter] = useState('')
  const admin = isAdmin(useMe())
  const rules = useMemo(() => ordered([...c.entries.rules.values()]), [c])
  const chapters = [...new Set(rules.map(r => r.attrs.chapter ?? ''))]
  const t = q.trim().toLowerCase()
  const shown = rules.filter(r => (!chapter || r.attrs.chapter === chapter) && (!t || `${r.name} ${r.text}`.toLowerCase().includes(t)))

  return (
    <main className="lib rules sr6-rules">
      <PageHeader title="Rules" />
      {rules.length === 0 ? <p className="banner">No SR6 rules yet. {admin
        ? <>Upload the core rulebook on the <a href="#/sr6/books">Books page</a>.</> : 'The admin hasn’t imported the core rulebook yet.'}</p> : <>
        {!rules.some(r => r.text) && <p className="banner" role="status">Only titles are shown: the rules text isn’t installed. {admin
          ? <>Re-import the core rulebook on the <a href="#/sr6/books">Books page</a>.</> : 'Ask the admin to import the core rulebook again.'}</p>}
        <div className="row" style={{ margin: '0.8rem 0' }}>
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search the rules" aria-label="Search the rules" style={{ flex: 1 }} />
          <select value={chapter} onChange={e => setChapter(e.target.value)} aria-label="Chapter">
            <option value="">All chapters</option>{chapters.map(ch => <option key={ch} value={ch}>{ch}</option>)}
          </select>
        </div>
        {shown.length === 0 && <p className="muted">Nothing matches “{q}”.</p>}
        {chapters.filter(ch => shown.some(r => r.attrs.chapter === ch)).map(ch => (
          <section key={ch}>
            <h2>{ch}</h2>
            <dl className="rule-list">
              {shown.filter(r => r.attrs.chapter === ch).map(r => (
                <div key={r.id} id={r.id} className={`lvl${r.attrs.level ?? 1}`}>
                  <dt>{r.name} <span className="muted">{r.source} p.{r.page}</span></dt>
                  {r.text && <dd>{r.text}</dd>}
                </div>
              ))}
            </dl>
          </section>
        ))}
      </>}
    </main>
  )
}
