// Catalog edits (spec §2): edit any amp, item or rule, or add one under a house-rule source. Saves go to the
// server's edits layer (PUT /api/edits/:kind/:id → `importer edit set`), then the catalog reloads. Amps open
// the Amp Builder in catalog mode; items and rules a form. The Description box is always sent: empty (or
// the book's own text, unchanged) means "use the book's text".
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ampCtx, ampFromTemplate, ampRating, blankCharacter, entryXml } from '../engine'
import type { AmpEntry, AmpTemplate, Catalog, Item, ItemKind, Rule, Source, VehicleBase } from '../model/types'
import { because, canEdit, useMe } from './auth'
import { Modal } from './bits'
import { api } from './Books'
import { Editor, type EditorCtx } from './editor'
import { useRepo } from './repo'
import { AmpBuilder } from './tabs/AmpBuilder'

export type EditKind = 'amps' | 'items' | 'rules'
/** What the entry form makes: the edits layer's kinds, and (a compendium's) vehicles. */
export type FormKind = EditKind | 'vehicles'
type Target = { kind: EditKind; id?: string } // no id: add an entry
export type Entry = AmpTemplate | Item | Rule | VehicleBase

const OpenEdit = createContext<((t: Target) => void) | null>(null)
/** Opens the edit form; null when there's no server to save to (browser storage). */
export const useOpenEdit = () => useContext(OpenEdit)

const ITEM_KINDS: [ItemKind, string][] = [['gear', 'Gear'], ['weapon', 'Weapon'], ['armor', 'Armor'], ['spell', 'Spell'], ['complex-form', 'Complex form']]
const CATEGORIES: Partial<Record<ItemKind, string[]>> = { spell: ['combat', 'detection', 'health', 'illusion', 'manipulation'], 'complex-form': ['sustained', 'instant'] }
export const NOUN: Record<FormKind, string> = { amps: 'amp', items: 'item', rules: 'rule', vehicles: 'vehicle' }

// eslint-disable-next-line no-control-regex
const esc = (s: string) => s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
export const nameOf = (e: Entry) => 'title' in e ? e.title : e.name
const textOf = (e: Entry) => 'narrative' in e ? e.narrative : 'text' in e ? e.text : ''

/** How an entry stands in the edits layer. An edit whose book is gone has no original and no house-rule source. */
export function editState(c: Catalog, kind: EditKind, e: AmpTemplate | Item | Rule): 'book' | 'changed' | 'added' | 'orphan' {
  if (!e.edited) return 'book'
  if (c.original[kind].has(e.id)) return 'changed'
  return c.sources.get(e.source)?.origin === 'user' ? 'added' : 'orphan'
}
export const STATE_TEXT = { book: '', changed: 'Changed from the book', added: 'Added by you (house rule)', orphan: 'Orphaned edit (book removed)' }

export const EditedMark = () => <span className="edited" title="Changed in this app (Game data lists your edits)">Edited</span>

export function EditButton({ kind, id, name }: { kind: EditKind; id: string; name: string }) {
  const open = useOpenEdit()
  return open && <button type="button" className="btn small quiet" aria-label={`Edit ${name}`} onClick={() => open({ kind, id })}>Edit</button>
}

