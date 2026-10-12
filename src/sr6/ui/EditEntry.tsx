// Edit one SR6 catalog entry (editors): its name, each printed value as text, and its Description; parts (a skill's
// specializations, a critter's powers…) are shown read-only. The fields are Sr6EntryFields, which a compendium's entry
// form (Compendiums.tsx) shares, with a being's and a sprite's lines editable there. Saves go to the SR6 edits layer
// (PUT /api/sr6/edits/<kind>/<id> → `importer sr6 edit set`, checked against the kind's XSD); Restore book version
// deletes the edit. An empty Description, or the book's text unchanged, keeps the book's text.
import { useState, type ReactNode } from 'react'
import { because } from '../../ui/auth'
import { Modal } from '../../ui/bits'
import { api } from '../../ui/api'
import { esc } from '../../shared/xml'
import { STATE_TEXT } from '../../shared/ui'
import { FieldNotes } from '../../ui/Issues'
import { resolveEntry, sr6EntryXml } from '../engine/load'
import { entryKey } from '../engine/names'
import { fieldRule } from '../engine/compendium'
import type { Sr6Catalog, Sr6Entry, Sr6Kind } from '../model/types'

type Props = { c: Sr6Catalog; onClose: () => void; onSaved: (msg: string) => Promise<void> }

/** The dialog stays mounted (closing it puts focus back on the Edit button); `target` opens it on that entry. */
export function Sr6EditEntry({ target, ...p }: Props & { target: { kind: Sr6Kind; id: string } | null }) {
  const e = target && resolveEntry(p.c, target.kind, target.id)
  return (
    <Modal open={!!e} onClose={p.onClose} title={e ? `Edit ${e.name}` : ''} actions={<></>}>
      {e && target && <Form key={`${target.kind} ${target.id}`} {...p} kind={target.kind} id={target.id} />}
    </Modal>
  )
}

function Form({ c, kind, id, onClose, onSaved }: Props & { kind: Sr6Kind; id: string }) {
  const e = resolveEntry(c, kind, id)! // (a family's rated parent too, levels.ts: an edit on it reaches every level)
  const original = c.original.get(entryKey(kind, id))
  const state = !e.edited ? 'book' : original ? 'changed' : 'orphan'
  const bookText = original?.text ?? e.text
  const [draft, setDraft] = useState(e)
  const name = draft.name,
    desc = draft.text
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const url = `sr6/edits/${kind}/${encodeURIComponent(id)}`

  const run = async (what: string, call: () => Promise<unknown>, done: string) => {
    setBusy(true)
    setErr('')
    try {
      await call()
      await onSaved(done)
    } catch (x) {
      setErr(because(what, (x as Error).message))
      setBusy(false)
    }
  }
  // the book's issues and formulas: a field set here clears its issue, and drops its formula (the value typed wins)
  const book = original ?? e
  const fields = [...new Set([...Object.keys(e.attrs), ...(book.issues ?? []).map(x => x.field).filter(f => /^[a-zA-Z][a-zA-Z0-9]*$/.test(f))])]
  const save = () => {
    // a field the book doesn't print, left empty, isn't written
    const attrs = Object.fromEntries(Object.entries(draft.attrs).filter(([k, v]) => v !== '' || k in book.attrs))
    const changed = (f: string) => (attrs[f] ?? '') !== (book.attrs[f] ?? '')
    const formulas = draft.formulas?.filter(f => !changed(f.field))
    void run(
      'Couldn’t save',
      () =>
        api(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/xml' },
          body: `<edit>${sr6EntryXml({ ...e, name: name.trim(), attrs, formulas })}<description>${esc(desc.trim() === bookText.trim() ? '' : desc)}</description></edit>`,
        }),
      `Saved ${name.trim()}.`,
    )
  }
  const restore = () => {
    if (!confirm(state === 'changed' ? `Restore the book’s version of ${e.name}? Your changes are lost.` : `Remove your edit of ${e.name}?`)) return
    void run(
      'Couldn’t remove it',
      () => api(url, { method: 'DELETE' }),
      state === 'changed' ? `Restored the book’s version of ${e.name}.` : `Removed the edit of ${e.name}.`,
    )
  }

  return (
    <form
      className="stack"
      onSubmit={x => {
        x.preventDefault()
        if (!busy && state !== 'orphan' && name.trim()) save()
      }}
    >
      {state !== 'book' && (
        <div className="row editstate">
          <span className={state === 'orphan' ? 'warn' : 'muted'}>{STATE_TEXT[state]}</span>
          <span className="spacer" />
          <button type="button" className="btn small" disabled={busy} onClick={restore}>
            {state === 'changed' ? 'Restore book version' : 'Remove edit'}
          </button>
        </div>
      )}
      {state === 'orphan' && (
        <p className="muted">The book this entry came from was removed, so the edit can’t be saved again. Remove it, or re-import the book.</p>
      )}
      <p className="muted">
        {e.source} p.{e.page} · {id}
      </p>
      <Sr6EntryFields
        entry={draft}
        fields={fields}
        onChange={setDraft}
        book={book}
        descPlaceholder={bookText ? '' : 'Empty: the book’s text shows (when the book has one)'}
        partsNote="Kept as printed (editing these comes with the builder):"
      />
      {!name.trim() && <p className="muted">Enter a name to save.</p>}
      <div role="alert">{err && <p className="err">{err}</p>}</div>
      <div className="actions">
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" disabled={busy || state === 'orphan' || !name.trim()}>
          Save changes
        </button>
      </div>
    </form>
  )
}

