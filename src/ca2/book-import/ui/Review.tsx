// Review of an AI import (library/<id>/review.xml): accept, edit or drop each proposed entry, then name the
// book (source id, title, canon) and add the accepted ones. Every decision is saved back to review.xml at once.
import { useEffect, useState } from 'react'
import { blankCharacter } from '../../formats/domain/file'
import { toPick } from '../../formats/domain/parse'
import { SOURCE_ID } from '../../../core/shared/source'
import { ATTRS, type AmpEntry, type AttrId, type Catalog } from '../../formats/domain/types'
import { Modal } from '../../../core/ui-kit/bits'
import { api } from '../../../core/ui-kit/api'
import { BooksHeader, PROVIDER_NAMES, type Book } from '../../../features/book-library/Books'
import { Editor, type EditorCtx } from '../../runner-builder/ui/editor'
import { AmpBuilder } from '../../runner-builder/ui/tabs/AmpBuilder'
import { because } from '../../../core/ui-kit/auth'

const STATES: Record<string, string> = { pending: 'To decide', accepted: 'Accepted', edited: 'Edited', dropped: 'Dropped' }
const KIND: Record<string, string> = {
  amp: 'Amp',
  gear: 'Gear',
  weapon: 'Weapon',
  armor: 'Armor',
  spell: 'Spell',
  'complex-form': 'Complex form',
  level: 'Level',
  metatype: 'Metatype',
  attribute: 'Attribute',
  skill: 'Skill',
  pricing: 'Prices',
  amptype: 'Amp type',
  effect: 'Amp effect',
  package: 'Package',
  vehicle: 'Vehicle',
  lifestyle: 'Lifestyle',
}
const ITEM_FIELDS: [string, string][] = [
  ['category', 'Category'],
  ['dv', 'Damage (DV)'],
  ['ranges', 'Ranges'],
  ['armor', 'Armor'],
]
/** What the edit form offers: an item's fields, or a core row's own attributes (a core review's levels, prices…); a
 *  metatype's ranges and a skill's specializations are its nested rows (nestedOf). */
const fieldsOf = (e: Element): [string, string][] =>
  e.tagName === 'item'
    ? ITEM_FIELDS
    : [...e.attributes]
        .map(a => a.name)
        .filter(n => !['source', 'page'].includes(n))
        .map(n => [n, n])
const hasName = (e: Element) => [...e.children].some(c => c.tagName === 'name')

/** A core row's nested rows as the edit form holds them: a metatype's range per attribute, a skill's specializations. */
export interface Nested {
  ranges?: { attr: string; min: string; max: string }[]
  specs?: { id: string; attr: string; name: string }[]
}
const kids = (e: Element, tag: string) => [...e.children].filter(x => x.tagName === tag)
export const nestedOf = (e: Element): Nested => ({
  ...(e.tagName === 'metatype'
    ? { ranges: kids(e, 'range').map(r => ({ attr: r.getAttribute('attr') ?? '', min: r.getAttribute('min') ?? '', max: r.getAttribute('max') ?? '' })) }
    : {}),
  ...(e.tagName === 'skill'
    ? { specs: kids(e, 'spec').map(s => ({ id: s.getAttribute('id') ?? '', attr: s.getAttribute('attr') ?? '', name: s.textContent ?? '' })) }
    : {}),
})
const kebab = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
/** A specialization's id: its own, else <skill id>.<name in kebab-case>, as the importer names them. */
export const specId = (skill: string, s: { id: string; name: string }) => s.id.trim() || `${skill}.${kebab(s.name)}`
/** Why the nested rows can't be saved as they are, or null. The importer checks them again on apply (schema and ids). */
export function nestedProblem(n: Nested, skill = ''): string | null {
  for (const r of n.ranges ?? []) {
    if (!/^\d+$/.test(r.min.trim()) || !/^\d+$/.test(r.max.trim())) return `The ${r.attr} range needs whole numbers.`
    if (Number(r.max) < 1 || Number(r.min) > Number(r.max)) return `The ${r.attr} range needs a maximum of at least 1, and no lower than its minimum.`
  }
  const ids = new Set<string>()
  for (const s of n.specs ?? []) {
    if (!s.name.trim()) return 'Each specialization needs a name.'
    const id = specId(skill, s)
    if (!/[a-z0-9]$/.test(id)) return `The specialization “${s.name.trim()}” needs a letter or digit in its name.`
    if (ids.has(id)) return `Two specializations have the id ${id}.`
    ids.add(id)
  }
  return null
}
/** Write the form's nested rows back into the entry. Ranges and specs come last in both (metatypes.xsd, skills.xsd). */
export function setNested(e: Element, n: Nested) {
  const add = (tag: string, attrs: Record<string, string>, text?: string) => {
    const x = e.ownerDocument.createElement(tag)
    for (const [k, v] of Object.entries(attrs)) x.setAttribute(k, v)
    if (text !== undefined) x.textContent = text
    e.appendChild(x)
  }
  if (n.ranges) {
    for (const r of kids(e, 'range')) r.remove()
    for (const r of n.ranges) add('range', { attr: r.attr, min: r.min.trim(), max: r.max.trim() })
  }
  if (n.specs) {
    for (const s of kids(e, 'spec')) s.remove()
    for (const s of n.specs) add('spec', { id: specId(e.getAttribute('id') ?? '', s), attr: s.attr }, s.name.trim())
  }
}

