// Review of an AI import (library/<id>/review.xml): accept, edit or drop each proposed entry, then name the
// book (source id, title, canon) and add the accepted ones. Every decision is saved back to review.xml at once.
import { useEffect, useState } from 'react'
import { blankCharacter } from '../engine'
import type { AmpEntry, Catalog } from '../model/types'
import { Modal } from './bits'
import { api, BooksHeader, PROVIDER_NAMES, type Book } from './Books'
import { Editor, type EditorCtx } from './editor'
import { AmpBuilder } from './tabs/AmpBuilder'

const STATES: Record<string, string> = { pending: 'To decide', accepted: 'Accepted', edited: 'Edited', dropped: 'Dropped' }
const KIND: Record<string, string> = { amp: 'Amp', gear: 'Gear', weapon: 'Weapon', armor: 'Armor', spell: 'Spell', 'complex-form': 'Complex form',
  level: 'Level', metatype: 'Metatype', attribute: 'Attribute', skill: 'Skill', pricing: 'Prices', amptype: 'Amp type', effect: 'Amp effect',
  package: 'Package', vehicle: 'Vehicle', lifestyle: 'Lifestyle' }
const ITEM_FIELDS: [string, string][] = [['category', 'Category'], ['dv', 'Damage (DV)'], ['ranges', 'Ranges'], ['armor', 'Armor']]
/** What the edit form offers: an item's fields, or a core row's own attributes (a core review's levels, prices…). Nested rows
 *  (a metatype's ranges, a skill's specializations) aren't edited here: drop the row, or fix it in a house rule after. */
const fieldsOf = (e: Element): [string, string][] => e.tagName === 'item' ? ITEM_FIELDS
  : [...e.attributes].map(a => a.name).filter(n => !['source', 'page'].includes(n)).map(n => [n, n])
const hasName = (e: Element) => [...e.children].some(c => c.tagName === 'name')

const entryOf = (p: Element) => [...p.children].find(e => e.tagName !== 'note')!
const text = (el: Element, tag: string) => [...el.children].find(e => e.tagName === tag)?.textContent ?? ''
function setText(el: Element, tag: string, value: string, before?: Element | null) {
  let t = [...el.children].find(e => e.tagName === tag)
  if (!t) { t = el.ownerDocument.createElement(tag); el.insertBefore(t, before ?? null) }
  t.textContent = value
}

/** The amp in a proposal as the Amp Builder edits it. */
const toAmp = (el: Element): AmpEntry => ({ uid: 'review', type: el.getAttribute('type') ?? '', name: text(el, 'name'), narrative: text(el, 'narrative'),
  vehicle: el.getAttribute('vehicle') ?? undefined, effects: [...el.getElementsByTagName('effect')].map(e => ({ ref: e.getAttribute('ref')!,
    param: e.getAttribute('param') ?? undefined, value: e.getAttribute('value') ? Number(e.getAttribute('value')) : undefined, note: e.getAttribute('note') ?? undefined })) })

/** Write the Amp Builder's result back into the proposal's <amp>: name, effects, narrative, chassis. */
function fromAmp(el: Element, a: AmpEntry) {
  setText(el, 'name', a.name, el.firstElementChild)
  for (const e of [...el.getElementsByTagName('effect')]) e.remove()
  setText(el, 'narrative', a.narrative)
  const narrative = [...el.children].find(e => e.tagName === 'narrative')!
  for (const f of a.effects) {
    const e = el.ownerDocument.createElement('effect')
    for (const [k, v] of Object.entries(f)) if (v != null && v !== '') e.setAttribute(k, String(v))
    el.insertBefore(e, narrative)
  }
  if (a.vehicle) el.setAttribute('vehicle', a.vehicle); else el.removeAttribute('vehicle')
}

