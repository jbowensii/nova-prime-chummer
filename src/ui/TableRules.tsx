// Table rules: the optional rules in play at this table. The seeds are the books' optional rules (rules entries with
// sheet="optional", e.g. the core rulebook's); the GM adds house rules of their own. The GM switches them on and off on the
// Table setup page (#/table; admin and editors; server/books.mjs PUT /api/table-rules, the server enforces the role);
// everyone reads custom/table-rules.xml (tablerules.xsd) and players see the ones switched on there, read only.
import { PageHeader } from './nav'
import { useEffect, useRef, useState } from 'react'
import type { Catalog, Rule } from '../model/types'
import { FREE_SINNER, type TableFlags } from '../engine'
import { newId } from '../model/types'
import { canEdit, send, useMe } from './auth'
import { Modal } from './bits'
import { useRepo } from './repo'
import { SourceLabel } from './SourceLabel'

/** A row of custom/table-rules.xml: a book's optional rule by its id, or a house rule with its own name and text. locked: the
 *  GM's switch binds every runner (no switch of its own on the Review tab). */
export interface TableRule { id: string; on: boolean; locked?: boolean; name?: string; text?: string }

/** The table rules as saved; [] when none are saved yet (or there is no server). */
export async function loadTableRules({ strict = false } = {}): Promise<TableRule[]> {
  const r = await fetch('./custom/table-rules.xml', { cache: 'no-cache' }).catch(() => null)
  if (strict && !r) throw new Error('the table rules couldn’t be fetched (network failure)')
  if (!r?.ok) {
    if (strict && r!.status !== 404) throw new Error(`the table rules couldn’t be fetched (status ${r!.status})`)
    return []
  }
  // a dev server or static host answers a missing file with index.html (200, not XML): nothing saved yet
  if (!/xml/i.test(r.headers.get('content-type') ?? '')) return []
  const doc = new DOMParser().parseFromString(await r.text(), 'text/xml')
  if (doc.documentElement.localName !== 'tablerules') {
    if (strict) throw new Error('the saved table rules file isn’t a table rules document')
    return []
  }
  return [...doc.documentElement.children].filter(e => e.localName === 'rule').map(e => {
    const name = e.getElementsByTagName('name')[0]?.textContent ?? undefined
    return { id: e.getAttribute('id') ?? '', on: e.getAttribute('on') === 'true', ...e.getAttribute('locked') === 'true' ? { locked: true } : {}, ...name ? { name, text: e.getElementsByTagName('text')[0]?.textContent ?? '' } : {} }
  })
}

/** The app's own switches, kept with the table rules by id (no name): on until the GM switches them off. */
export const APP_RULES = [
  { id: 'ca2.non-canon', flag: 'nonCanon', name: 'Non-canon content allowed',
    text: 'Published material that isn’t the official rules, marked Non-canon in the pickers. When off, a runner’s Review tab flags any it uses.' },
  { id: 'ca2.real-sin', flag: 'realSin', name: 'Real SINs allowed',
    text: 'Not a core rule: every runner already has a fake SIN. A player gives their runner a real SIN by adding the SINner quality on the Shadow Amps tab; a free Real SIN entry comes with it on the Gear tab. When off, a runner’s Review tab flags a real SIN.' },
] as const

/** The app's house rules: on until the GM switches them off; like a book's optional rule, a runner may set its own
 *  (Review tab) unless the GM locks it. */
export const HOUSE_RULES = [
  { id: FREE_SINNER, name: 'SINner free, never the first Quality',
    text: 'House rule (not in the books): the SINner quality costs nothing and never counts as the first Quality, so the next Quality is still the free first one. When off, a SINner is priced like any Quality.' },
] as const

/** The switches as the rule checks read them: the app's own, and the books' optional rules switched on (and the ones locked). */
export const tableFlags = (saved: TableRule[]) => {
  const books = saved.filter(r => r.name === undefined && !APP_RULES.some(a => a.id === r.id) && !HOUSE_RULES.some(h => h.id === r.id))
  const sinner = saved.find(r => r.id === FREE_SINNER)
  return {
    ...Object.fromEntries(APP_RULES.map(a => [a.flag, saved.find(r => r.id === a.id)?.on ?? true])),
    optional: books.filter(r => r.on).map(r => r.id), locked: [...books, ...sinner ? [sinner] : []].filter(r => r.locked).map(r => r.id),
    freeSinner: sinner?.on ?? true,
  } as unknown as TableFlags
}