/** An entry's fields: Name, one input per attribute in `fields` (a select where common.xsd fixes the choices, marked when
 *  it must be set), one textarea per line part in `lines` (written in that order, as the schema wants them), the other
 *  parts read only, then the Description (the entry's text). */
export function Sr6EntryFields({
  entry,
  fields,
  lines = [],
  onChange,
  descPlaceholder,
  partsNote,
  book,
}: {
  entry: Sr6Entry
  fields: string[]
  lines?: string[]
  onChange: (e: Sr6Entry) => void
  descPlaceholder?: string
  partsNote?: ReactNode
  /** the book's entry: its issues ("book: none printed") and formulas under their fields */
  book?: Sr6Entry
}) {
  const set = (f: string, v: string) => onChange({ ...entry, attrs: { ...entry.attrs, [f]: v } })
  const line = (tag: string) => entry.parts.find(p => p.tag === tag)?.text ?? ''
  const setLine = (tag: string, text: string) =>
    onChange({
      ...entry,
      parts: [
        ...lines.map(t => (t === tag ? { tag, attrs: {}, text } : (entry.parts.find(p => p.tag === t) ?? { tag: t, attrs: {}, text: '' }))),
        ...entry.parts.filter(p => !lines.includes(p.tag)),
      ],
    })
  const fixed = entry.parts.filter(p => !lines.includes(p.tag))
  return (
    <>
      <div className="grid2">
        <label>
          Name
          <input autoFocus value={entry.name} onChange={x => onChange({ ...entry, name: x.target.value })} />
        </label>
        {fields.map(f => {
          const r = fieldRule(entry.kind, f),
            v = entry.attrs[f] ?? '',
            label = r.required ? `${f} (required)` : f
          return (
            <label key={f}>
              {label}
              {r.choices ? (
                <select value={v} required={r.required} onChange={x => set(f, x.target.value)}>
                  {!r.required || !r.choices.includes(v) ? <option value="">{r.required ? 'Choose…' : 'Not set'}</option> : null}
                  {v && !r.choices.includes(v) && <option value={v}>{v}</option>}
                  {r.choices.map(o => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input value={v} required={r.required} inputMode={r.whole ? 'numeric' : undefined} onChange={x => set(f, x.target.value)} />
              )}
              {book && <FieldNotes field={f} issues={book.issues} formulas={book.formulas} />}
            </label>
          )
        })}
      </div>
      {lines.map(t => (
        <label key={t}>
          {t}
          <textarea rows={2} value={line(t)} onChange={x => setLine(t, x.target.value)} />
        </label>
      ))}
      {fixed.length > 0 && (
        <div>
          {partsNote && <p className="muted">{partsNote}</p>}
          <ul className="sr6-parts">
            {fixed.map((p, i) => (
              <li key={i}>
                <b>{p.tag}</b>{' '}
                {Object.entries(p.attrs)
                  .map(([k, v]) => `${k} ${v}`)
                  .join(', ')}{' '}
                {p.text}
              </li>
            ))}
          </ul>
        </div>
      )}
      <label>
        Description
        <textarea value={entry.text} rows={6} onChange={x => onChange({ ...entry, text: x.target.value })} placeholder={descPlaceholder} />
      </label>
    </>
  )
}
