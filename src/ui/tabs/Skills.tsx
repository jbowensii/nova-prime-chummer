import { useState } from 'react'
import { currentBuild, makeAdvance, makeKnowledge, makeSpec, skillCost, type KnowledgeRow } from '../../engine'
import type { Build, Catalog, KnowledgeEntry } from '../../model/types'
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
function NameField({ value, label, onCommit }: { value: string; label: string; onCommit: (v: string) => void }) {
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
  const [know, setKnow] = useState('')
  const [kind, setKind] = useState<KnowledgeEntry['kind']>('knowledge')
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
  const addKnowledge = async () => {
    const name = know.trim()
    if (!name) return
    setKnow('')
    if (!career) return edit(x => { x.build.knowledge.push({ name, kind }) })
    await record(makeKnowledge(c, { name, kind }), `${kind === 'language' ? 'Language' : 'Knowledge skill'}: ${name}`)
  }
  /** Rename or retype an entry. A free slot not stored yet is stored now; in career a slot change is a free ledger entry. */
  const change = async (r: KnowledgeRow, patch: Partial<KnowledgeEntry>) => {
    const next: KnowledgeEntry = { name: r.name, kind: r.kind, ...(r.from && { from: r.from }), ...patch }
    if (!career) return edit(x => { if (r.at >= 0) x.build.knowledge[r.at] = next; else x.build.knowledge.push(next) })
    if (r.from) await record(makeKnowledge(c, next, false), `${next.name}: ${r.source.toLowerCase()}, no cost`)
  }
  const payFor = (r: KnowledgeRow) => record(makeKnowledge(c, { name: r.name, kind: r.kind, from: r.from }, true), `${r.name}: now a paid knowledge skill`)
  const rows = d.knowledge

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
      <p className="muted">Knowledge skills have no rating, and a language is a knowledge skill. Each keyword and each skill at 4+ gives a free one; rename a skill’s entry to anything related to it. Any other costs {fmt(c.pricing.knowledge)}.</p>
      <div className="scroll-x"><table className="data knowledge">
        <thead><tr><th>Name</th><th>Type</th><th>Where it comes from</th><th aria-label="Actions" /></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={4} className="muted">None yet: add keywords, raise a skill to 4 or add one below.</td></tr>}
          {rows.map(r => {
            const lapsed = r.paid && !!r.from
            const renamable = (!r.from?.startsWith('keyword:') || lapsed) && (!career || (!!r.from && !lapsed))
            return (
              <tr key={r.from ?? `paid-${r.at}`}>
                <td>{renamable ? <NameField value={r.name} label={`Name of ${r.name}`} onCommit={name => change(r, { name })} /> : <b>{r.name}</b>}</td>
                <td>{!career || (r.from && !lapsed)
                  ? <select value={r.kind} aria-label={`Type of ${r.name}`} onChange={e => change(r, { kind: e.target.value as KnowledgeEntry['kind'] })}>
                      <option value="knowledge">Knowledge</option><option value="language">Language</option>
                    </select>
                  : r.kind === 'language' ? 'Language' : 'Knowledge'}</td>
                <td className={lapsed ? 'warn' : r.paid ? '' : 'muted'}>{r.source}{r.paid && ` · ${fmt(c.pricing.knowledge)}`}</td>
                <td>
                  {!career && r.paid && <button className="btn small" aria-label={`Remove ${r.name}`} onClick={() => edit(x => { x.build.knowledge.splice(r.at, 1) })}>×</button>}
                  {career && lapsed && <button className="btn small" onClick={() => payFor(r)}>Pay for it</button>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table></div>
      <div className="row">
        <input value={know} onChange={e => setKnow(e.target.value)} onKeyDown={e => e.key === 'Enter' && addKnowledge()} placeholder={kind === 'language' ? 'e.g. Japanese' : 'e.g. Seattle gangs'} aria-label="New knowledge skill or language" />
        <select value={kind} aria-label="Type of the new entry" onChange={e => setKind(e.target.value as KnowledgeEntry['kind'])}>
          <option value="knowledge">Knowledge</option><option value="language">Language</option>
        </select>
        <button className="btn small" onClick={addKnowledge}>Add ({fmt(c.pricing.knowledge)})</button>
      </div>
    </div>
  )
}