/** Holds the edit dialog for the whole app; `reload` fetches the catalog again after a save. */
export function CatalogEdits({ c, reload, children }: { c: Catalog; reload: () => Promise<void>; children: ReactNode }) {
  const repo = useRepo()
  const editor = canEdit(useMe()) // players see no Edit or Add buttons (the server refuses their edits too)
  const [target, setTarget] = useState<Target | null>(null)
  const [msg, setMsg] = useState('')
  // the one live region: in the topmost open dialog (a picker the edit was opened from; the page behind it is
  // inert), else on the page. Placed empty first, then filled, so the move doesn't swallow the announcement.
  const [live, setLive] = useState<{ host: Element | null; text: string }>({ host: null, text: '' })
  useEffect(() => { // runs after the edit dialog's own effect has closed it
    if (!msg) return setLive(l => ({ ...l, text: '' }))
    const host = [...document.querySelectorAll('dialog[open]')].pop() ?? null
    setLive({ host, text: '' })
    const show = setTimeout(() => setLive({ host, text: msg }), 50), hide = setTimeout(() => setMsg(''), 5000)
    return () => { clearTimeout(show); clearTimeout(hide) }
  }, [msg])
  const entry = target?.id ? c[target.kind].get(target.id) : undefined
  const done = async (text: string) => { await reload(); setTarget(null); setMsg(text) }
  // the edits layer: the entry without its text, the Description apart (empty: the book's)
  const put = (kind: EditKind) => async (e: Entry, desc: string) => {
    await api(`edits/${kind}/${encodeURIComponent(e.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/xml' },
      body: `<edit>${entryXml(kind, e as AmpTemplate | Item | Rule)}<description>${esc(desc)}</description></edit>` })
  }
  return (
    <OpenEdit.Provider value={repo.mode === 'server' && editor ? t => { setMsg(''); setTarget(t) } : null}>
      {children}
      {/* no role=status: pages keep their own single status region */}
      {(() => { const p = <p className={live.text ? 'toast' : 'sr-only'} aria-live="polite">{live.text}</p>; return live.host?.isConnected ? createPortal(p, live.host) : p })()}
      <Modal open={!!target} onClose={() => setTarget(null)} actions={<></>}
        title={entry ? `Edit ${nameOf(entry)}` : target ? `Add ${target.kind === 'items' ? 'an' : 'a'} ${NOUN[target.kind]}` : ''}>
        {target && <EntryForm key={`${target.kind} ${target.id}`} c={c} kind={target.kind} entry={entry} save={put(target.kind)} onDone={done} onCancel={() => setTarget(null)} />}
      </Modal>
    </OpenEdit.Provider>
  )
}

const slug = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'entry'

/** The form for one entry. `save` puts it (and its Description) where it belongs: the edits layer (CatalogEdits), or a
 *  compendium, which passes its own source as `sources` (no edit states, no new sources, the text is the GM's own). */
export function EntryForm({ c, kind, entry, sources, save: put, onDone, onCancel }: { c: Catalog; kind: FormKind; entry?: Entry; sources?: Source[]
  save: (e: Entry, description: string) => Promise<void>; onDone: (msg: string) => Promise<void>; onCancel: () => void }) {
  const edits = !sources && kind !== 'vehicles'
  const house = sources ?? [...c.sources.values()].filter(s => s.origin === 'user' && !s.canon)
  const state = edits && entry ? editState(c, kind, entry as AmpTemplate | Item | Rule) : 'added'
  const original = edits && entry && c.original[kind].get(entry.id)
  // the book's text: what an empty Description shows (an unedited entry's own text is the book's)
  const bookText = !edits ? '' : original ? textOf(original) : entry && !('edited' in entry && entry.edited) ? textOf(entry) : ''
  const [source, setSource] = useState(house[0]?.id ?? '')
  const [newSource, setNewSource] = useState({ id: '', name: '' })
  const [page, setPage] = useState(entry?.page ?? 1)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  // items and rules: the form's fields; amps: the type to start from (add) — the builder holds the rest
  const [item, setItem] = useState<Item>(() => kind === 'items' && entry ? { ...(entry as Item) }
    : { id: '', kind: 'gear', name: '', text: '', source: '', page: 1 })
  const [rule, setRule] = useState<Rule>(() => kind === 'rules' && entry ? { ...(entry as Rule) }
    : { id: '', sheet: 'house', section: '', title: '', effects: [], text: '', source: '', page: 1 })
  const [vehicle, setVehicle] = useState<VehicleBase>(() => kind === 'vehicles' && entry ? { ...(entry as VehicleBase) }
    : { id: '', name: '', pilot: 1, body: 1, handling: 1, speed: 1, armor: 0, mount: 'none', source: '', page: 1 })
  const [ampType, setAmpType] = useState('')
  const [desc, setDesc] = useState(entry ? textOf(entry) : '') // items and rules; the Amp Builder has its own box
  const [effectsText, setEffectsText] = useState(rule.effects.join(' '))
  const adding = !entry
  const src = adding ? (source === '+' ? newSource.id : source) : entry.source

  const newId = (name: string) => {
    const base = `${src.toLowerCase()}.${slug(name)}`
    let id = base
    for (let n = 2; c[kind].has(id); n++) id = `${base}-${n}`
    return id
  }

  async function save(e: Entry, description: string) {
    setBusy(true); setErr('')
    try {
      if (edits && adding && source === '+') {
        await api('edits/sources', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newSource) })
        setSource(newSource.id) // made: a retry after a refused entry doesn't make it again
      }
      await put(e, edits && description.trim() === bookText.trim() ? '' : description)
      await onDone(`${adding ? 'Added' : 'Saved'} ${nameOf(e)}.`)
    } catch (x) {
      setErr(`${because('Couldn’t save', (x as Error).message)} Fix it and save again.`)
      setBusy(false)
    }
  }
  async function drop() {
    const what = state === 'changed' ? `Restore the book’s version of ${nameOf(entry!)}? Your changes are lost.`
      : `Remove ${nameOf(entry!)} from the catalog? Runners that use it keep their copy.`
    if (!confirm(what)) return
    setBusy(true); setErr('')
    try {
      await api(`edits/${kind}/${encodeURIComponent(entry!.id)}`, { method: 'DELETE' })
      await onDone(state === 'changed' ? `Restored the book’s version of ${nameOf(entry!)}.` : `Removed ${nameOf(entry!)}.`)
    } catch (x) { setErr(because('Couldn’t remove it', (x as Error).message)); setBusy(false) }
  }

  const idOk = /^[A-Z][A-Z0-9-]{0,19}$/.test(newSource.id) && !c.sources.has(newSource.id)
  const sourceOk = !adding || (source === '+' ? idOk && !!newSource.name.trim() : !!source)
  const canSave = !busy && state !== 'orphan' && sourceOk && page >= 1

  const head = (
    <>
      {edits && entry && state !== 'book' ? (
        <div className="row editstate">
          <span className={state === 'orphan' ? 'warn' : 'muted'}>{STATE_TEXT[state]}</span><span className="spacer" />
          <button type="button" className="btn small" disabled={busy} onClick={() => void drop()}>
            {state === 'changed' ? 'Restore book version' : state === 'orphan' ? 'Remove edit' : 'Delete entry'}</button>
        </div>) : null}
      {state === 'orphan' && <p className="muted">The book this entry came from was removed, so the edit can’t be saved again. Remove it, or re-import the book.</p>}
      {adding && (
        <div className="grid2">
          {edits && <label>House-rule source
            <select value={source} onChange={e => setSource(e.target.value)}>
              {house.map(s => <option key={s.id} value={s.id}>{s.id}: {s.name}</option>)}
              <option value="+">New source…</option>
            </select>
          </label>}
          {edits && source === '+' && <>
            <label>Source id<input value={newSource.id} maxLength={20} placeholder="TABLE" aria-invalid={!!newSource.id && !idOk}
              aria-describedby={newSource.id && !idOk ? 'src-id-err' : undefined} onChange={e => setNewSource({ ...newSource, id: e.target.value.toUpperCase() })} /></label>
            <label>Source name<input value={newSource.name} maxLength={120} placeholder="Our table’s house rules" onChange={e => setNewSource({ ...newSource, name: e.target.value })} /></label>
          </>}
          <label>Page<input type="number" min={1} value={page} onChange={e => setPage(Math.max(1, Number(e.target.value) || 1))} /></label>
        </div>
      )}
      {adding && source === '+' && newSource.id && !idOk && <p className="err" id="src-id-err">
        {c.sources.has(newSource.id) ? `${newSource.id} is already a source; choose another id.` : 'A source id starts with a letter and uses only A–Z, 0–9 and hyphens.'}</p>}
      {adding && <p className="muted">New entries are house rules: marked Non-canon and cited as {src || 'the source'} p.{page}.</p>}
    </>
  )
  const name = kind === 'items' ? item.name : kind === 'vehicles' ? vehicle.name : rule.title
  // why Save is off (an orphan says so above)
  const why = busy || state === 'orphan' ? '' : !sourceOk ? (source === '+' ? 'Give the new source a valid id and a name to save.' : 'Choose a house-rule source to save.')
    : kind !== 'amps' && !name.trim() ? `Enter a ${kind === 'rules' ? 'title' : 'name'} to save.` : ''
  const foot = <>{why && <p className="muted">{why}</p>}<div role="alert">{err && <p className="err">{err}</p>}</div></>

  if (kind === 'amps') {
    const tpl = entry as AmpTemplate | undefined
    const build = blankCharacter('runner', 'human').build
    const start: AmpEntry | null = tpl ? ampFromTemplate(tpl, () => 'catalog').amp
      : ampType ? { uid: 'catalog', type: ampType, name: '', narrative: '', effects: [], vehicle: ampType === 'vehicle' ? 'small-drone' : undefined } : null
    const saveAmp = (a: AmpEntry) => {
      const same = tpl && JSON.stringify(tpl.effects) === JSON.stringify(a.effects)
      void save({ ...tpl, id: tpl?.id ?? newId(a.name), type: a.type, name: a.name, effects: a.effects,
        vehicle: a.vehicle, narrative: '', source: src, page: tpl?.page ?? page,
        printedRating: same ? tpl.printedRating : ampRating(c, a, ampCtx({ ...build, amps: [a] }, a)) }, a.narrative)
    }
    return (
      <div className="stack">
        {head}
        {adding && <label>Amp type
          <select value={ampType} onChange={e => setAmpType(e.target.value)}>
            <option value="">Choose a type…</option>{[...c.ampTypes.values()].map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select></label>}
        {start && <Editor.Provider value={{ c, career: false } as EditorCtx /* the builder reads only c and career */}>
          <AmpBuilder key={start.type} initial={start} build={build} catalog saveDisabled={!canSave} onSave={saveAmp} onCancel={onCancel} />
        </Editor.Provider>}
        {!start && <div className="actions"><button className="btn" onClick={onCancel}>Cancel</button></div>}
        {foot}
      </div>
    )
  }

  const submit = () => {
    const ref = { id: entry?.id ?? newId(name), source: src, page: entry?.page ?? page }
    void save(kind === 'items' ? { ...item, ...ref, name: item.name.trim(), text: '', armor: item.kind === 'armor' ? item.armor ?? 1 : item.armor }
      : kind === 'vehicles' ? { ...vehicle, ...ref, name: vehicle.name.trim(), mount: vehicle.mount.trim() }
      : { ...rule, ...ref, title: rule.title.trim(), effects: effectsText.split(/\s+/).filter(Boolean), text: '' }, kind === 'vehicles' ? '' : desc)
  }
  const num = (k: 'pilot' | 'body' | 'handling' | 'speed' | 'armor', label: string) =>
    <label>{label}<input type="number" min={0} value={vehicle[k]} onChange={e => setVehicle({ ...vehicle, [k]: Math.max(0, Number(e.target.value) || 0) })} /></label>
  const cats = CATEGORIES[item.kind]
  return (
    <form className="stack" onSubmit={e => { e.preventDefault(); if (canSave && name.trim()) submit() }}>
      {head}
      {kind === 'items' ? (
        <div className="grid2">
          <label>Name<input autoFocus value={item.name} onChange={e => setItem({ ...item, name: e.target.value })} /></label>
          {adding && <label>Kind<select value={item.kind} onChange={e => { const k = e.target.value as ItemKind
            setItem({ ...item, kind: k, category: undefined, dv: undefined, ranges: undefined, specialist: undefined, armor: k === 'armor' ? 1 : undefined }) }}>
            {ITEM_KINDS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>}
          {cats ? <label>Category<select value={item.category ?? ''} onChange={e => setItem({ ...item, category: e.target.value || undefined })}>
            <option value="">Choose…</option>{cats.map(x => <option key={x} value={x}>{x[0].toUpperCase() + x.slice(1)}</option>)}</select></label>
            : <label>Category (optional)<input value={item.category ?? ''} onChange={e => setItem({ ...item, category: e.target.value || undefined })} /></label>}
          {item.kind === 'weapon' && <>
            <label>Damage (DV)<input value={item.dv ?? ''} placeholder="STR+1" onChange={e => setItem({ ...item, dv: e.target.value || undefined })} /></label>
            <label>Ranges<input value={item.ranges ?? ''} placeholder="OK/-/-/-" onChange={e => setItem({ ...item, ranges: e.target.value || undefined })} /></label>
            <label className="check"><input type="checkbox" checked={!!item.specialist} onChange={e => setItem({ ...item, specialist: e.target.checked || undefined })} />Specialist weapon</label>
          </>}
          {item.kind === 'armor' && <label>Armor<input type="number" min={1} value={item.armor ?? 1} onChange={e => setItem({ ...item, armor: Math.max(1, Number(e.target.value) || 1) })} /></label>}
        </div>
      ) : kind === 'vehicles' ? (
        <div className="grid2">
          <label>Name<input autoFocus value={vehicle.name} onChange={e => setVehicle({ ...vehicle, name: e.target.value })} /></label>
          {num('pilot', 'Pilot')}{num('body', 'Body')}{num('handling', 'Handling')}{num('speed', 'Speed')}
          <label>Flying speed (optional)<input type="number" min={0} value={vehicle.flyingSpeed ?? ''}
            onChange={e => setVehicle({ ...vehicle, flyingSpeed: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0) })} /></label>
          {num('armor', 'Armor')}
          <label>Mount<input value={vehicle.mount} placeholder="none" onChange={e => setVehicle({ ...vehicle, mount: e.target.value })} /></label>
        </div>
      ) : (
        <div className="grid2">
          <label>Title<input autoFocus value={rule.title} onChange={e => setRule({ ...rule, title: e.target.value })} /></label>
          <label>Sheet<input value={rule.sheet} list="rule-sheets" onChange={e => setRule({ ...rule, sheet: e.target.value.toLowerCase() })} /></label>
          <datalist id="rule-sheets">{[...new Set([...c.rules.values()].map(r => r.sheet))].map(s => <option key={s} value={s} />)}</datalist>
          <label>Section<input value={rule.section} onChange={e => setRule({ ...rule, section: e.target.value })} /></label>
          <label>Amp effects it explains (ids)<input value={effectsText} placeholder="rr-spec" onChange={e => setEffectsText(e.target.value)} /></label>
        </div>
      )}
      {kind !== 'vehicles' && <label>Description<textarea value={desc} rows={6} onChange={e => setDesc(e.target.value)}
        placeholder={adding || bookText || !edits ? '' : 'Empty: the book’s text shows (when the book has one)'} /></label>}
      {foot}
      <div className="actions">
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn primary" disabled={!canSave || !name.trim() || (kind === 'vehicles' && !vehicle.mount.trim())}>{adding ? `Add ${NOUN[kind]}` : 'Save changes'}</button>
      </div>
    </form>
  )
}
