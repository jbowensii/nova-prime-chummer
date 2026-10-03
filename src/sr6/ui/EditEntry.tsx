// Edit one SR6 catalog entry (editors): its name, each printed value as text, and its Description; parts (a skill's
// specializations, a critter's powers…) are shown read-only in S1. Saves go to the SR6 edits layer
// (PUT /api/sr6/edits/<kind>/<id> → `importer sr6 edit set`, checked against the kind's XSD); Restore book version
// deletes the edit. An empty Description, or the book's text unchanged, keeps the book's text.
import { useState } from 'react'
import { because } from '../../ui/auth'
import { Modal } from '../../ui/bits'
import { api } from '../../ui/Books'
import { esc, STATE_TEXT } from '../../ui/EditEntry'
import { entryKey, sr6EntryXml } from '../engine/load'
import type { Sr6Catalog, Sr6Kind } from '../model/types'

type Props = { c: Sr6Catalog; onClose: () => void; onSaved: (msg: string) => Promise<void> }

/** The dialog stays mounted (closing it puts focus back on the Edit button); `target` opens it on that entry. */
export function Sr6EditEntry({ target, ...p }: Props & { target: { kind: Sr6Kind; id: string } | null }) {
  const e = target && p.c.entries[target.kind].get(target.id)
  return (
    <Modal open={!!e} onClose={p.onClose} title={e ? `Edit ${e.name}` : ''} actions={<></>}>
      {e && target && <Form key={`${target.kind} ${target.id}`} {...p} kind={target.kind} id={target.id} />}
    </Modal>
  )
}

function Form({ c, kind, id, onClose, onSaved }: Props & { kind: Sr6Kind; id: string }) {
  const e = c.entries[kind].get(id)!
  const original = c.original.get(entryKey(kind, id))
  const state = !e.edited ? 'book' : original ? 'changed' : 'orphan'
  const bookText = original?.text ?? e.text
  const [name, setName] = useState(e.name)
  const [attrs, setAttrs] = useState(e.attrs)
  const [desc, setDesc] = useState(e.text)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const url = `sr6/edits/${kind}/${encodeURIComponent(id)}`

  const run = async (what: string, call: () => Promise<unknown>, done: string) => {
    setBusy(true); setErr('')
    try { await call(); await onSaved(done) }
    catch (x) { setErr(because(what, (x as Error).message)); setBusy(false) }
  }
  const save = () => void run('Couldn’t save', () => api(url, { method: 'PUT', headers: { 'Content-Type': 'application/xml' },
    body: `<edit>${sr6EntryXml({ ...e, name: name.trim(), attrs })}<description>${esc(desc.trim() === bookText.trim() ? '' : desc)}</description></edit>` }), `Saved ${name.trim()}.`)
  const restore = () => {
    if (!confirm(state === 'changed' ? `Restore the book’s version of ${e.name}? Your changes are lost.` : `Remove your edit of ${e.name}?`)) return
    void run('Couldn’t remove it', () => api(url, { method: 'DELETE' }), state === 'changed' ? `Restored the book’s version of ${e.name}.` : `Removed the edit of ${e.name}.`)
  }

  return (
    <form className="stack" onSubmit={x => { x.preventDefault(); if (!busy && state !== 'orphan' && name.trim()) save() }}>
      {state !== 'book' && <div className="row editstate">
        <span className={state === 'orphan' ? 'warn' : 'muted'}>{STATE_TEXT[state]}</span><span className="spacer" />
        <button type="button" className="btn small" disabled={busy} onClick={restore}>{state === 'changed' ? 'Restore book version' : 'Remove edit'}</button>
      </div>}
      {state === 'orphan' && <p className="muted">The book this entry came from was removed, so the edit can’t be saved again. Remove it, or re-import the book.</p>}
      <p className="muted">{e.source} p.{e.page} · {id}</p>
      <div className="grid2">
        <label>Name<input autoFocus value={name} onChange={x => setName(x.target.value)} /></label>
        {Object.keys(attrs).map(k => <label key={k}>{k}<input value={attrs[k]} onChange={x => setAttrs({ ...attrs, [k]: x.target.value })} /></label>)}
      </div>
      {e.parts.length > 0 && <div>
        <p className="muted">Kept as printed (editing these comes with the builder):</p>
        <ul className="sr6-parts">{e.parts.map((p, i) => <li key={i}><b>{p.tag}</b> {Object.entries(p.attrs).map(([k, v]) => `${k} ${v}`).join(', ')} {p.text}</li>)}</ul>
      </div>}
      <label>Description<textarea value={desc} rows={6} onChange={x => setDesc(x.target.value)}
        placeholder={bookText ? '' : 'Empty: the book’s text shows (when the book has one)'} /></label>
      {!name.trim() && <p className="muted">Enter a name to save.</p>}
      <div role="alert">{err && <p className="err">{err}</p>}</div>
      <div className="actions">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy || state === 'orphan' || !name.trim()}>Save changes</button>
      </div>
    </form>
  )
}