export function BookReview({ c, id }: { c: Catalog; id: string }) {
  const [doc, setDoc] = useState<Document | null>(null)
  const [, setVersion] = useState(0)
  const [msg, setMsg] = useState<string | null>(null)
  const [book, setBook] = useState<Book | null>(null)
  const [source, setSource] = useState('')
  const [title, setTitle] = useState('')
  const [canon, setCanon] = useState(false)
  const [editAmp, setEditAmp] = useState<{ p: Element; amp: AmpEntry } | null>(null)
  const [editItem, setEditItem] = useState<{ p: Element; values: Record<string, string> } | null>(null)
  const editFields = editItem ? fieldsOf(entryOf(editItem.p)) : []
  const editNamed = !!editItem && hasName(entryOf(editItem.p))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<string>(`review/${id}`).then(x => setDoc(new DOMParser().parseFromString(x, 'text/xml')), e => setMsg(`Couldn’t open the proposals: ${e.message}.`))
    api<Book[]>('books').then(bs => {
      const b = bs.find(x => x.id === id)
      setBook(b ?? null)
      if (b?.file) setTitle(b.name ?? b.file.replace(/\.pdf$/i, ''))
      if (b?.source) setSource(b.source)
    }, () => {})
  }, [id])

  if (!doc) return <main className="lib"><BooksHeader title="Review" />{msg ? <p className="banner" role="status">{msg}</p> : <p className="muted">Loading the proposals…</p>}</main>

  const proposals = [...doc.documentElement.getElementsByTagName('proposal')]
  const skips = [...doc.documentElement.getElementsByTagName('skip')]
  const body = () => new XMLSerializer().serializeToString(doc)
  const save = async (change: () => void) => {
    change()
    setVersion(v => v + 1)
    try { await api(`review/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/xml' }, body: body() }) }
    catch (e) { setMsg(`Couldn’t save that decision: ${(e as Error).message}. Try again.`) }
  }
  const decide = (p: Element, state: string) => save(() => p.setAttribute('state', state))
  const accepted = proposals.filter(p => ['accepted', 'edited'].includes(p.getAttribute('state')!)).length
  const pending = proposals.filter(p => p.getAttribute('state') === 'pending')
  const validSource = /^[A-Z][A-Z0-9-]{0,19}$/.test(source)
  const taken = validSource && c.sources.has(source) && book?.source !== source

  // rows for core tables the book's recipe couldn't read: they go to the core data, cited to the book as imported
  const core = doc.documentElement.getAttribute('core') === 'true'
  const apply = async () => {
    setBusy(true)
    try {
      await api(`review/${id}?${new URLSearchParams(core ? { apply: '1' } : { apply: '1', source, name: title.trim(), canon: String(canon) })}`,
        { method: 'PUT', headers: { 'Content-Type': 'application/xml' }, body: body() })
      location.hash = '#/books'
    } catch (e) { setMsg(`Couldn’t add the entries: ${(e as Error).message}.`); setBusy(false) }
  }

  return (
    <main className="lib review">
      <BooksHeader title="Review"><a className="btn quiet" href="#/books">Books</a></BooksHeader>
      <p>{book?.file ?? id}: {proposals.length} {proposals.length === 1 ? 'entry' : 'entries'} proposed
        {doc.documentElement.getAttribute('provider') ? ` by ${PROVIDER_NAMES[doc.documentElement.getAttribute('provider')!] ?? doc.documentElement.getAttribute('provider')}` : ''}. Check each against the book:
        accept it, fix it, or drop it. Only accepted and edited entries are added.</p>
      <div role="status" aria-live="polite">{msg && <p className="banner">{msg}</p>}</div>
      {skips.map(s => <p key={s.getAttribute('part')} className="warn">Part {s.getAttribute('part')} was skipped: {s.textContent}</p>)}

      <div className="row" style={{ marginBottom: '0.6rem' }}>
        <span className="muted">{accepted} accepted, {pending.length} to decide</span><span className="spacer" />
        {pending.length > 0 && <button className="btn small" onClick={() => void save(() => pending.forEach(p => p.setAttribute('state', 'accepted')))}>Accept the rest</button>}
      </div>
      <div className="scroll-x"><table className="data proposals">
        <thead><tr><th>Name</th><th>Kind</th><th className="num">Rating</th><th>Notes</th><th>Decision</th></tr></thead>
        <tbody>{proposals.map(p => {
          const e = entryOf(p), state = p.getAttribute('state')!, label = hasName(e) ? text(e, 'name') : KIND[p.getAttribute('kind')!]
          const notes = [...p.getElementsByTagName('note')].map(n => n.textContent)
          return (
            <tr key={p.getAttribute('id')} className={state}>
              <td><b>{label}</b> <span className="src">p.{p.getAttribute('page')}</span></td>
              <td>{KIND[p.getAttribute('kind')!] ?? p.getAttribute('kind')}{e.getAttribute('type') && <span className="muted"> {c.ampTypes.get(e.getAttribute('type')!)?.name ?? e.getAttribute('type')}</span>}
                {e.getAttribute('category') && <span className="muted"> {e.getAttribute('category')}</span>}</td>
              <td className="num">{e.getAttribute('printedRating') ?? e.getAttribute('dv') ?? e.getAttribute('armor') ?? e.getAttribute('rating') ?? ''}</td>
              <td>{notes.length ? <span className="warn">{notes.join('; ')}</span> : <span className="muted">none</span>}</td>
              <td><span className={`decision ${state}`}>{STATES[state] ?? state}</span>
                <div className="acts">
                <button className="btn small quiet" aria-label={`Accept ${label}`} disabled={state === 'accepted'} onClick={() => void decide(p, 'accepted')}>Accept</button>
                <button className="btn small quiet" aria-label={`Edit ${label}`} onClick={() => e.tagName === 'amp'
                  ? setEditAmp({ p, amp: toAmp(e) })
                  : setEditItem({ p, values: Object.fromEntries([['name', text(e, 'name')], ...fieldsOf(e).map(([k]) => [k, e.getAttribute(k) ?? ''])]) })}>Edit</button>
                <button className="btn small quiet" aria-label={`Drop ${label}`} disabled={state === 'dropped'} onClick={() => void decide(p, 'dropped')}>Drop</button></div>
              </td>
            </tr>
          )
        })}</tbody>
      </table></div>

      {core ? <>
        <h2 style={{ marginTop: '1.5rem' }}>Core data</h2>
        <p className="muted">These rows replace the {book?.coreUnread?.map(f => f.replace(/[.]xml$/, '')).join(', ') || 'core'} {book?.coreUnread?.length === 1 ? 'table' : 'tables'} and cite {doc.documentElement.getAttribute('source')}.
          The book will list them as read by AI.</p>
        <button className="btn primary" disabled={busy || !accepted} onClick={() => void apply()}>Add to the core data</button>
        {!busy && !accepted && <p className="muted" style={{ marginTop: '0.5rem' }}>Accept or edit at least one entry first.</p>}
      </> : <>
      <h2 style={{ marginTop: '1.5rem' }}>The book</h2>
      <p className="muted">Every entry cites this book. The source id is a short code shown next to each entry, like “CRB p.58”.</p>
      <div className="grid2">
        <label>Source id<input value={source} onChange={e => setSource(e.target.value.toUpperCase())} placeholder="MYBOOK" maxLength={20} /></label>
        <label>Book title<input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} /></label>
      </div>
      <fieldset className="canon">
        <legend className="muted">Canon</legend>
        <label className="check"><input type="radio" name="canon" checked={canon} onChange={() => setCanon(true)} />Canon: the game’s official rules</label>
        <label className="check"><input type="radio" name="canon" checked={!canon} onChange={() => setCanon(false)} />Not canon: marked Non-canon wherever it appears</label>
      </fieldset>
      {source && !validSource && <p className="err">A source id starts with a letter and uses only A–Z, 0–9 and hyphens.</p>}
      {taken && <p className="err">{source} is already {c.sources.get(source)!.name}. Choose another id.</p>}
      <button className="btn primary" disabled={busy || !accepted || !validSource || taken || !title.trim()} onClick={() => void apply()}>Add accepted entries</button>
      {!busy && (!accepted || !source || !title.trim()) && <p className="muted" style={{ marginTop: '0.5rem' }}>
        {!accepted ? 'Accept or edit at least one entry first.' : !source ? 'Enter a source id first.' : 'Enter the book’s title first.'}</p>}
      </>}

      <Modal open={!!editAmp} onClose={() => setEditAmp(null)} title={`Edit ${editAmp?.amp.name ?? ''}`} actions={<></>}>
        {editAmp && <Editor.Provider value={{ c, career: false } as EditorCtx /* ponytail: the builder reads only c and career */}>
          <AmpBuilder initial={editAmp.amp} before={editAmp.amp} build={blankCharacter('runner', 'human').build}
            onCancel={() => setEditAmp(null)}
            onSave={a => { const { p } = editAmp; setEditAmp(null); void save(() => { fromAmp(entryOf(p), a); p.setAttribute('state', 'edited') }) }} />
        </Editor.Provider>}
      </Modal>

      <Modal open={!!editItem} onClose={() => setEditItem(null)} title={`Edit ${editItem ? text(entryOf(editItem.p), 'name') || KIND[editItem.p.getAttribute('kind')!] : ''}`}
        actions={<><button className="btn" onClick={() => setEditItem(null)}>Cancel</button>
          <button className="btn primary" disabled={editNamed && !editItem?.values.name.trim()} onClick={() => {
            const { p, values } = editItem!
            setEditItem(null)
            void save(() => {
              const e = entryOf(p)
              if (hasName(e)) setText(e, 'name', values.name.trim(), e.firstElementChild)
              for (const [k] of fieldsOf(e)) if (values[k].trim()) e.setAttribute(k, values[k].trim()); else e.removeAttribute(k)
              p.setAttribute('state', 'edited')
            })
          }}>Save changes</button></>}>
        {editItem && <div className="grid2">
          {[...(editNamed ? [['name', 'Name'] as [string, string]] : []), ...editFields].map(([k, label]) => (
            <label key={k}>{label}<input value={editItem.values[k]} type={k === 'armor' ? 'number' : 'text'} min={0}
              onChange={e => setEditItem({ ...editItem, values: { ...editItem.values, [k]: e.target.value } })} /></label>
          ))}
        </div>}
      </Modal>
    </main>
  )
}