/** The rules switched on, as the export writes them (the app's own switches and house rules aren't rules). */
export const tableRulesForExport = (c: Catalog, saved: TableRule[]) => saved.filter(r => r.on && !APP_RULES.some(a => a.id === r.id) && !HOUSE_RULES.some(h => h.id === r.id))
  .flatMap(r => r.name !== undefined ? [{ name: r.name, text: r.text ?? '' }]
    : c.rules.has(r.id) ? [{ name: c.rules.get(r.id)!.title, text: c.rules.get(r.id)!.text }] : [])

/** The books' optional rules, the seeds of the table rules. */
export const seeds = (c: Catalog) => [...c.rules.values()].filter(r => r.sheet === 'optional')

/** One row as shown: a seed (its catalog entry) or a house rule. */
type Row = { id: string; on: boolean; locked?: boolean; name: string; text: string; rule?: Rule; app?: true; house?: true }
function rows(c: Catalog, saved: TableRule[]): Row[] {
  const on = new Map(saved.map(r => [r.id, r]))
  return [...APP_RULES.map(a => ({ id: a.id, on: on.get(a.id)?.on ?? true, name: a.name, text: a.text, app: true as const })),
    ...HOUSE_RULES.map(h => ({ id: h.id, on: on.get(h.id)?.on ?? true, locked: !!on.get(h.id)?.locked, name: h.name, text: h.text, app: true as const, house: true as const })),
    ...seeds(c).map(rule => ({ id: rule.id, on: !!on.get(rule.id)?.on, locked: !!on.get(rule.id)?.locked, name: rule.title, text: rule.text, rule })),
    ...saved.filter(r => r.name !== undefined).map(r => ({ id: r.id, on: r.on, name: r.name!, text: r.text ?? '' }))]
}

/** The hover text of a rule's switch, in plain English: what it does, then where it comes from (the book and page, or "house
 *  rule"). A real import leaves a book rule's text empty (it is private), so the hover says where to read it. */
export const ruleHelp = (c: Catalog, r: { name: string; text: string; rule?: Rule }) => {
  const from = r.rule ? `${c.sources.get(r.rule.source)?.name ?? r.rule.source} p.${r.rule.page}` : 'house rule'
  const what = r.text.trim() || (r.rule ? `An optional rule from the books (${r.name}). Switching it on plays it as the book describes it.` : `A house rule of this table (${r.name}).`)
  return `${what} Source: ${from}.`
}
/** The Lock box beside a rule on Table setup. */
export const LOCK_HELP = 'Locks this rule at the setting above for every runner at the table: the runner’s Review tab no longer lets them set their own. Unlocked, a runner may choose On or Off for themselves. Source: house rule.'
/** The Native box beside a language on the Skills tab. */
export const NATIVE_HELP = 'Marks the language this runner grew up with as their native language: it costs nothing, one per runner. The books price every language as a knowledge skill. Source: house rule.'

const Cite = ({ c, row }: { c: Catalog; row: Row }) =>
  <span className="muted">{row.rule ? <SourceLabel c={c} source={row.rule.source} page={row.rule.page} id={row.rule.id} /> : row.app && !row.house ? 'App setting' : 'House rule'}</span>
const Text = ({ row }: { row: Row }) =>
  row.text ? <p>{row.text}</p> : row.rule ? <p className="muted">The description is in the book ({row.rule.source} p.{row.rule.page}).</p> : null

/** The players' page: the rules switched on, read only. */
/** Table setup (#/table): what this table plays with, apart from the books' Rules and Game data. The GMs switch the table
 *  rules here (TableRulesManager); players read the ones switched on. */
export function TableSetupScreen({ c }: { c: Catalog }) {
  if (!canEdit(useMe())) return <TableRulesScreen c={c} />
  return (
    <main className="lib">
      <PageHeader title="Table setup" />
      <p className="muted">How this table plays: the app’s switches, the books’ optional rules and your house rules. Players see the ones
        that are on, read only.</p>
      <TableRulesManager c={c} />
    </main>
  )
}

function TableRulesScreen({ c }: { c: Catalog }) {
  const [saved, setSaved] = useState<TableRule[] | null>(null)
  useEffect(() => { void loadTableRules().then(setSaved) }, [])
  const on = saved && rows(c, saved).filter(r => r.on)
  return (
    <main className="lib">
      <PageHeader title="Table setup" />
      <h2>Table rules</h2>
      <p className="muted">The optional rules and house rules your GM plays with.</p>
      {!on ? <p className="muted">Loading table rules…</p> : on.length === 0 ? <p>No table rules are switched on yet. Your GM switches them on.</p>
        : <ul className="table-rules">{on.map(r => <li key={r.id}><div className="head"><b>{r.name}</b> <Cite c={c} row={r} /></div><Text row={r} /></li>)}</ul>}
    </main>
  )
}

