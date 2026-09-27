// The fixer's receipt: every nuyen spent, the balance, and the numbers you need at the table.
import { useState } from 'react'
import { activeEvents, packageGuide } from '../engine'
import { fmt, Line } from './bits'
import { useEditor } from './editor'

export function Receipt() {
  const { c, ch, d, v, p, balance, career } = useEditor()
  const [open, setOpen] = useState(false)
  const guide = ch.package !== 'free' ? packageGuide(c, ch.package) : undefined
  const pkg = c.packages.get(ch.package)
  const errors = v.filter(x => x.severity === 'error' && !x.approved).length
  const warnings = v.filter(x => x.severity === 'warning' && !x.approved).length
  const cats: [keyof typeof p & keyof NonNullable<typeof guide>, string][] = [['attributes', 'Attributes'], ['skills', 'Skills & knowledge'], ['amps', 'Shadow Amps'], ['gear', 'Gear'], ['spells', 'Spells']]
  const events = career ? activeEvents(ch) : []
  const earned = events.reduce((s, e) => s + (e.type === 'earn' ? e.amount : 0), 0)
  const spent = events.reduce((s, e) => s + ('cost' in e ? e.cost : 0), 0)
  const T = d.thresholds

  return (
    <aside className={`receipt${open ? ' open' : ''}`} aria-label="Nuyen and summary" onClick={() => setOpen(o => !o)}>
      <div className="peek"><span>{career ? 'Balance' : 'Left to spend'}</span><span className={balance < 0 ? 'err' : ''}>{fmt(balance)}</span></div>
      <div onClick={e => e.stopPropagation()}>
        <h2>{c.levels.get(ch.level)?.name ?? ch.level} build</h2>
        <div className="sub">{pkg ? `${pkg.name} package guide` : 'Free allocation'}, budget {fmt(p.budget)}</div>
        {cats.map(([k, label]) => <Line key={k} label={label} amount={fmt(p[k])} guide={guide ? fmt(guide[k]) : undefined} over={!!guide && p[k] > guide[k]} />)}
        <div className="total"><Line label="Creation total" amount={fmt(p.total)} /></div>
        {career ? (
          <>
            <Line label="Left at creation" amount={fmt(ch.finalRemaining ?? p.remaining)} />
            <Line label="Earned since" amount={fmt(earned)} />
            <Line label="Spent since" amount={fmt(spent)} />
            <div className={`left${balance < 0 ? ' neg' : ''}`}>{fmt(balance)}</div>
            <div className="muted">balance</div>
          </>
        ) : (
          <>
            <div className={`left${balance < 0 ? ' neg' : ''}`}>{fmt(balance)}</div>
            <div className="muted">{balance < 0 ? 'over budget' : 'left to spend'}</div>
          </>
        )}

        <div className="block">
          <Line label="Edge" amount={d.edge} />
          <Line label="Essence" amount={d.essence} />
          {d.essenceEffects.magicHitsCancelled > 0 && <div className="muted" style={{ fontSize: '0.85rem' }}>
            Cancels {d.essenceEffects.magicHitsCancelled} hit on magic Tests{d.essenceEffects.healingHitsCancelled ? `, ${d.essenceEffects.healingHitsCancelled} on healing` : ''}
          </div>}
          {d.initiative && <Line label="Initiative" amount={`${d.initiative.level}${d.initiative.realm ? ` (${d.initiative.realm})` : ''}`} />}
          {d.firewall != null && <Line label={d.emerged ? 'Living persona FW / Att' : 'Firewall / Attack'} amount={`${d.firewall} / ${d.attack}`} />}
          {d.mentalProtection > 0 && <Line label="Mental armor" amount={d.mentalProtection} />}
        </div>

        <div className="block">
          <h3>Wounds</h3>
          <div className="boxes" aria-label={`${d.monitor.light} light, ${d.monitor.serious} serious, 1 incapacitated`}>
            {Array.from({ length: d.monitor.light }, (_, i) => <span key={`l${i}`} />)}
            {Array.from({ length: d.monitor.serious }, (_, i) => <span key={`s${i}`} className="s" />)}
            <span className="i" />
          </div>
          <table className="thr" style={{ marginTop: '0.5rem' }}>
            <tbody>
              <tr className="muted"><td>Thresholds</td><td>L</td><td>S</td><td>I</td></tr>
              <tr><td>No armor</td>{T.physicalNone.map((x, i) => <td key={i}>{x}</td>)}</tr>
              {ch.build.mainArmor && <tr><td>Main armor</td>{T.physicalMain.map((x, i) => <td key={i}>{x}</td>)}</tr>}
              {ch.build.altArmor && <tr><td>Alternate</td>{T.physicalAlt.map((x, i) => <td key={i}>{x}</td>)}</tr>}
              <tr><td>Mental</td>{T.mental.map((x, i) => <td key={i}>{x}</td>)}</tr>
              {T.matrix && <tr><td>Matrix</td>{T.matrix.map((x, i) => <td key={i}>{x}</td>)}</tr>}
            </tbody>
          </table>
        </div>

        <a className="issues" href={`#/c/${ch.id}/review`}>
          {errors === 0 && warnings === 0 && <span className="ok">No rule problems</span>}
          {errors > 0 && <span className="err">{errors} rule {errors === 1 ? 'problem' : 'problems'}</span>}
          {errors > 0 && warnings > 0 && ', '}
          {warnings > 0 && <span className="warn">{warnings} {warnings === 1 ? 'note' : 'notes'}</span>}
        </a>
      </div>
    </aside>
  )
}
