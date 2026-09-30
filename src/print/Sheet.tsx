// Printable character sheet, laid out like the official Anarchy 2.0 sheet. Browser "Save as PDF" makes the PDF.
import { ampCtx, ampEssence, ampRating, knowledgeList, ruleHelp } from '../engine'
import { SourceLabel } from '../ui/SourceLabel'
import { ATTRS } from '../model/types'
import { useEditor } from '../ui/editor'
import { bdClass, printBackdrop } from '../ui/Portrait'
import './sheet.css'

const RISK = [['1 die', '2 dice', '4 dice', '6+ dice'], ['3 dice', '5 dice', '7 dice', '10+ dice'], ['5 dice', '8 dice', '11 dice', '13+ dice'], ['8 dice', '12 dice', '15 dice', 'N/A']]

export function Sheet() {
  const { c, ch, d, balance } = useEditor()
  const b = d.build
  const name = ch.identity.streetName || ch.identity.name || 'Unnamed runner'
  const item = (uid?: string) => b.items.find(i => i.uid === uid)
  const effectText = (ref: string, param?: string, value?: number, n = 1) => {
    const def = c.ampEffects.get(ref)
    const skill = param && (c.skills.get(param)?.name ?? (() => { const s = c.skills.get(param.split('.')[0]); const sp = s?.specs.find(x => x.id === param); return sp && `${s!.name} (${sp.name})` })())
    const who = skill || (param && (c.attributes.get(param as never)?.name ?? param.replace(/^custom:/, '')))
    if (ref === 'rr-spec' || ref === 'rr-skill' || ref === 'rr-attr') return `RR ${n} on ${who ?? '(to choose)'} Tests`
    if (ref === 'negative') return `Drawback (−${value ?? 1})`
    return `${def?.name ?? ref}${param && ref !== 'narrative' ? `: ${param}` : ''}`
  }
  const spells = b.items.filter(i => i.kind === 'spell' || i.kind === 'complex-form')
  // in the player's order, hidden rows left off
  const shown = (kind: 'knowledge' | 'language') => knowledgeList(d.knowledge, kind, b.knowledgeOrder).filter(k => !k.hidden)
  const gear = b.items.filter(i => i.kind === 'gear' || (i.kind === 'armor' && i.uid !== b.mainArmor && i.uid !== b.altArmor))

  return (
    <div className="sheet-wrap">
      <div className="sheet-tools">
        <a className="btn" href={`#/c/${ch.id}/review`}>Back to editing</a>
        <button className="btn primary" onClick={() => print()}>Print or save as PDF</button>
      </div>
      <article className="sheet">
        <header className="s-head">
          <div><div className="s-label">Street name</div><h1>{name}</h1>
            <div className="s-role">{c.metatypes.get(ch.identity.metatype)?.name}{ch.narrative.keywords[2] ? `, ${ch.narrative.keywords[2]}` : ''}</div>
            {ch.identity.name && ch.identity.name !== name && <div className="s-small">{ch.identity.name}</div>}</div>
          {ch.identity.portrait && <img className={`portrait${bdClass(printBackdrop(ch.identity.backdrop))}`} src={ch.identity.portrait} alt="" />}
        </header>

        <section className="s-attrs">
          {ATTRS.map(a => <div key={a}><span>{c.attributes.get(a)?.name}</span><b>{b.attributes[a]}</b></div>)}
          <div><span>Edge</span><b>{d.edge}</b></div>
        </section>

        <div className="s-cols">
          <section>
            <h2>Skills</h2>
            <table>
              <thead><tr><th>Skill</th><th>Rating</th><th>+Att.</th><th>= DP</th><th>RR</th></tr></thead>
              <tbody>
                {d.pools.map((p, i) => (
                  <tr key={i} className={p.spec || (i > 0 && d.pools[i - 1].skill === p.skill) ? 'spec' : ''}>
                    <td>{p.spec ? `(${p.label.replace(/^.*\(|\)$/g, '')} +2)` : i > 0 && d.pools[i - 1].skill === p.skill && !d.pools[i - 1].spec ? `(with ${p.attr.toUpperCase()})` : p.label}</td>
                    <td>{p.spec || (i > 0 && d.pools[i - 1].skill === p.skill) ? '' : p.rating}</td><td>{p.attr.toUpperCase()}</td><td><b>{p.dp}</b></td><td>{p.rr || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3>Languages</h3>
            <p>{shown('language').map(k => k.native ? `${k.name} (native)` : k.name).join(', ') || '—'}</p>
            <h3>Knowledge skills</h3>
            <p>{shown('knowledge').map(k => k.name).join(', ') || '—'}</p>
          </section>

          <section>
            <h2>Wounds</h2>
            <div className="s-boxes">
              {Array.from({ length: d.monitor.light }, (_, i) => <span key={`l${i}`} title="Light" />)}
              {Array.from({ length: d.monitor.serious }, (_, i) => <span key={`s${i}`} className="s" title="Serious" />)}
              <span className="i" title="Incapacitated" />
            </div>
            <table>
              <thead><tr><th>Thresholds</th><th>Light</th><th>Serious</th><th>Incap.</th></tr></thead>
              <tbody>
                <tr><td>No armor</td>{d.thresholds.physicalNone.map((x, i) => <td key={i}>{x}</td>)}</tr>
                {b.mainArmor && <tr><td>Main armor ({item(b.mainArmor)?.name} {d.armor.main})</td>{d.thresholds.physicalMain.map((x, i) => <td key={i}>{x}</td>)}</tr>}
                {b.altArmor && <tr><td>Alternate ({item(b.altArmor)?.name} {d.armor.alt})</td>{d.thresholds.physicalAlt.map((x, i) => <td key={i}>{x}</td>)}</tr>}
                <tr><td>Mental{d.mentalProtection ? ` (armor ${d.mentalProtection})` : ''}</td>{d.thresholds.mental.map((x, i) => <td key={i}>{x}</td>)}</tr>
                {d.thresholds.matrix && <tr><td>{d.emerged ? 'Matrix & biofeedback' : 'Matrix'} (Firewall {d.firewall})</td>{d.thresholds.matrix.map((x, i) => <td key={i}>{x}</td>)}</tr>}
              </tbody>
            </table>

            <h2>Risk</h2>
            <table className="s-risk">
              <thead><tr><th>RR</th><th>Low</th><th>Normal</th><th>High</th><th>Extreme</th></tr></thead>
              <tbody>{RISK.map((r, i) => <tr key={i}><td>{i}</td>{r.map((x, j) => <td key={j}>{x}</td>)}</tr>)}</tbody>
            </table>
            <p className="s-small">Remaining 1s: 0 = no effect; 1 = minor glitch; 2 = critical glitch; 3+ = disaster.</p>

            <h2>Essence {d.essence}</h2>
            <p className="s-small">Cancelled hits on magic Tests: {d.essenceEffects.magicHitsCancelled}. On healing: {d.essenceEffects.healingHitsCancelled}.
              {d.essenceEffects.socialDisadvantage && ' Disadvantage on most social Tests.'}</p>
            {d.initiative && <p className="s-small">Initiative enhancement {d.initiative.level}{d.initiative.realm ? ` (${d.initiative.realm} only)` : ''}: {d.initiative.source}.</p>}
          </section>
        </div>

        <section>
          <h2>Shadow Amps</h2>
          <table>
            <thead><tr><th>Amp</th><th className="s-src">Source</th><th>Essence</th><th>Rating</th></tr></thead>
            <tbody>
              {b.amps.map(a => (
                <tr key={a.uid}>
                  <td><b>{a.name}</b> {!a.name.toLowerCase().includes(a.type) && <span className="s-small">({c.ampTypes.get(a.type)?.name.toLowerCase()})</span>}
                    {a.narrative && <div className="s-small">{a.narrative}</div>}
                    {[...a.effects.filter(e => e.ref !== 'narrative' || e.param).reduce((m, e) => { const k = `${e.ref}|${e.param}|${e.value}`; m.set(k, [e, (m.get(k)?.[1] ?? 0) + 1]); return m }, new Map<string, [typeof a.effects[number], number]>()).values()]
                      .map(([e, n], i) => <div key={i} className="s-small" title={ruleHelp(c, e.ref)}>{effectText(e.ref, e.param, e.value, n)}{!e.ref.startsWith('rr-') && n > 1 ? ` ×${n}` : ''}</div>)}
                  </td>
                  <td className="s-src">{(t => t ? <SourceLabel c={c} source={t.source} page={t.page} id={t.id} /> : <SourceLabel builtByYou />)(a.catalogId ? c.amps.get(a.catalogId) ?? a.snapshot : undefined)}</td>
                  <td>{ampEssence(c, a) || ''}</td><td><b>{ampRating(c, a, ampCtx(b, a))}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {d.vehicles.length > 0 && (
          <section>
            <h2>Vehicles & drones</h2>
            <table>
              <thead><tr><th>Vehicle</th><th>Pilot</th><th>Body</th><th>Handling</th><th>Speed</th><th>Armor</th><th>Damage L/S/I</th></tr></thead>
              <tbody>{d.vehicles.map(v => <tr key={v.uid}><td><b>{v.count > 1 ? `${v.count}× ` : ''}{v.name}</b> <span className="s-small">({v.chassis}{v.flying ? ', flying' : ''})</span></td>
                <td>{v.pilot}</td><td>{v.body}</td><td>{v.handling}</td><td>{v.speed}</td><td>{v.armor}</td><td>{v.thresholds.join(' / ')}</td></tr>)}</tbody>
            </table>
          </section>
        )}

        <div className="s-cols">
          <section>
            <h2>Weapons & spells</h2>
            <table><tbody>
              {d.weapons.map(w => <tr key={w.uid}><td><b>{w.name}</b> DV {w.dv} [{w.ranges}]{w.note && <span className="s-small"> ({w.note})</span>}</td><td>{w.specialist ? 'Spec. weapon' : 'Weapon'}</td></tr>)}
              {spells.map(s => { const cat = c.items.get(s.catalogId ?? '') ?? s.snapshot; return <tr key={s.uid}><td><b>{s.name}</b>{cat?.category && <span className="s-small"> ({cat.category})</span>}</td><td>{s.kind === 'spell' ? 'Spell' : 'Complex form'}</td></tr> })}
            </tbody></table>
            <h2>Equipment</h2>
            <p>{gear.map(g => g.note ? `${g.name} (${g.note})` : g.name).join(', ') || '—'}.</p>
            <h2>Nuyen</h2>
            <p>{ch.finalizedAt ? balance.toLocaleString('en-US') : (balance > 0 ? balance : 0).toLocaleString('en-US')}¥</p>
          </section>
          <section>
            <h2>Keywords</h2>
            <p>{ch.narrative.keywords.filter(Boolean).join(', ') || '—'}</p>
            <p className="s-small">Lifestyle: {c.lifestyles.get(ch.identity.lifestyle ?? 'low')?.name ?? 'Low'}</p>
            <h2>Dispositions</h2>
            <ul>{ch.narrative.dispositions.filter(Boolean).map((x, i) => <li key={i}>{x}</li>)}</ul>
            <h2>Cues</h2>
            <ul>{ch.narrative.cues.filter(Boolean).map((x, i) => <li key={i}>{x}</li>)}</ul>
          </section>
        </div>
        {ch.identity.background && <section><h2>Background</h2><p>{ch.identity.background}</p></section>}
      </article>
    </div>
  )
}
