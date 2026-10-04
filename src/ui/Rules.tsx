// Rules (admin and editors, the GMs): the rules reference, the imported quick-reference sheets (rules kind), text from the
// private texts file. The table rules they switch on for their players are on Table setup (TableRules.tsx).
import { PageHeader } from './nav'
import { IconButton } from './icons'
import { useMemo, useState } from 'react'
import { isCanon } from '../engine'
import type { Catalog } from '../model/types'
import { NonCanon } from './bits'
import { BookSelect } from './CatalogBrowser'
import { Prose } from './Prose'
import { EditButton, EditedMark, useOpenEdit } from './EditEntry'
import { isAdmin, useMe } from './auth'

const SHEETS: [string, string][] = [['base', 'Base rules'], ['magic', 'Magic'], ['matrix', 'Matrix'], ['vehicles', 'Vehicles']]

export function RulesScreen({ c }: { c: Catalog }) {
  const [q, setQ] = useState('')
  const [sheet, setSheet] = useState('')
  const [book, setBook] = useState('')
  const openEdit = useOpenEdit()
  const admin = isAdmin(useMe())
  const rules = [...c.rules.values()]
  const hasText = rules.some(r => r.text)
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return rules.filter(r => (!book || r.source === book) && (!sheet || r.sheet === sheet) && (!t || `${r.title} ${r.section} ${r.text}`.toLowerCase().includes(t)))
  }, [rules, q, sheet, book])
  // the four quick-reference sheets first, then any other sheet an import brings (the Conversion Guide’s technomancers)
  const sheets: [string, string][] = [...SHEETS, ...[...new Set(rules.map(r => r.sheet))].filter(x => !SHEETS.some(([id]) => id === x))
    .map(x => [x, x[0].toUpperCase() + x.slice(1)] as [string, string])]
  const sources = [...new Set(rules.map(r => r.source))].map(s => c.sources.get(s)).filter(Boolean)

  return (
    <main className="lib rules">
      <PageHeader title="Rules">{openEdit && <IconButton icon="plus" label="Add a rule" onClick={() => openEdit({ kind: 'rules' })} />}</PageHeader>
      <p className="muted">The table’s switches and house rules are on <a href="#/table">Table setup</a>.</p>
      <h2>Rules reference</h2>
      {rules.length === 0 && <p className="banner">No rules yet. {admin ? <>Upload the quick-reference sheets on the <a href="#/books">Books page</a>.</> : 'The admin hasn’t uploaded the quick-reference sheets yet.'}</p>}
      <p className="muted">
        {sources.length > 0 && <>From {sources.map(s => `${s!.name} (${s!.publisher})`).join('; ')}.</>}
        {' '}{rules.length > 0 && !isCanon(c, rules[0]) && <NonCanon />} Page numbers and full rules are in the core rulebook.
      </p>
      {!hasText && rules.length > 0 && <p className="banner" role="status">
        Only titles are shown: the rules text isn’t installed. {admin ? <>Re-import the quick-reference sheets on the <a href="#/books">Books page</a>.</> : 'Ask the admin to import the quick-reference sheets again.'}</p>}
      <div className="row browse-top">
        <BookSelect books={sources.map(s => ({ id: s!.id, name: s!.name }))} value={book} onChange={setBook} />
        <select value={sheet} onChange={e => setSheet(e.target.value)} aria-label="Sheet">
          <option value="">All sheets</option>{sheets.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search the rules" aria-label="Search the rules" />
      </div>
      {shown.length === 0 && rules.length > 0 && <p className="muted">{q ? `Nothing matches “${q}”.` : 'No rules from this book on that sheet.'}</p>}
      {sheets.filter(([id]) => shown.some(r => r.sheet === id)).map(([id, name]) => (
        <section key={id}>
          <h2>{name}</h2>
          <dl className="rule-list">
            {shown.filter(r => r.sheet === id).map(r => (
              <div key={r.id} id={r.id}>
                <dt>{r.title} <span className="muted">{r.section}</span> {r.edited && <EditedMark />} <EditButton kind="rules" id={r.id} name={r.title} /></dt>
                {r.text && <dd><Prose text={r.text} /></dd>}
              </div>
            ))}
          </dl>
        </section>
      ))}
    </main>
  )
}
