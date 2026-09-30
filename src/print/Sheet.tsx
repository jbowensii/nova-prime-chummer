// Printable character sheet, laid out like the official Anarchy 2.0 sheet. Browser "Save as PDF" makes the PDF.
import { ampCtx, ampEssence, ampRating, knowledgeList, ruleHelp } from '../engine'
import { SourceLabel } from '../ui/SourceLabel'
import { ATTRS } from '../model/types'
import { useEditor } from '../ui/editor'
import { bdClass, printBackdrop } from '../ui/Portrait'
import { artSrc, useArtId } from '../ui/Background'
import { loadSettings, saveSettings, type Settings } from '../ui/settings'
import { useState } from 'react'
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
  const langs = shown('language'), know = shown('knowledge')
  // background art on the sheet: this browser's own switches (screen on, print off by default), the page's strength until set
  const artId = useArtId()
  const [s, setS] = useState(loadSettings)
  const set = (patch: Partial<Settings>) => { const next = { ...loadSettings(), ...patch }; setS(next); saveSettings(next) }
  const strength = s.sheetArtStrength ?? s.artStrength

  return (
    <div className="sheet-wrap">
      <div className="sheet-tools">
        <a className="btn" href={`#/c/${ch.id}/review`}>Back to editing</a>
        <button className="btn primary" onClick={() => print()}>Print or save as PDF</button>
        {artId && <fieldset className="sheet-art-tools">
          <legend className="sr-only">Background art on the sheet</legend>
          <label className="check"><input type="checkbox" checked={s.sheetArt === 'on'} onChange={e => set({ sheetArt: e.target.checked ? 'on' : 'off' })} />Background art</label>
          <label className="check"><input type="checkbox" checked={s.sheetArtPrint === 'on'} onChange={e => set({ sheetArtPrint: e.target.checked ? 'on' : 'off' })} />Print it</label>
          <label className="art-strength">Art strength
            <input type="range" min={0} max={100} step={5} value={strength} aria-valuetext={`${strength}%`} disabled={s.sheetArt === 'off' && s.sheetArtPrint === 'off'}
              onChange={e => set({ sheetArtStrength: Number(e.target.value) })} />
            <output>{strength}%</output>
          </label>
        </fieldset>}
      </div>
      <article className="sheet">
        {artId && <div className={`sheet-art${s.sheetArt === 'on' ? '' : ' no-screen'}${s.sheetArtPrint === 'on' ? '' : ' no-print'}`} aria-hidden="true"
          style={{ opacity: strength / 100 }}><div style={{ backgroundImage: `url("${artSrc(artId)}")` }} /></div>}
        <div className="s-top">
        <header className="s-head">
          <div><div className="s-label">Street name</div><h1>{name}</h1>
            <div className="s-role">{c.metatypes.get(ch.identity.metatype)?.name}{ch.narrative.keywords[2] ? `, ${ch.narrative.keywords[2]}` : ''}</div>
            {ch.identity.name && ch.identity.name !== name && <div className="s-small">{ch.identity.name}</div>}</div>
        </header>
        {ch.identity.portrait && <img className={`portrait${bdClass(printBackdrop(ch.identity.backdrop))}`} src={ch.identity.portrait} alt="" />}
        <section className="s-attrs">
          {ATTRS.map(a => <div key={a}><span>{c.attributes.get(a)?.name}</span><b>{b.attributes[a]}</b></div>)}
          <div><span>Edge</span><b>{d.edge}</b></div>
        </section>
        </div>

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
                {d.thresholds.matrix && <tr><td>{d.emerged ? 'Matrix & biofeedback' : 'Matrix'} (Firewall {d.firewall}){d.deckMonitor && (d.deckMonitor.light > 2 || d.deckMonitor.serious > 1) && <span className="s-small"> deck boxes {d.deckMonitor.light} light, {d.deckMonitor.serious} serious</span>}</td>{d.thresholds.matrix.map((x, i) => <td key={i}>{x}</td>)}</tr>}
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
                  <td>{ampEssence(c, a) || ''}</td><td><b>{ampRating(c, a, ampCtx(b, a, c))}</b></td>
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
              <tbody>{d.vehicles.map(v => <tr key={v.uid}><td><b>{v.count > 1 ? `${v.count}× ` : ''}{v.name}</b> <span className="s-small">({v.chassis}{v.flying ? ', flying' : ''}{v.monitor.light > 2 || v.monitor.serious > 1 ? `; wound boxes ${v.monitor.light} light, ${v.monitor.serious} serious` : ''})</span></td>
                <td>{v.pilot}</td><td>{v.body}</td><td>{v.handling}</td><td>{v.speed}</td><td>{v.armor}</td><td>{v.thresholds.join(' / ')}</td></tr>)}</tbody>
            </table>
          </section>
        )}

        <div className="s-cols">
          <section>
            <h2>Weapons</h2>
            <table className="s-weapons">
              <thead><tr><th>Weapon</th><th>DV</th><th>Ranges</th></tr></thead>
              <tbody>{d.weapons.map(w => <tr key={w.uid}>
                <td><b>{w.name}</b>{w.specialist && <span className="s-small"> (specialist)</span>}{w.note && <div className="s-small">{w.note}</div>}</td>
                <td><b>{w.dv}</b>{w.ammo && <div className="s-small">by ammo: {w.ammo.join(', ')}</div>}</td><td>{w.ranges}</td></tr>)}</tbody>
            </table>
            {spells.length > 0 && <>
              <h2>{spells.every(x => x.kind === 'spell') ? 'Spells' : spells.every(x => x.kind === 'complex-form') ? 'Complex forms' : 'Spells & complex forms'}</h2>
              <table className="s-spells"><tbody>
                {spells.map(x => { const cat = c.items.get(x.catalogId ?? '') ?? x.snapshot; return <tr key={x.uid}><td><b>{x.name}</b>{cat?.category && <span className="s-small"> ({cat.category})</span>}</td><td>{x.kind === 'spell' ? 'Spell' : 'Complex form'}</td></tr> })}
              </tbody></table>
            </>}
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
        <section className="s-know">
          <h2>Languages & knowledge</h2>
          <p className="s-small s-screen">Knowledge skills have no rating; the GM picks a Skill + Attribute, usually Logic, if a test is needed.</p>
          <div className="s-know-cols">
            <div><h3>Languages</h3>
              <ul className={langs.length > 6 ? 'two' : undefined}>{langs.map(k => <li key={k.key}>{k.name}{k.native && <span className="s-small"> (native)</span>}</li>)}</ul>
              {!langs.length && <p>—</p>}</div>
            <div><h3>Knowledge</h3>
              <ul className={know.length > 6 ? 'two' : undefined}>{know.map(k => <li key={k.key}>{k.name}</li>)}</ul>
              {!know.length && <p>—</p>}</div>
          </div>
        </section>
      </article>
    </div>
  )
}