const entryOf = (p: Element) => [...p.children].find(e => e.tagName !== 'note')!
const text = (el: Element, tag: string) => [...el.children].find(e => e.tagName === tag)?.textContent ?? ''
function setText(el: Element, tag: string, value: string, before?: Element | null) {
  let t = [...el.children].find(e => e.tagName === tag)
  if (!t) {
    t = el.ownerDocument.createElement(tag)
    el.insertBefore(t, before ?? null)
  }
  t.textContent = value
}

/** The amp in a proposal as the Amp Builder edits it. */
const toAmp = (el: Element): AmpEntry => ({
  uid: 'review',
  type: el.getAttribute('type') ?? '',
  name: text(el, 'name'),
  narrative: text(el, 'narrative'),
  vehicle: el.getAttribute('vehicle') ?? undefined,
  effects: [...el.getElementsByTagName('effect')].map(toPick),
})

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
  if (a.vehicle) el.setAttribute('vehicle', a.vehicle)
  else el.removeAttribute('vehicle')
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
  const [editItem, setEditItem] = useState<{ p: Element; values: Record<string, string>; nested: Nested } | null>(null)
  const editFields = editItem ? fieldsOf(entryOf(editItem.p)) : []
  const editNamed = !!editItem && hasName(entryOf(editItem.p))
  const problem = editItem && nestedProblem(editItem.nested, entryOf(editItem.p).getAttribute('id') ?? '')
  const setNest = (n: Nested) => editItem && setEditItem({ ...editItem, nested: { ...editItem.nested, ...n } })
  const attrName = (a: string) => c.attributes.get(a as AttrId)?.name ?? a
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<string>(`review/${id}`).then(
      x => setDoc(new DOMParser().parseFromString(x, 'text/xml')),
      e => setMsg(because('Couldn’t open the proposals', e.message)),
    )
    api<Book[]>('books').then(
      bs => {
        const b = bs.find(x => x.id === id)
        setBook(b ?? null)
        if (b?.file) setTitle(b.name ?? b.file.replace(/\.pdf$/i, ''))
        if (b?.source) setSource(b.source)
      },
      () => {},
    )
  }, [id])

  if (!doc)
    return (
      <main className="lib">
        <BooksHeader title="Review" />
        {msg ? (
          <p className="banner" role="status">
            {msg}
          </p>
        ) : (
          <p className="muted">Loading the proposals…</p>
        )}
      </main>
    )

  const proposals = [...doc.documentElement.getElementsByTagName('proposal')]
  const skips = [...doc.documentElement.getElementsByTagName('skip')]
  const body = () => new XMLSerializer().serializeToString(doc)
  const save = async (change: () => void) => {
    change()
    setVersion(v => v + 1)
    try {
      await api(`review/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/xml' }, body: body() })
    } catch (e) {
      setMsg(`${because('Couldn’t save that decision', (e as Error).message)} Try again.`)
    }
  }
  const decide = (p: Element, state: string) => save(() => p.setAttribute('state', state))
  const accepted = proposals.filter(p => ['accepted', 'edited'].includes(p.getAttribute('state')!)).length
  const pending = proposals.filter(p => p.getAttribute('state') === 'pending')
  const validSource = SOURCE_ID.test(source)
  const taken = validSource && c.sources.has(source) && book?.source !== source

  // rows for core tables the book's recipe couldn't read: they go to the core data, cited to the book as imported
  const core = doc.documentElement.getAttribute('core') === 'true'
  const apply = async () => {
    setBusy(true)
    try {
      await api(`review/${id}?${new URLSearchParams(core ? { apply: '1' } : { apply: '1', source, name: title.trim(), canon: String(canon) })}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/xml' },
        body: body(),
      })
      location.hash = '#/books'
    } catch (e) {
      setMsg(because('Couldn’t add the entries', (e as Error).message))
      setBusy(false)
    }
  }

  return (
    <main className="lib review">
      <BooksHeader title="Review" />
      <p>
        {book?.file ?? id}: {proposals.length} {proposals.length === 1 ? 'entry' : 'entries'} proposed
        {doc.documentElement.getAttribute('provider')
          ? ` by ${PROVIDER_NAMES[doc.documentElement.getAttribute('provider')!] ?? doc.documentElement.getAttribute('provider')}`
          : ''}
        . Check each against the book: accept it, fix it, or drop it. Only accepted and edited entries are added.
      </p>
      <div role="status" aria-live="polite">
        {msg && <p className="banner">{msg}</p>}
      </div>
      {skips.map(s => (
        <p key={s.getAttribute('part')} className="warn">
          Part {s.getAttribute('part')} was skipped: {s.textContent}
        </p>
      ))}

      <div className="row" style={{ marginBottom: '0.6rem' }}>
        <span className="muted">
          {accepted} accepted, {pending.length} to decide
        </span>
        <span className="spacer" />
        {pending.length > 0 && (
          <button className="btn small" onClick={() => void save(() => pending.forEach(p => p.setAttribute('state', 'accepted')))}>
            Accept the rest
          </button>
        )}
      </div>
      <div className="scroll-x">
        <table className="data proposals">
          <thead>
            <tr>
              <th>Name</th>
              <th>Kind</th>
              <th className="num">Rating</th>
              <th>Notes</th>
              <th>Decision</th>
            </tr>
          </thead>
          <tbody>
            {proposals.map(p => {
              const e = entryOf(p),
                state = p.getAttribute('state')!,
                label = hasName(e) ? text(e, 'name') : KIND[p.getAttribute('kind')!]
              const notes = [...p.getElementsByTagName('note')].map(n => n.textContent)
              return (
                <tr key={p.getAttribute('id')} className={state}>
                  <td>
                    <b>{label}</b> <span className="src">p.{p.getAttribute('page')}</span>
                  </td>
                  <td>
                    {KIND[p.getAttribute('kind')!] ?? p.getAttribute('kind')}
                    {e.getAttribute('type') && <span className="muted"> {c.ampTypes.get(e.getAttribute('type')!)?.name ?? e.getAttribute('type')}</span>}
                    {e.getAttribute('category') && <span className="muted"> {e.getAttribute('category')}</span>}
                  </td>
                  <td className="num">
                    {e.getAttribute('printedRating') ?? e.getAttribute('dv') ?? e.getAttribute('armor') ?? e.getAttribute('rating') ?? ''}
                  </td>
                  <td>{notes.length ? <span className="warn">{notes.join('; ')}</span> : <span className="muted">none</span>}</td>
                  <td>
                    <span className={`decision ${state}`}>{STATES[state] ?? state}</span>
                    <div className="acts">
                      <button
                        className="btn small quiet"
                        aria-label={`Accept ${label}`}
                        disabled={state === 'accepted'}
                        onClick={() => void decide(p, 'accepted')}
                      >
                        Accept
                      </button>
                      <button
                        className="btn small quiet"
                        aria-label={`Edit ${label}`}
                        onClick={() =>
                          e.tagName === 'amp'
                            ? setEditAmp({ p, amp: toAmp(e) })
                            : setEditItem({
                                p,
                                values: Object.fromEntries([['name', text(e, 'name')], ...fieldsOf(e).map(([k]) => [k, e.getAttribute(k) ?? ''])]),
                                nested: nestedOf(e),
                              })
                        }
                      >
                        Edit
                      </button>
                      <button className="btn small quiet" aria-label={`Drop ${label}`} disabled={state === 'dropped'} onClick={() => void decide(p, 'dropped')}>
                        Drop
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {core ? (
        <>
          <h2 style={{ marginTop: '1.5rem' }}>Core data</h2>
          <p className="muted">
            These rows replace the {book?.coreUnread?.map(f => f.replace(/[.]xml$/, '')).join(', ') || 'core'}{' '}
            {book?.coreUnread?.length === 1 ? 'table' : 'tables'} and cite {doc.documentElement.getAttribute('source')}. The book will list them as read by AI.
          </p>
          <button className="btn primary" disabled={busy || !accepted} onClick={() => void apply()}>
            Add to the core data
          </button>
          {!busy && !accepted && (
            <p className="muted" style={{ marginTop: '0.5rem' }}>
              Accept or edit at least one entry first.
            </p>
          )}
        </>
      ) : (
        <>
          <h2 style={{ marginTop: '1.5rem' }}>The book</h2>
          <p className="muted">Every entry cites this book. The source id is a short code shown next to each entry, like “CRB p.58”.</p>
          <div className="grid2">
            <label>
              Source id
              <input value={source} onChange={e => setSource(e.target.value.toUpperCase())} placeholder="MYBOOK" maxLength={20} />
            </label>
            <label>
              Book title
              <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} />
            </label>
          </div>
          <fieldset className="canon">
            <legend className="muted">Canon</legend>
            <label className="check">
              <input type="radio" name="canon" checked={canon} onChange={() => setCanon(true)} />
              Canon: the game’s official rules
            </label>
            <label className="check">
              <input type="radio" name="canon" checked={!canon} onChange={() => setCanon(false)} />
              Not canon: marked Non-canon wherever it appears
            </label>
          </fieldset>
          {source && !validSource && <p className="err">A source id starts with a letter and uses only A–Z, 0–9 and hyphens.</p>}
          {taken && (
            <p className="err">
              {source} is already {c.sources.get(source)!.name}. Choose another id.
            </p>
          )}
          <button className="btn primary" disabled={busy || !accepted || !validSource || taken || !title.trim()} onClick={() => void apply()}>
            Add accepted entries
          </button>
          {!busy && (!accepted || !source || !title.trim()) && (
            <p className="muted" style={{ marginTop: '0.5rem' }}>
              {!accepted ? 'Accept or edit at least one entry first.' : !source ? 'Enter a source id first.' : 'Enter the book’s title first.'}
            </p>
          )}
        </>
      )}

      <Modal open={!!editAmp} onClose={() => setEditAmp(null)} title={`Edit ${editAmp?.amp.name ?? ''}`} actions={<></>}>
        {editAmp && (
          <Editor.Provider value={{ c, career: false } as EditorCtx /* ponytail: the builder reads only c and career */}>
            <AmpBuilder
              initial={editAmp.amp}
              before={editAmp.amp}
              build={blankCharacter('runner', 'human').build}
              onCancel={() => setEditAmp(null)}
              onSave={a => {
                const { p } = editAmp
                setEditAmp(null)
                void save(() => {
                  fromAmp(entryOf(p), a)
                  p.setAttribute('state', 'edited')
                })
              }}
            />
          </Editor.Provider>
        )}
      </Modal>

      <Modal
        open={!!editItem}
        onClose={() => setEditItem(null)}
        title={`Edit ${editItem ? text(entryOf(editItem.p), 'name') || KIND[editItem.p.getAttribute('kind')!] : ''}`}
        actions={
          <>
            <button className="btn" onClick={() => setEditItem(null)}>
              Cancel
            </button>
            <button
              className="btn primary"
              disabled={(editNamed && !editItem?.values.name.trim()) || !!problem}
              onClick={() => {
                const { p, values, nested } = editItem!
                setEditItem(null)
                void save(() => {
                  const e = entryOf(p)
                  if (hasName(e)) setText(e, 'name', values.name.trim(), e.firstElementChild)
                  for (const [k] of fieldsOf(e))
                    if (values[k].trim()) e.setAttribute(k, values[k].trim())
                    else e.removeAttribute(k)
                  setNested(e, nested)
                  p.setAttribute('state', 'edited')
                })
              }}
            >
              Save changes
            </button>
          </>
        }
      >
        {editItem && (
          <div className="grid2">
            {[...(editNamed ? [['name', 'Name'] as [string, string]] : []), ...editFields].map(([k, label]) => (
              <label key={k}>
                {label}
                <input
                  value={editItem.values[k]}
                  type={k === 'armor' ? 'number' : 'text'}
                  min={0}
                  onChange={e => setEditItem({ ...editItem, values: { ...editItem.values, [k]: e.target.value } })}
                />
              </label>
            ))}
          </div>
        )}
        {editItem?.nested.ranges && (
          <fieldset className="nested">
            <legend>Attribute ranges</legend>
            <table className="data">
              <thead>
                <tr>
                  <th>Attribute</th>
                  <th className="num">Min</th>
                  <th className="num">Max</th>
                </tr>
              </thead>
              <tbody>
                {editItem.nested.ranges.map((r, i) => (
                  <tr key={i}>
                    <td>{attrName(r.attr)}</td>
                    {(['min', 'max'] as const).map(k => (
                      <td key={k} className="num">
                        <input
                          type="number"
                          min={k === 'min' ? 0 : 1}
                          value={r[k]}
                          aria-label={`${attrName(r.attr)} ${k}`}
                          onChange={e => setNest({ ranges: editItem.nested.ranges!.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)) })}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </fieldset>
        )}
        {editItem?.nested.specs && (
          <fieldset className="nested">
            <legend>Specializations</legend>
            {editItem.nested.specs.length === 0 && <p className="muted">None yet.</p>}
            {editItem.nested.specs.map((s, i) => {
              const set = (v: Partial<typeof s>) => setNest({ specs: editItem.nested.specs!.map((x, j) => (j === i ? { ...x, ...v } : x)) })
              return (
                <div className="row" key={i}>
                  <input value={s.name} onChange={e => set({ name: e.target.value })} aria-label={`Specialization ${i + 1} name`} />
                  <select value={s.attr} onChange={e => set({ attr: e.target.value })} aria-label={`Specialization ${i + 1} attribute`}>
                    {ATTRS.map(a => (
                      <option key={a} value={a}>
                        {attrName(a)}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn small quiet"
                    aria-label={`Remove specialization ${i + 1}`}
                    onClick={() => setNest({ specs: editItem.nested.specs!.filter((_, j) => j !== i) })}
                  >
                    Remove
                  </button>
                </div>
              )
            })}
            <button
              className="btn small"
              onClick={() => setNest({ specs: [...editItem.nested.specs!, { id: '', attr: entryOf(editItem.p).getAttribute('attr') ?? 'agi', name: '' }] })}
            >
              Add a specialization
            </button>
          </fieldset>
        )}
        {problem && (
          <p className="err" role="alert">
            {problem}
          </p>
        )}
      </Modal>
    </main>
  )
}