/** The GM's part of Table setup: switch rules on and off, add, edit and remove house rules. Every change saves at once. */
export function TableRulesManager({ c }: { c: Catalog }) {
  const repo = useRepo()
  const [saved, setSaved] = useState<TableRule[] | null>(null)
  const [msg, setMsg] = useState<{ text: string; err?: boolean; save?: boolean } | null>(null)
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
    const rules = [...next.map(r => r.rule ? { id: r.id, on: r.on, ...r.locked ? { locked: true } : {} } : r.app ? { id: r.id, on: r.on, ...r.locked ? { locked: true } : {} } : { id: r.id, on: r.on, name: r.name, text: r.text }), ...orphans]
    try {
      await send('table-rules', { rules }, 'PUT')
      latest.current = rules
      setSaved(rules)
      setMsg(m => m?.save ? m : { text: done(next) }) // an earlier save's error stays until dismissed
      return true
    } catch (e) {
      setMsg({ text: `Couldn’t save the table rules. ${(e as Error).message}`, err: true, save: true })
      return false
    }
  })
  const toggle = (row: Row) => save(rs => rs.map(r => r.id === row.id ? { ...r, on: !r.on } : r),
    rs => `${row.name} is ${rs.find(r => r.id === row.id)?.on ? 'on' : 'off'}.`)
  // a book's rule the GM locks binds every runner (Review tab: no switch of its own)
  const lock = (row: Row) => save(rs => rs.map(r => r.id === row.id ? { ...r, locked: !r.locked } : r),
    rs => `${row.name} is ${rs.find(r => r.id === row.id)?.locked ? 'locked: every runner plays it as set here' : 'unlocked: a runner may set its own'}.`)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const t = editing!, name = t.name!.trim()
    if (!name) return setMsg({ text: 'Give the house rule a name.', err: true })
    if (!msg?.save) setMsg(null)
    const row = { id: t.id, on: t.on, name, text: (t.text ?? '').trim() }
    if (await save(rs => rs.some(r => r.id === t.id) ? rs.map(r => r.id === t.id ? row : r) : [...rs, row], () => `Saved ${name}.`)) setEditing(null)
  }

  return (
    <section className="table-rules-gm" aria-labelledby="table-rules-title">
      <h2 id="table-rules-title">Table rules</h2>
      <p className="muted">Optional rules from your books and your own house rules. Players see the ones switched on here, read only.</p>
      {msg && !editing && <p className={msg.err ? 'banner bad' : 'banner'} role={msg.err ? 'alert' : 'status'}>{msg.text}
        {msg.save && <> <button className="btn small quiet" onClick={() => setMsg(null)}>Dismiss</button></>}</p>}
      {all.length === 0 && <p className="muted">No optional rules yet: they come with the core rulebook’s import. Add a house rule of your own.</p>}
      <ul className="table-rules">
        {all.map(r => <li key={r.id}><div className="head">
          <label className="switch" title={ruleHelp(c, r)}><input type="checkbox" role="switch" checked={r.on} onChange={() => void toggle(r)} /> <b>{r.name}</b></label>
          <Cite c={c} row={r} />
          {(r.rule || r.house) && <label className="muted small" title={LOCK_HELP}><input type="checkbox" checked={!!r.locked} onChange={() => void lock(r)} aria-label={`Lock ${r.name}`} /> Lock (runners can’t set their own)</label>}
          {!r.rule && !r.app && <span className="row">
            <button className="btn small quiet" onClick={() => setEditing({ id: r.id, on: r.on, name: r.name, text: r.text })} aria-label={`Edit ${r.name}`}>Edit</button>
            <button className="btn small quiet" onClick={() => setRemoving(r)} aria-label={`Remove ${r.name}`}>Remove</button></span>}
          </div><Text row={r} />
        </li>)}
      </ul>
      <button className="btn" onClick={() => { if (!msg?.save) setMsg(null); setEditing({ id: `house-${newId().replace(/[^a-z0-9]/gi, '').slice(0, 12).toLowerCase()}`, on: true, name: '', text: '' }) }}>Add a house rule</button>

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
