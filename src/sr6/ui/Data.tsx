// SR6 Game data (everyone): the sources, entries per kind, a browser of every catalog entry, the catalog edits (editors:
// each entry's Edit button opens Sr6EditEntry; a compendium entry's is a link to it in its compendium, for its owner only), a pointer to the creation rules (on the Rules page) and the files that didn't load. Kept apart from Anarchy's page, which is
// bound to its own catalog type.
import { useState } from 'react'
import { canEdit, isAdmin, useMe } from '../../ui/auth'
import { NonCanon } from '../../ui/bits'
import { EditedMark, STATE_TEXT } from '../../ui/EditEntry'
import { PageHeader } from '../../ui/nav'
import { useRepo } from '../../ui/repo'
import type { Sr6Data as Sr6DataView } from '../engine/data'
import { entryKey } from '../engine/load'
import { SR6_KINDS, type Sr6Catalog, type Sr6Entry, type Sr6Kind } from '../model/types'
import { Sr6EditEntry } from './EditEntry'
import { Sr6ExportBooksPanel } from './Foundry'

const KINDS = Object.keys(SR6_KINDS) as Sr6Kind[]
const LIMIT = 200 // rows the browser shows before "Show all" (a real book's gear or rules run to hundreds)
/** "category zappers · dv 3P · cost 320": an entry's printed values */
const details = (e: Sr6Entry) => Object.entries(e.attrs).map(([k, v]) => `${k} ${v}`).join(' · ')

