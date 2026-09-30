// Rules (admin and editors, the GMs): the table rules they switch on for their players (TableRules.tsx), then the rules
// reference: the imported quick-reference sheets (rules kind), text from the private texts file.
import { useMemo, useState } from 'react'
import { isCanon } from '../engine'
import type { Catalog } from '../model/types'
import { Brand, NonCanon } from './bits'
import { EditButton, EditedMark, useOpenEdit } from './EditEntry'
import { AccountMenu, isAdmin, useMe } from './auth'
import { SettingsButton } from './settings'
import { TableRulesManager } from './TableRules'
import { AskButton } from './AskRules'

const SHEETS: [string, string][] = [['base', 'Base rules'], ['magic', 'Magic'], ['matrix', 'Matrix'], ['vehicles', 'Vehicles']]

export function RulesScreen({ c }: { c: Catalog }) {
  const [q, setQ] = useState('')
  const [sheet, setSheet] = useState('')
  const openEdit = useOpenEdit()
  const admin = isAdmin(useMe())
  const rules = [...c.rules.values()]
  const hasText = rules.some(r => r.text)
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return rules.filter(r => (!sheet || r.sheet === sheet) && (!t || `${r.title} ${r.section} ${r.text}`.toLowerCase().includes(t)))
  }, [rules, q, sheet])
  // the four quick-reference sheets first, then any other sheet an import brings (the Conversion Guide’s technomancers)
  const sheets: [string, string][] = [...SHEETS, ...[...new Set(rules.map(r => r.sheet))].filter(x => !SHEETS.some(([id]) => id === x))
    .map(x => [x, x[0].toUpperCase() + x.slice(1)] as [string, string])]
  const sources = [...new Set(rules.map(r => r.source))].map(s => c.sources.get(s)).filter(Boolean)

  return (
    <main className="lib rules">
      <header>
        <div style={{ flex: 1 }}><Brand /><h1>Rules</h1></div>
        <div className="row">{openEdit && <button className="btn quiet" onClick={() => openEdit({ kind: 'rules' })}>Add a rule</button>}
          <a className="btn quiet" href="#/">Your runners</a><AskButton /><SettingsButton /><AccountMenu /></div>
      </header>
      <TableRulesManager c={c} />
      <h2>Rules reference</h2>
      {rules.length === 0 && <p className="banner">No rules yet. {admin ? <>Upload the quick-reference sheets on the <a href="#/books">Books page</a>.</> : 'The admin hasn’t uploaded the quick-reference sheets yet.'}</p>}
      <p className="muted">
        {sources.length > 0 && <>From {sources.map(s => `${s!.name} (${s!.publisher})`).join('; ')}.</>}
        {' '}{rules.length > 0 && !isCanon(c, rules[0]) && <NonCanon />} Page numbers and full rules are in the core rulebook.
      </p>
      {!hasText && rules.length > 0 && <p className="banner" role="status">
        Only titles are shown: the rules text isn’t installed. {admin ? <>Re-import the quick-reference sheets on the <a href="#/books">Books page</a>.</> : 'Ask the admin to import the quick-reference sheets again.'}</p>}
      <div className="row" style={{ margin: '0.8rem 0' }}>
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search the rules" aria-label="Search the rules" style={{ flex: 1 }} />
        <select value={sheet} onChange={e => setSheet(e.target.value)} aria-label="Sheet">
          <option value="">All sheets</option>{sheets.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
      </div>
      {shown.length === 0 && q && <p className="muted">Nothing matches “{q}”.</p>}
      {sheets.filter(([id]) => shown.some(r => r.sheet === id)).map(([id, name]) => (
        <section key={id}>
          <h2>{name}</h2>
          <dl className="rule-list">
            {shown.filter(r => r.sheet === id).map(r => (
              <div key={r.id} id={r.id}>
                <dt>{r.title} <span className="muted">{r.section}</span> {r.edited && <EditedMark />} <EditButton kind="rules" id={r.id} name={r.title} /></dt>
                {r.text && <dd>{r.text}</dd>}
              </div>
            ))}
          </dl>
        </section>
      ))}
    </main>
  )
}
