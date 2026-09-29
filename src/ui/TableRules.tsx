// Table rules: the optional rules in play at this table. The seeds are the books' optional rules (rules entries with
// sheet="optional", e.g. the core rulebook's); the GM adds house rules of their own. The GM switches them on and off on the
// Rules page (admin and editors; server/books.mjs PUT /api/table-rules, the server enforces the role); everyone reads
// custom/table-rules.xml (tablerules.xsd) and players see the ones switched on here.
import { useEffect, useRef, useState } from 'react'
import type { Catalog, Rule } from '../model/types'
import { newId } from '../model/types'
import { AccountMenu, send } from './auth'
import { Modal } from './bits'
import { useRepo } from './repo'
import { SettingsButton } from './settings'
import { SourceLabel } from './SourceLabel'

/** A row of custom/table-rules.xml: a book's optional rule by its id, or a house rule with its own name and text. */
export interface TableRule { id: string; on: boolean; name?: string; text?: string }

/** The table rules as saved; [] when none are saved yet (or there is no server). */
export async function loadTableRules(): Promise<TableRule[]> {
  const r = await fetch('./custom/table-rules.xml', { cache: 'no-cache' }).catch(() => null)
  if (!r?.ok) return []
  const doc = new DOMParser().parseFromString(await r.text(), 'text/xml')
  if (doc.documentElement.localName !== 'tablerules') return []
  return [...doc.documentElement.children].filter(e => e.localName === 'rule').map(e => {
    const name = e.getElementsByTagName('name')[0]?.textContent ?? undefined
    return { id: e.getAttribute('id') ?? '', on: e.getAttribute('on') === 'true', ...name ? { name, text: e.getElementsByTagName('text')[0]?.textContent ?? '' } : {} }
  })
}

/** The books' optional rules, the seeds of the table rules. */
export const seeds = (c: Catalog) => [...c.rules.values()].filter(r => r.sheet === 'optional')

/** One row as shown: a seed (its catalog entry) or a house rule. */
type Row = { id: string; on: boolean; name: string; text: string; rule?: Rule }
function rows(c: Catalog, saved: TableRule[]): Row[] {
  const on = new Map(saved.map(r => [r.id, r]))
  return [...seeds(c).map(rule => ({ id: rule.id, on: !!on.get(rule.id)?.on, name: rule.title, text: rule.text, rule })),
    ...saved.filter(r => r.name !== undefined).map(r => ({ id: r.id, on: r.on, name: r.name!, text: r.text ?? '' }))]
}

const Cite = ({ c, row }: { c: Catalog; row: Row }) =>
  <span className="muted">{row.rule ? <SourceLabel c={c} source={row.rule.source} page={row.rule.page} id={row.rule.id} /> : 'House rule'}</span>
const Text = ({ row }: { row: Row }) =>
  row.text ? <p>{row.text}</p> : row.rule ? <p className="muted">The description is in the book ({row.rule.source} p.{row.rule.page}).</p> : null

/** The players' page: the rules switched on, read only. */
export function TableRulesScreen({ c }: { c: Catalog }) {
  const [saved, setSaved] = useState<TableRule[] | null>(null)
  useEffect(() => { void loadTableRules().then(setSaved) }, [])
  const on = saved && rows(c, saved).filter(r => r.on)
  return (
    <main className="lib">
      <header>
        <div style={{ flex: 1 }}><a className="brand" href="#/">Chummer <b>Anarchy</b> 2.0</a><h1>Table rules</h1></div>
        <div className="row"><a className="btn quiet" href="#/">Your runners</a><SettingsButton /><AccountMenu /></div>
      </header>
      <p className="muted">The optional rules and house rules your GM plays with.</p>
      {!on ? <p className="muted">Loading table rules…</p> : on.length === 0 ? <p>No table rules are switched on yet. Your GM switches them on.</p>
        : <ul className="table-rules">{on.map(r => <li key={r.id}><div className="head"><b>{r.name}</b> <Cite c={c} row={r} /></div><Text row={r} /></li>)}</ul>}
    </main>
  )
}

