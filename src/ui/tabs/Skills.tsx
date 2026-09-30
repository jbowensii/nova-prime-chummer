import { useState } from 'react'
import { currentBuild, knowledgeKey, knowledgeList, makeAdvance, makeKnowledge, makeSpec, skillCost, type KnowledgeRow } from '../../engine'
import type { Build, Catalog, Character, KnowledgeEntry } from '../../model/types'
import { fmt, Stepper } from '../bits'
import { useEditor } from '../editor'

/** Lowering a skill below 4 turns its renamed free entry into a paid one: the question to ask first, or null when
 *  nothing gets paid (an entry still named after the skill just goes away with the slot). */
export function lapseWarning(c: Catalog, b: Build, id: string, to: number): string | null {
  const from = b.skills.find(s => s.id === id)?.rating ?? 0
  const name = c.skills.get(id)?.name ?? id
  const k = b.knowledge.find(k => k.from === `skill:${id}`)
  if (from < 4 || to >= 4 || !k || k.name === name) return null
  return `With ${name} below 4, “${k.name}” is no longer free: it becomes a paid knowledge skill (${c.pricing.knowledge.toLocaleString('en-US')}¥). Lower ${name} anyway?`
}

/** A text field that commits on Enter or leaving it (career changes are ledger entries, not keystrokes). */
export function NameField({ value, label, onCommit }: { value: string; label: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value)
  const [was, setWas] = useState(value)
  if (value !== was) { setWas(value); setV(value) }
  const commit = () => { const t = v.trim(); if (t && t !== value) onCommit(t); else setV(value) }
  return <input value={v} aria-label={label} onChange={e => setV(e.target.value)} onBlur={commit} onKeyDown={e => e.key === 'Enter' && commit()} />
}

