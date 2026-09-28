// Rules reference: the quick-reference sheets (rules.xml), text from the private texts file.
import { useMemo, useState } from 'react'
import { isCanon } from '../engine'
import type { Catalog } from '../model/types'
import { NonCanon } from './bits'
import { SettingsButton } from './settings'

const SHEETS: [string, string][] = [['base', 'Base rules'], ['magic', 'Magic'], ['matrix', 'Matrix'], ['vehicles', 'Vehicles']]

export function RulesScreen({ c }: { c: Catalog }) {
  const [q, setQ] = useState('')
  const [sheet, setSheet] = useState('')
  const rules = [...c.rules.values()]
  const hasText = rules.some(r => r.text)
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return rules.filter(r => (!sheet || r.sheet === sheet) && (!t || `${r.title} ${r.section} ${r.text}`.toLowerCase().includes(t)))
  }, [rules, q, sheet])
  const sources = [...new Set(rules.map(r => r.source))].map(s => c.sources.get(s)).filter(Boolean)

  return (
    <main className="lib rules">
      <header>
        <div style={{ flex: 1 }}><a className="brand" href="#/">Chummer <b>Anarchy</b> 2.0</a><h1>Rules reference</h1></div>
        <div className="row"><a className="btn quiet" href="#/">Your runners</a><SettingsButton /></div>
      </header>
      <p className="muted">
        From {sources.map(s => `${s!.name} (${s!.publisher})`).join('; ') || 'no rules data'}.
        {' '}{rules.length > 0 && !isCanon(c, rules[0]) && <NonCanon />} Page numbers and full rules are in the core rulebook.
      </p>
      {!hasText && rules.length > 0 && <p className="banner" role="status">
        Only titles are shown: the rules text is private and isn’t installed. Put <code>texts/qref.xml</code> in the custom folder and reload.</p>}
      <div className="row" style={{ margin: '0.8rem 0' }}>
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search the rules" aria-label="Search the rules" style={{ flex: 1 }} />
        <select value={sheet} onChange={e => setSheet(e.target.value)} aria-label="Sheet">
          <option value="">All sheets</option>{SHEETS.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
      </div>
      {shown.length === 0 && <p className="muted">Nothing matches “{q}”.</p>}
      {SHEETS.filter(([id]) => shown.some(r => r.sheet === id)).map(([id, name]) => (
        <section key={id}>
          <h2>{name}</h2>
          <dl className="rule-list">
            {shown.filter(r => r.sheet === id).map(r => (
              <div key={r.id} id={r.id}>
                <dt>{r.title} <span className="muted">{r.section}</span></dt>
                {r.text && <dd>{r.text}</dd>}
              </div>
            ))}
          </dl>
        </section>
      ))}
    </main>
  )
}
