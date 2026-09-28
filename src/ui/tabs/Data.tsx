import type { Catalog } from '../../model/types'
import { AccountMenu } from '../auth'
import { NonCanon } from '../bits'
import { EditButton, editState, STATE_TEXT, useOpenEdit, type EditKind } from '../EditEntry'
import { SourceLabel } from '../SourceLabel'

const KINDS: [EditKind, string][] = [['amps', 'Amp'], ['items', 'Item'], ['rules', 'Rule']]

/** entries per source across the catalog (amps, items, skills, their own-cited specs, rules) */
function counts(c: Catalog) {
  const n = new Map<string, number>()
  const add = (s: string | undefined) => { if (s) n.set(s, (n.get(s) ?? 0) + 1) }
  for (const m of [c.amps, c.items, c.skills, c.rules] as Map<string, { source: string }>[]) for (const e of m.values()) add(e.source)
  for (const sk of c.skills.values()) for (const sp of sk.specs) add(sp.source)
  return n
}

export function DataScreen({ c }: { c: Catalog }) {
  const count = counts(c)
  const openEdit = useOpenEdit()
  const edits = KINDS.flatMap(([kind, label]) => [...(c[kind] as Map<string, { id: string; source: string; page: number; edited?: boolean; name?: string; title?: string }>).values()]
    .filter(e => e.edited).map(e => ({ kind, label, e, name: e.name ?? e.title ?? e.id, state: editState(c, kind, e as never) })))
  return (
    <main className="lib">
      <header><div style={{ flex: 1 }}><a className="brand" href="#/">Chummer <b>Anarchy</b> 2.0</a><h1>Game data</h1></div><div className="row"><a className="btn quiet" href="#/">Your runners</a><AccountMenu /></div></header>
      <p>All rules and catalog data load from XML files next to this page. House rules and extra content go in the <code>custom/</code> folder
        (on Unraid: <code>/mnt/user/appdata/chummer-anarchy2/custom</code>), listed in <code>custom/index.xml</code>. Same id replaces a book entry,
        <code> &lt;remove id="…"/&gt;</code> deletes one, a new id adds one. Reload the page after changing them.</p>
      <h2>Sources</h2>
      <p>Canon is the game’s official rules. Other published material is marked <NonCanon /> wherever it appears; each runner can be set
        to flag it (Concept tab). Descriptions are private: one file per source in <code>custom/texts/</code>, never part of the app itself.</p>
      <div className="scroll-x"><table className="data"><thead><tr><th>Source</th><th>Publisher</th><th>Status</th><th className="num">Entries</th><th>Descriptions</th><th>File</th><th>Checksum (SHA-256)</th></tr></thead>
        <tbody>{[...c.sources.values()].map(s => (
          <tr key={s.id}><td><b>{s.id}</b> {s.name}</td><td>{s.publisher}</td><td>{s.canon ? 'Canon' : <NonCanon />}</td>
            <td className="num">{count.get(s.id) ?? 0}</td>
            <td>{!s.texts ? <span className="muted">none</span> : c.files.some(f => f.file === `custom/${s.texts}`) ? 'installed' : <span className="muted">not installed</span>}</td>
            <td>{s.file}</td><td className="hash" title={s.sha256}>{s.sha256?.split(' ').map(h => `${h.slice(0, 12)}…`).join(' ')}</td></tr>
        ))}</tbody></table></div>
      {openEdit && <>
        <h2 style={{ marginTop: '1.5rem' }}>Your catalog edits</h2>
        <p>Fix a book entry with its Edit button (amp and gear pickers, the Rules reference), or add your own under a house-rule source.
          Edits are kept apart from the imported books, so a re-import never touches them; Restore book version drops one.</p>
        <div className="row" style={{ marginBottom: '0.6rem' }}>
          <button className="btn small" onClick={() => openEdit({ kind: 'amps' })}>Add an amp</button>
          <button className="btn small" onClick={() => openEdit({ kind: 'items' })}>Add an item</button>
          <button className="btn small" onClick={() => openEdit({ kind: 'rules' })}>Add a rule</button>
        </div>
        {edits.length === 0 ? <p className="muted">No edits yet.</p> : (
          <div className="scroll-x"><table className="data edits"><thead><tr><th>Entry</th><th>Kind</th><th>Status</th><th /></tr></thead>
            <tbody>{edits.map(({ kind, label, e, name, state }) => (
              <tr key={`${kind} ${e.id}`}><td><b>{name}</b> <SourceLabel c={c} source={e.source} page={e.page} id={e.id} /></td><td>{label}</td>
                <td className={state === 'orphan' ? 'warn' : undefined}>{STATE_TEXT[state]}</td>
                <td className="num"><EditButton kind={kind} id={e.id} name={name} /></td></tr>
            ))}</tbody></table></div>
        )}
      </>}
      <h2 style={{ marginTop: '1.5rem' }}>Problems</h2>
      {c.errors.length === 0 ? <p className="ok">Every file loaded cleanly.</p> : (
        <div className="scroll-x"><table className="data"><thead><tr><th>File</th><th>Line</th><th>Problem</th></tr></thead>
          <tbody>{c.errors.map((e, i) => <tr key={i}><td>{e.file}</td><td className="num">{e.line ?? ''}</td><td className="err">{e.message}</td></tr>)}</tbody></table></div>
      )}
      <h2 style={{ marginTop: '1.5rem' }}>Loaded files</h2>
      <div className="scroll-x"><table className="data"><thead><tr><th>File</th><th>Kind</th><th className="num">Entries</th><th>From</th></tr></thead>
        <tbody>{c.files.map(f => <tr key={f.file}><td>{f.file}</td><td>{f.kind}</td><td className="num">{f.entries}</td><td>{f.overlay ? 'custom overlay' : 'base data'}</td></tr>)}</tbody></table></div>
      <p className="muted" style={{ marginTop: '1rem' }}>The file format and schemas are documented in <code>docs/data-format.md</code> and <code>data/schema/</code>.</p>
    </main>
  )
}