export function SkillsTab() {
  const { c, ch, d, edit, record, career } = useEditor()
  const b = career ? currentBuild(ch) : ch.build
  const level = c.levels.get(ch.level)
  const entry = (id: string) => b.skills.find(s => s.id === id)

  const setRating = async (id: string, to: number) => {
    const warn = career ? null : lapseWarning(c, b, id, to)
    if (warn && !confirm(warn)) return
    if (!career) return edit(x => {
      if (to < 4) x.build.knowledge = x.build.knowledge.filter(k => k.from !== `skill:${id}` || k.name !== c.skills.get(id)?.name)
      const s = x.build.skills.find(s => s.id === id)
      if (s) s.rating = to
      else x.build.skills.push({ id, rating: to, specs: [] })
    })
    await record(makeAdvance(c, ch, `skills.${id}`, to), `${c.skills.get(id)?.name} ${entry(id)?.rating ?? 0} → ${to}`)
  }
  const addSpec = async (id: string, spec: string) => {
    if (!spec) return
    if (spec === 'custom') {
      const name = prompt('Name the specialization (the GM should approve it):')?.trim()
      if (!name) return
      spec = `custom:${name}`
    }
    if (!career) return edit(x => {
      const s = x.build.skills.find(s => s.id === id)
      if (s) s.specs.push(spec)
      else x.build.skills.push({ id, rating: 0, specs: [spec] })
    })
    await record(makeSpec(c, id, spec), `New specialization for ${c.skills.get(id)?.name}`)
  }
  const removeSpec = (id: string, spec: string) => edit(x => { const s = x.build.skills.find(s => s.id === id)!; s.specs = s.specs.filter(z => z !== spec) })

  return (
    <div className="stack">
      <h2>Skills</h2>
      <p className="muted">
        {fmt(c.pricing.skillLow)} a point up to {c.pricing.skillLowMax}, then {fmt(c.pricing.skillHigh)} a point up to 8. Specializations cost {fmt(c.pricing.spec)} and add +2 to the pool; knowledge skills cost {fmt(c.pricing.knowledge)} each.
        {!career && level && ` ${level.name} caps skills at ${level.skillCap} during creation.`}
      </p>
      <div className="scroll-x"><table className="data">
        <thead><tr><th>Skill</th><th>Rating</th><th>Attr.</th><th className="num">Dice</th><th className="num">RR</th><th className="num hide-sm">Next point</th></tr></thead>
        <tbody>
          {[...c.skills.values()].map(sk => {
            const e = entry(sk.id)
            const r = e?.rating ?? 0
            const rows = d.pools.filter(p => p.skill === sk.id)
            const main = rows.find(p => !p.spec && p.attr === sk.attr)
            const base = rows.filter(p => !p.spec)
            const free = sk.specs.filter(s => !e?.specs.includes(s.id))
            return [
              <tr key={sk.id}>
                <td><b>{sk.name}</b>{sk.requires && <span className="muted"> ({sk.requires === 'awakened' ? 'Awakened' : 'cyberdeck'})</span>}</td>
                <td><Stepper label={sk.name} value={r} min={career ? r : 0} max={8} onChange={to => setRating(sk.id, to)} /></td>
                <td>{sk.attr.toUpperCase()}{sk.alt && <span className="muted">/{sk.alt.toUpperCase()}</span>}</td>
                <td className="num">{base.map(p => p.dp).join(' / ')}</td>
                <td className="num">{main?.rr || ''}</td>
                <td className="num hide-sm">{r < 8 ? fmt(skillCost(c.pricing, r, r + 1)) : ''}</td>
              </tr>,
              (e?.specs.length || r > 0) ? (
                <tr key={`${sk.id}-specs`} className="sub">
                  <td colSpan={6}>
                    <div className="row">
                      {e?.specs.map(sp => {
                        const pool = rows.find(p => p.spec === sp)
                        const custom = sp.startsWith('custom:')
                        return (
                          <span key={sp} className={`chip${custom ? ' custom' : ''}`}>
                            {sk.specs.find(s => s.id === sp)?.name ?? sp.slice(7)} {pool && <span className="muted">{pool.dp}{pool.rr ? ` RR${pool.rr}` : ''}</span>}
                            {!career && <button aria-label={`Remove ${sp}`} onClick={() => removeSpec(sk.id, sp)}>×</button>}
                          </span>
                        )
                      })}
                      <select value="" aria-label={`Add a ${sk.name} specialization`} onChange={e => addSpec(sk.id, e.target.value)}>
                        <option value="">+ specialization</option>
                        {free.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        <option value="custom">Custom…</option>
                      </select>
                    </div>
                  </td>
                </tr>
              ) : null,
            ]
          })}
        </tbody>
      </table></div>

      <hr className="sep" />
      <h2>Knowledge &amp; languages</h2>
      <p className="muted">Knowledge skills have no rating, and a language is a knowledge skill. Each keyword and each skill at 4+ gives a free one; rename a skill’s entry to anything related to it. Any other costs {fmt(c.pricing.knowledge)}. Each list runs A–Z; drag a row by its handle, or use its arrows, to set your own order. <b>Hide</b> leaves an entry off the printed sheet: it stays on the runner and still counts.</p>
      <KnowledgeList kind="knowledge" />
      <KnowledgeList kind="language" />
    </div>
  )
}

/** The player's order (build.knowledgeOrder) once one list, whose rows are `keys` in display order, moves `key` to
 *  position `to`; without a key, that list goes back to A–Z. The other list's keys stay. undefined: no order left. */
export function reorderKeys(order: string[] | undefined, keys: string[], key?: string, to = 0): string[] | undefined {
  const rest = (order ?? []).filter(k => !keys.includes(k))
  const list = key ? keys.filter(k => k !== key) : []
  if (key) list.splice(to, 0, key)
  const next = [...rest, ...list]
  return next.length ? next : undefined
}
/** A key added to or taken off a set kept as a list; undefined when it ends empty. */
export function toggleKey(list: string[] | undefined, key: string): string[] | undefined {
  const next = list?.includes(key) ? list.filter(k => k !== key) : [...list ?? [], key]
  return next.length ? next : undefined
}

/** One of the two Knowledge & languages lists. Order and hiding are the player's layout (either mode, no cost); the
 *  native mark is part of the build (creation only). */
function KnowledgeList({ kind }: { kind: KnowledgeEntry['kind'] }) {
  const { c, ch, d, edit, update, record, career } = useEditor()
  const b = career ? currentBuild(ch) : ch.build
  const [text, setText] = useState('')
  const [drag, setDrag] = useState<string | null>(null)
  const lang = kind === 'language'
  const order = b.knowledgeOrder ?? []
  const rows = knowledgeList(d.knowledge, kind, order)
  const keys = rows.map(r => r.key)
  const custom = rows.some(r => order.includes(r.key))
  const title = lang ? 'Languages' : 'Knowledge'
  const native = !career && lang && !d.knowledge.some(r => r.kind === 'language')

  const setOrder = (next: string[] | undefined) => update(x => { if (next) x.build.knowledgeOrder = next; else delete x.build.knowledgeOrder })
  const moveTo = (key: string, to: number) => setOrder(reorderKeys(b.knowledgeOrder, keys, key, to))
  const move = (i: number, by: -1 | 1) => {
    moveTo(keys[i], i + by)
    // the row moved: keep the keyboard on its button (the other one once it reaches an end)
    requestAnimationFrame(() => {
      const btn = (dir: number) => document.querySelector<HTMLButtonElement>(`[data-move="${CSS.escape(`${keys[i]}|${dir}`)}"]`)
      const b1 = btn(by)
      ;(b1 && !b1.disabled ? b1 : btn(-by))?.focus()
    })
  }
  const toggleHidden = (key: string) => update(x => {
    const h = toggleKey(x.build.knowledgeHidden, key)
    if (h) x.build.knowledgeHidden = h; else delete x.build.knowledgeHidden
  })
  /** a paid entry's key is its kind and name: a rename or kind change carries its place and visibility along */
  const rekey = (x: Character, from: string, to: string) => {
    for (const k of ['knowledgeOrder', 'knowledgeHidden'] as const) if (x.build[k]) x.build[k] = x.build[k]!.map(y => (y === from ? to : y))
  }

  const add = async () => {
    const name = text.trim()
    if (!name) return
    setText('')
    if (!career) return edit(x => { x.build.knowledge.push({ name, kind, ...(native && { native: true as const }) }) })
    await record(makeKnowledge(c, { name, kind }), `${lang ? 'Language' : 'Knowledge skill'}: ${name}`)
  }
  /** Rename or retype an entry. A free slot not stored yet is stored now; in career a slot change is a free ledger entry. */
  const change = async (r: KnowledgeRow, patch: Partial<KnowledgeEntry>) => {
    const next: KnowledgeEntry = { name: r.name, kind: r.kind, ...(r.from && { from: r.from }), ...(r.native && { native: true as const }), ...patch }
    if (next.kind !== 'language') delete next.native
    if (!career) return edit(x => {
      if (r.at >= 0) x.build.knowledge[r.at] = next; else x.build.knowledge.push(next)
      rekey(x, r.key, knowledgeKey(next))
    })
    if (r.from) await record(makeKnowledge(c, next, false), `${next.name}: ${r.source.toLowerCase()}, no cost`)
  }
  const setNative = (r: KnowledgeRow, on: boolean) => edit(x => {
    for (const k of x.build.knowledge) delete k.native // one native language at a time
    if (!on) return
    if (r.at >= 0) x.build.knowledge[r.at].native = true
    else x.build.knowledge.push({ name: r.name, kind: r.kind, ...(r.from && { from: r.from }), native: true })
  })
  const remove = (r: KnowledgeRow) => edit(x => {
    x.build.knowledge.splice(r.at, 1)
    for (const k of ['knowledgeOrder', 'knowledgeHidden'] as const) if (x.build[k]) x.build[k] = x.build[k]!.filter(y => y !== r.key)
  })
  const payFor = (r: KnowledgeRow) => record(makeKnowledge(c, { name: r.name, kind: r.kind, from: r.from }, true), `${r.name}: now a paid knowledge skill`)

  return (
    <section className="stack">
      <div className="row"><h3 style={{ margin: 0 }}>{title}</h3><span className="spacer" />
        {custom && <button className="btn small quiet" onClick={() => setOrder(reorderKeys(b.knowledgeOrder, keys))}>Sort A–Z</button>}
      </div>
      {lang && <p className="muted" style={{ margin: 0 }}>Mark one language <b>Native</b>: it’s free (one per runner), and the first language you add is marked for you. This is the app’s reading of the rules: the book’s knowledge skills cover foreign languages, so the one you grew up with isn’t bought.</p>}
      <div className="scroll-x"><table className="data knowledge" aria-label={title}>
        <thead><tr><th aria-label="Drag to reorder" /><th>Name</th><th>Type</th>{lang && <th>Native</th>}<th>Where it comes from</th><th aria-label="Actions" /></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={lang ? 6 : 5} className="muted">{lang ? 'None yet: add one below.' : 'None yet: add keywords, raise a skill to 4 or add one below.'}</td></tr>}
          {rows.map((r, i) => {
            const lapsed = r.paid && !!r.from
            const renamable = (!r.from?.startsWith('keyword:') || lapsed) && (!career || (!!r.from && !lapsed))
            return (
              <tr key={r.key} className={[r.hidden && 'dim', drag === r.key && 'dragging'].filter(Boolean).join(' ') || undefined}
                onDragOver={e => { if (drag) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' } }}
                onDrop={e => { e.preventDefault(); if (drag && drag !== r.key) moveTo(drag, i); setDrag(null) }}>
                <td className="grip-cell"><span className="grip" draggable title="Drag to reorder" data-key={r.key}
                  onDragStart={e => { e.dataTransfer.setData('text/plain', r.key); e.dataTransfer.effectAllowed = 'move'; setDrag(r.key) }}
                  onDragEnd={() => setDrag(null)}>⠿</span></td>
                <td>{renamable ? <NameField value={r.name} label={`Name of ${r.name}`} onCommit={name => change(r, { name })} /> : <b>{r.name}</b>}
                  {r.hidden && <span className="muted"> (hidden)</span>}</td>
                <td>{!career || (r.from && !lapsed)
                  ? <select value={r.kind} aria-label={`Type of ${r.name}`} onChange={e => change(r, { kind: e.target.value as KnowledgeEntry['kind'] })}>
                      <option value="knowledge">Knowledge</option><option value="language">Language</option>
                    </select>
                  : r.kind === 'language' ? 'Language' : 'Knowledge'}</td>
                {lang && <td>{career ? (r.native ? 'Native' : '') : <label className="check tight">
                  <input type="checkbox" checked={!!r.native} aria-label={`${r.name} is the native language`} onChange={e => setNative(r, e.target.checked)} /> <span>Native</span></label>}</td>}
                <td className={lapsed ? 'warn' : r.paid ? '' : 'muted'}>{r.source}{r.paid && ` · ${fmt(c.pricing.knowledge)}`}</td>
                <td className="actions">
                  <button className="btn small quiet" aria-label={`Move ${r.name} up`} data-move={`${r.key}|-1`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                  <button className="btn small quiet" aria-label={`Move ${r.name} down`} data-move={`${r.key}|1`} disabled={i === rows.length - 1} onClick={() => move(i, 1)}>↓</button>
                  <button className="btn small quiet" aria-label={`${r.hidden ? 'Show' : 'Hide'} ${r.name}`} onClick={() => toggleHidden(r.key)}>{r.hidden ? 'Show' : 'Hide'}</button>
                  {!career && r.paid && <button className="btn small" aria-label={`Remove ${r.name}`} onClick={() => remove(r)}>×</button>}
                  {career && lapsed && <button className="btn small" onClick={() => payFor(r)}>Pay for it</button>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table></div>
      <div className="row">
        <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder={lang ? 'e.g. Japanese' : 'e.g. Seattle gangs'} aria-label={lang ? 'New language' : 'New knowledge skill'} />
        <button className="btn small" onClick={add}>{lang ? 'Add language' : 'Add knowledge skill'} ({native ? 'native, free' : fmt(c.pricing.knowledge)})</button>
      </div>
    </section>
  )
}