/** The GM's part of the Rules page: switch rules on and off, add, edit and remove house rules. Every change saves at once. */
export function TableRulesManager({ c }: { c: Catalog }) {
  const repo = useRepo()
  const [saved, setSaved] = useState<TableRule[] | null>(null)
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null)
  const [editing, setEditing] = useState<TableRule | null>(null)
  const [removing, setRemoving] = useState<Row | null>(null)
  // saves go one at a time, each built from the list the one before it saved: two quick clicks both count
  const latest = useRef<TableRule[]>([]), queue = useRef(Promise.resolve(true))
  useEffect(() => { void loadTableRules().then(r => { latest.current = r; setSaved(r) }) }, [])
  if (repo.mode !== 'server') return <section className="table-rules-gm"><h2>Table rules</h2>
    <p className="muted">Table rules are kept on the server. This copy of the app runs without one, so they can’t be set here.</p></section>
  if (!saved) return null
  const all = rows(c, saved)

  /** Saves change(the rows as last saved), after any save still under way. */
  const save = (change: (rows: Row[]) => Row[], done: (rows: Row[]) => string) => queue.current = queue.current.then(async () => {
    const now = rows(c, latest.current), next = change(now)
    // a book's rule whose book is gone keeps its switch, for when the book comes back
    const orphans = latest.current.filter(s => s.name === undefined && !now.some(r => r.id === s.id))
    const rules = [...next.map(r => r.rule ? { id: r.id, on: r.on } : { id: r.id, on: r.on, name: r.name, text: r.text }), ...orphans]
    try {
      await send('table-rules', { rules }, 'PUT')
      latest.current = rules
      setSaved(rules)
      setMsg({ text: done(next) })
      return true
    } catch (e) {
      setMsg({ text: `Couldn’t save the table rules. ${(e as Error).message}`, err: true })
      return false
    }
  })
  const toggle = (row: Row) => save(rs => rs.map(r => r.id === row.id ? { ...r, on: !r.on } : r),
    rs => `${row.name} is ${rs.find(r => r.id === row.id)?.on ? 'on' : 'off'}.`)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const t = editing!, name = t.name!.trim()
    if (!name) return setMsg({ text: 'Give the house rule a name.', err: true })
    const row = { id: t.id, on: t.on, name, text: (t.text ?? '').trim() }
    if (await save(rs => rs.some(r => r.id === t.id) ? rs.map(r => r.id === t.id ? row : r) : [...rs, row], () => `Saved ${name}.`)) setEditing(null)
  }

  return (
    <section className="table-rules-gm" aria-labelledby="table-rules-title">
      <h2 id="table-rules-title">Table rules</h2>
      <p className="muted">Optional rules from your books and your own house rules. Players see the ones switched on under Table rules.</p>
      {msg && !editing && <p className={msg.err ? 'banner bad' : 'banner'} role={msg.err ? 'alert' : 'status'}>{msg.text}</p>}
      {all.length === 0 && <p className="muted">No optional rules yet: they come with the core rulebook’s import. Add a house rule of your own.</p>}
      <ul className="table-rules">
        {all.map(r => <li key={r.id}><div className="head">
          <label className="switch"><input type="checkbox" role="switch" checked={r.on} onChange={() => void toggle(r)} /> <b>{r.name}</b></label>
          <Cite c={c} row={r} />
          {!r.rule && <span className="row">
            <button className="btn small quiet" onClick={() => setEditing({ id: r.id, on: r.on, name: r.name, text: r.text })} aria-label={`Edit ${r.name}`}>Edit</button>
            <button className="btn small quiet" onClick={() => setRemoving(r)} aria-label={`Remove ${r.name}`}>Remove</button></span>}
          </div><Text row={r} />
        </li>)}
      </ul>
      <button className="btn" onClick={() => { setMsg(null); setEditing({ id: `house-${newId().replace(/[^a-z0-9]/gi, '').slice(0, 12).toLowerCase()}`, on: true, name: '', text: '' }) }}>Add a house rule</button>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={all.some(r => r.id === editing?.id) ? 'Edit house rule' : 'Add a house rule'}
        actions={<><button className="btn" onClick={() => setEditing(null)}>Cancel</button><button className="btn primary" form="ca2-house">Save house rule</button></>}>
        {editing && <form id="ca2-house" className="stack" onSubmit={e => void submit(e)}>
          <label>Name<input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} required maxLength={120} autoFocus /></label>
          <label>Description<textarea value={editing.text} onChange={e => setEditing({ ...editing, text: e.target.value })} maxLength={4000} rows={5} /></label>
          {msg?.err && <p className="err" role="alert">{msg.text}</p>}
        </form>}
      </Modal>
      <Modal open={!!removing} onClose={() => setRemoving(null)} title={`Remove ${removing?.name ?? 'this house rule'}?`}
        actions={<><button className="btn" onClick={() => setRemoving(null)}>Keep</button>
          <button className="btn danger" onClick={async () => { const r = removing!; setRemoving(null); await save(rs => rs.filter(x => x.id !== r.id), () => `Removed ${r.name}.`) }}>Remove house rule</button></>}>
        <p>Players stop seeing it. This can’t be undone.</p>
      </Modal>
    </section>
  )
}
