// SR6 Rules (everyone): the core rulebook's rule sections (the rules kind), by chapter in book order, each section under
// its parent, with its text from the private texts file. Searchable by title and text. The page is a table of contents; a
// title opens the rule in a drawer at its own address (#/sr6/rules/<id>). The creation rules are on Table setup (Creation.tsx).
// Above the contents, SR6’s AI search (AskSearch, the rules only): its finds link to their rules.
import { useMemo, useState } from 'react'
import { isAdmin, useMe } from '../../ui/auth'
import { AskSearch } from '../../ui/AskRules'
import { Modal } from '../../ui/bits'
import { BookSelect } from '../../ui/CatalogBrowser'
import { PageHeader } from '../../ui/nav'
import { Prose } from '../../ui/Prose'
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

export function Sr6Rules({ c, open }: { c: Sr6Catalog; open?: string }) {
  const [q, setQ] = useState('')
  const [chapter, setChapter] = useState('')
  const [book, setBook] = useState('')
  const admin = isAdmin(useMe())
  const rules = useMemo(() => ordered([...c.entries.rules.values()]), [c])
  const books = [...new Set(rules.map(r => r.source))].map(id => ({ id, name: c.sources.get(id)?.name ?? id }))
  const inBook = book ? rules.filter(r => r.source === book) : rules
  const chapters = [...new Set(inBook.map(r => r.attrs.chapter ?? ''))]
  const t = q.trim().toLowerCase()
  const rule = open ? c.entries.rules.get(open) : undefined
  const link = (r: Sr6Entry) => <a href={`#/sr6/rules/${encodeURIComponent(r.id)}`}>{r.name}</a>
  const shown = inBook.filter(r => (!chapter || r.attrs.chapter === chapter) && (!t || `${r.name} ${r.text}`.toLowerCase().includes(t)))

  return (
    <main className="lib rules sr6-rules">
      <PageHeader title="Rules" />
      {rules.length === 0 ? <p className="banner">No SR6 rules yet. {admin
        ? <>Upload the core rulebook on the <a href="#/sr6/books">Books page</a>.</> : 'The admin hasn’t imported the core rulebook yet.'}</p> : <>
        {!rules.some(r => r.text) && <p className="banner" role="status">Only titles are shown: the rules text isn’t installed. {admin
          ? <>Re-import the core rulebook on the <a href="#/sr6/books">Books page</a>.</> : 'Ask the admin to import the core rulebook again.'}</p>}
        <AskSearch game="sr6" scope="rules" label="Search the rules with AI" placeholder="Search the rules in plain words, e.g. what does cover give me?"
          link={s => s.kind === 'rule' && s.id && c.entries.rules.has(s.id) ? link(c.entries.rules.get(s.id)!) : null} />
        <div className="row browse-top">
          <BookSelect books={books} value={book} onChange={b => { setBook(b); setChapter('') }} />
          <select value={chapter} onChange={e => setChapter(e.target.value)} aria-label="Chapter">
            <option value="">All chapters</option>{chapters.map(ch => <option key={ch} value={ch}>{ch}</option>)}
          </select>
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search the rules" aria-label="Search the rules" />
        </div>
        {shown.length === 0 && <p className="muted">{q ? `Nothing matches “${q}”.` : 'No rules in that chapter.'}</p>}
        {chapters.filter(ch => shown.some(r => r.attrs.chapter === ch)).map(ch => (
          <section key={ch}>
            <h2>{ch}</h2>
            <ul className="rule-toc">
              {shown.filter(r => r.attrs.chapter === ch).map(r => (
                <li key={r.id} className={`lvl${r.attrs.level ?? 1}`}>{link(r)} <span className="muted">{r.source} p.{r.page}</span></li>
              ))}
            </ul>
          </section>
        ))}
      </>}
      <Modal open={!!rule} onClose={() => { location.hash = '#/sr6/rules' }} title={rule?.name ?? ''} className="drawer rule-drawer">
        {rule && <>
          <p className="muted">{[rule.attrs.chapter, `${rule.source} p.${rule.page}`].filter(Boolean).join(' · ')}</p>
          {rule.text ? <Prose text={rule.text} /> : <p className="muted">The rules text isn’t installed.</p>}
          {rules.some(k => k.attrs.parent === rule.id) && <ul className="rule-toc">{rules.filter(k => k.attrs.parent === rule.id).map(k => <li key={k.id}>{link(k)}</li>)}</ul>}
        </>}
      </Modal>
    </main>
  )
}
