import { useState } from 'react'
import { currentBuild, makeAdvance, makeKnowledge, makeSpec, skillCost } from '../../engine'
import { fmt, Stepper } from '../bits'
import { useEditor } from '../editor'

export function SkillsTab() {
  const { c, ch, d, edit, record, career } = useEditor()
  const b = career ? currentBuild(ch) : ch.build
  const level = c.levels.get(ch.level)
  const [know, setKnow] = useState('')
  const entry = (id: string) => b.skills.find(s => s.id === id)

  const setRating = async (id: string, to: number) => {
    if (!career) return edit(x => {
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
    if (!career) return edit(x => { x.build.knowledge.push(name) })
    await record(makeKnowledge(c, name), `Knowledge skill: ${name}`)
  }

  return (
    <div className="stack">
      <h2>Skills</h2>
      <p className="muted">
        2,500¥ a point up to 5, then 5,000¥ a point up to 8. Specializations and knowledge skills cost 2,500¥ each and add +2 to the pool (CRB p.52, 83).
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
      <h2>Knowledge</h2>
      <p className="muted">Keywords and skills at rating 4+ already count as knowledge. Extra knowledge skills cost 2,500¥ each.</p>
      <div className="row">
        {b.knowledge.map((k, i) => (
          <span key={i} className="chip">{k}{!career && <button aria-label={`Remove ${k}`} onClick={() => edit(x => { x.build.knowledge.splice(i, 1) })}>×</button>}</span>
        ))}
        <input value={know} onChange={e => setKnow(e.target.value)} onKeyDown={e => e.key === 'Enter' && addKnowledge()} placeholder="Add knowledge, e.g. Language: Japanese" aria-label="New knowledge skill" />
        <button className="btn small" onClick={addKnowledge}>Add</button>
      </div>
      <p className="muted">Also known: {d.knowledge.filter(k => !b.knowledge.includes(k)).join(', ') || 'nothing yet'}.</p>
    </div>
  )
}