export function Sr6Data({ c, data, reload }: { c: Sr6Catalog; data: Sr6DataView; reload: () => Promise<void> }) {
  const me = useMe(), server = useRepo().mode === 'server'
  const editor = canEdit(me) && server
  const all = KINDS.flatMap(k => [...c.entries[k].values()])
  const [kind, setKind] = useState<Sr6Kind>(() => KINDS.find(k => c.entries[k].size) ?? 'weapons')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<{ kind: Sr6Kind; id: string } | null>(null)
  const [msg, setMsg] = useState('')
  const [full, setFull] = useState('') // the kind and search "Show all" was pressed for
  const t = q.trim().toLowerCase(), view = `${kind}
${t}`
  const shown = [...c.entries[kind].values()].filter(e => !t || `${e.name} ${e.text}`.toLowerCase().includes(t))
  const rows = full === view ? shown : shown.slice(0, LIMIT)
  const perSource = (id: string) => all.filter(e => e.source === id).length
  const edits = all.filter(e => e.edited)
  const compOf = (e: Sr6Entry) => c.sources.get(e.source)?.compendium
  // a compendium's entry is edited in its compendium (the edits layer loads before it, so an edit would never show)
  const editButton = (e: Sr6Entry) => editor && (compOf(e) ? compOf(e)!.owner === me?.username
    && <a className="btn small quiet" aria-label={`Edit ${e.name}`} href={`#/sr6/compendiums/${compOf(e)!.id}/${encodeURIComponent(e.id)}`}>Edit</a>
    : <button type="button" className="btn small quiet" aria-label={`Edit ${e.name}`} onClick={() => { setMsg(''); setEditing({ kind: e.kind, id: e.id }) }}>Edit</button>)

  return (
    <main className="lib">
      <PageHeader title="Game data" />
      {all.length === 0 && <p className="banner">No SR6 data yet. {isAdmin(me)
        ? <>Upload the core rulebook on the <a href="#/sr6/books">Books page</a>.</> : 'The admin hasn’t imported the core rulebook yet.'}</p>}
      <p>The Shadowrun 6 catalog, kept apart from Anarchy’s. Books add to it; descriptions are private, one file per source in
        <code> custom/sr6/texts/</code>, never part of the app itself.</p>
      <h2>Sources</h2>
      <div className="scroll-x"><table className="data sr6-sources"><thead><tr><th>Source</th><th>Publisher</th><th>Status</th><th className="num">Entries</th>
        <th>Descriptions</th><th>File</th><th>Checksum (SHA-256)</th></tr></thead>
        <tbody>{[...c.sources.values()].map(s => (
          <tr key={s.id}><td><b>{s.id}</b> {s.name}</td><td>{s.publisher}</td><td>{s.compendium ? `House · ${s.publisher}` : s.canon ? 'Canon' : <NonCanon />}</td>
            <td className="num">{perSource(s.id)}</td>
            <td>{s.compendium ? 'its own' : !s.texts ? <span className="muted">none</span> : c.files.some(f => f.file === `custom/sr6/${s.texts}`) ? 'installed' : <span className="muted">not installed</span>}</td>
            <td>{s.file}</td><td className="hash" title={s.sha256}>{s.sha256 && `${s.sha256.slice(0, 12)}…`}</td></tr>
        ))}</tbody></table></div>
      {canEdit(me) && <Sr6ExportBooksPanel c={c} data={data} />}

      <h2 style={{ marginTop: '1.5rem' }}>Entries per kind</h2>
      <div className="scroll-x"><table className="data sr6-kinds"><thead><tr><th>Kind</th><th className="num">Entries</th></tr></thead>
        <tbody>{KINDS.map(k => <tr key={k}><td>{SR6_KINDS[k].label}</td><td className="num">{c.entries[k].size}</td></tr>)}</tbody></table></div>

      <h2 style={{ marginTop: '1.5rem' }}>Browse the catalog</h2>
      <div className="row" style={{ margin: '0.6rem 0' }}>
        <select value={kind} onChange={e => setKind(e.target.value as Sr6Kind)} aria-label="Kind">
          {KINDS.map(k => <option key={k} value={k}>{SR6_KINDS[k].label} ({c.entries[k].size})</option>)}
        </select>
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search the catalog" aria-label="Search the catalog" style={{ flex: 1 }} />
      </div>
      <div role="status" aria-live="polite">{msg && <p className="banner">{msg}</p>}</div>
      {shown.length === 0 ? <p className="muted">{t ? `Nothing matches “${q}”.` : `No ${SR6_KINDS[kind].label.toLowerCase()} yet.`}</p> : (
        <div className="scroll-x"><table className="data sr6-browse"><thead><tr><th>Entry</th><th>Values</th><th /></tr></thead>
          <tbody>{rows.map(e => (
            <tr key={e.id}><td><b>{e.name}</b> <span className="srcline"><span className="src">{e.source} p.{e.page}</span>{e.edited && <EditedMark />}{compOf(e) && <span className="noncanon">House</span>}</span></td>
              <td className="muted">{details(e)}</td><td className="num">{editButton(e)}</td></tr>
          ))}</tbody></table>
          {rows.length < shown.length && <p className="muted">Showing {rows.length} of {shown.length}. Search to narrow it, or{' '}
            <button type="button" className="btn small quiet" onClick={() => setFull(view)}>Show all {shown.length}</button></p>}</div>
      )}

      {editor && <>
        <h2 style={{ marginTop: '1.5rem' }}>Your catalog edits</h2>
        <p>Fix a book entry with its Edit button. Edits are kept apart from the imported book, so a re-import never touches them;
          Restore book version drops one.</p>
        {edits.length === 0 ? <p className="muted">No edits yet.</p> : (
          <div className="scroll-x"><table className="data sr6-edits"><thead><tr><th>Entry</th><th>Kind</th><th>Status</th><th /></tr></thead>
            <tbody>{edits.map(e => {
              const state = c.original.has(entryKey(e.kind, e.id)) ? 'changed' : 'orphan'
              return <tr key={entryKey(e.kind, e.id)}><td><b>{e.name}</b> <span className="src">{e.source} p.{e.page}</span></td><td>{SR6_KINDS[e.kind].label}</td>
                <td className={state === 'orphan' ? 'warn' : undefined}>{STATE_TEXT[state]}</td><td className="num">{editButton(e)}</td></tr>
            })}</tbody></table></div>
        )}
      </>}

      <h2 style={{ marginTop: '1.5rem' }}>Creation rules</h2>
      <p>The creation settings (starting karma, caps, prices…) are kept at the top of the {canEdit(me) ? 'Rules' : 'Table rules'} page:{' '}
        <a href="#/sr6/rules">open the creation settings</a>. A campaign with its own shows them on its page.</p>

      <h2 style={{ marginTop: '1.5rem' }}>Problems</h2>
      {c.errors.length === 0 ? <p className="ok">Every file loaded cleanly.</p> : (
        <div className="scroll-x"><table className="data"><thead><tr><th>File</th><th>Problem</th></tr></thead>
          <tbody>{c.errors.map((e, i) => <tr key={i}><td>{e.file}</td><td className="err">{e.message}</td></tr>)}</tbody></table></div>
      )}
      <p className="muted" style={{ marginTop: '1rem' }}>The file format and schemas are documented in <code>docs/sr6-data-format.md</code> and <code>data/sr6/schema/</code>.</p>

      <Sr6EditEntry c={c} target={editing} onClose={() => setEditing(null)}
        onSaved={async text => { await reload(); setEditing(null); setMsg(text) }} />
    </main>
  )
}
