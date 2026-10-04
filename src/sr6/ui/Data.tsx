// SR6 Game data (everyone): the sources, entries per kind, a browser of every catalog entry, the catalog edits (editors:
// each entry's Edit button opens Sr6EditEntry; a compendium entry's is a link to it in its compendium, for its owner only), the creation rules (editors fill them in) and the files that didn't load. Kept apart from Anarchy's page, which is
// bound to its own catalog type.
import { useEffect, useState } from 'react'
import { canEdit, isAdmin, send, useMe } from '../../ui/auth'
import { NonCanon } from '../../ui/bits'
import { EditedMark, STATE_TEXT } from '../../ui/EditEntry'
import { PageHeader } from '../../ui/nav'
import { useRepo } from '../../ui/repo'
import { CREATION_GROUPS, expandKeys, type CreationRules } from '../engine/creation'
import { entryKey } from '../engine/load'
import { SR6_KINDS, type Sr6Catalog, type Sr6Entry, type Sr6Kind } from '../model/types'
import { Sr6EditEntry } from './EditEntry'

const KINDS = Object.keys(SR6_KINDS) as Sr6Kind[]
const LIMIT = 200 // rows the browser shows before "Show all" (a real book's gear or rules run to hundreds)
/** "category zappers · dv 3P · cost 320": an entry's printed values */
const details = (e: Sr6Entry) => Object.entries(e.attrs).map(([k, v]) => `${k} ${v}`).join(' · ')

type Loaded = { rules: CreationRules; errors: string[] }

export function Sr6Data({ c, reload, cr, reloadCreation }: { c: Sr6Catalog; reload: () => Promise<void>; cr: Loaded; reloadCreation: () => Promise<void> }) {
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

      <Creation c={c} cr={cr} editor={editor} reload={reloadCreation} />

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

type Row = { value: string; source: string; page: string }
const NO_ROW: Row = { value: '', source: '', page: '' }
const rowsOf = (cr: CreationRules): Record<string, Row> =>
  Object.fromEntries([...cr.values()].map(s => [s.key, { value: String(s.value), source: s.source ?? '', page: s.page ? String(s.page) : '' }]))

/** The creation rules (custom/sr6/creation.xml): one row per setting, grouped as CREATION_GROUPS; editors save the whole
 *  list, players read it. A saved setting the form doesn't show (a metatype gone from the catalog) is kept. */
function Creation({ c, cr, editor, reload }: { c: Sr6Catalog; cr: Loaded; editor: boolean; reload: () => Promise<void> }) {
  const [draft, setDraft] = useState(() => rowsOf(cr.rules))
  useEffect(() => setDraft(rowsOf(cr.rules)), [cr])
  const [msg, setMsg] = useState(''), [err, setErr] = useState(''), [saving, setSaving] = useState(false)
  const keys = expandKeys({ metatypes: Object.fromEntries(c.entries.metatypes) })
  const qualities = [...c.entries.qualities.values()].sort((a, b) => a.name.localeCompare(b.name))
  const set = (key: string, f: Partial<Row>) => { setMsg(''); setDraft(d => ({ ...d, [key]: { ...NO_ROW, ...d[key], ...f } })) }
  async function save() {
    setMsg(''); setErr(''); setSaving(true)
    const settings = Object.entries(draft).filter(([, r]) => r.value.trim()).map(([key, r]) => ({ key, value: r.value.trim(),
      ...r.source.trim() ? { source: r.source.trim() } : {}, ...r.page.trim() ? { page: r.page.trim() } : {} }))
    try {
      await send('sr6/creation', { settings }, 'PUT')
      await reload()
      setMsg('Creation rules saved.')
    } catch (e) { setErr((e as Error).message) } finally { setSaving(false) }
  }
  return (
    <section className="sr6-creation">
      <h2 style={{ marginTop: '1.5rem' }}>Creation rules</h2>
      <p>The numbers the core rulebook gives in its text. Fill them in from your book; runners are checked against them.
        {!editor && ' The admin and editors fill them in.'}</p>
      {cr.errors.length > 0 && <ul className="err">{cr.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
      <fieldset className="bare" disabled={!editor || saving}>
        {CREATION_GROUPS.map(g => {
          const rows = keys.filter(k => k.group === g)
          return rows.length > 0 && <div key={g}>
            <h3>{g}</h3>
            {g === 'Karma prices' && <p>Also the career prices.</p>}
            <div className="scroll-x"><table className="data"><thead><tr><th>Setting</th><th>Value</th><th>Source</th><th>Page</th></tr></thead>
              <tbody>{rows.map(k => {
                const r = draft[k.key] ?? NO_ROW, v = (value: string) => set(k.key, { value })
                return <tr key={k.key}>
                  <td>{k.label}</td>
                  <td>{k.type === 'number'
                    ? <input type="number" step="any" aria-label={k.label} value={r.value} onChange={e => v(e.target.value)} />
                    : <select aria-label={k.label} value={r.value} onChange={e => v(e.target.value)}>
                      <option value="">Not set</option>
                      {k.type === 'bool' ? <><option value="true">Yes</option><option value="false">No</option></>
                        : <>{r.value && !c.entries.qualities.has(r.value) && <option value={r.value}>{r.value} (not in the catalog)</option>}
                          {qualities.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}</>}
                    </select>}</td>
                  <td><input className="src-id" aria-label={`${k.label}: source`} value={r.source} onChange={e => set(k.key, { source: e.target.value.toUpperCase() })} /></td>
                  <td><input type="number" min={1} step={1} aria-label={`${k.label}: page`} value={r.page} onChange={e => set(k.key, { page: e.target.value })} /></td>
                </tr>
              })}</tbody></table></div>
          </div>
        })}
      </fieldset>
      {editor && <p><button type="button" className="btn" disabled={saving} onClick={() => void save()}>Save creation rules</button></p>}
      <div role="status" aria-live="polite">{msg && <p className="ok">{msg}</p>}</div>
      {err && <p className="err" role="alert">{err}</p>}
    </section>
  )
}
