// The fixer's receipt: every nuyen spent, the balance, and the numbers you need at the table.
import { AnarchyRef } from './AnarchyRef'
import { useEffect, useRef, useState } from 'react'
import { activeEvents, bracketed, itemCost, packageGuide, sinceFinalize, voidedIds } from '../engine'
import type { Character, Pricing } from '../model/types'
import { fmt, Line } from './bits'
import { useEditor } from './editor'

/** "+2,500¥: Ares Predator added; −2,500¥: Fake SIN removed": what the last change to the items cost or gave back. */
export function itemChange(pricing: Pricing, before: Character['build']['items'], after: Character['build']['items']): string {
  const cost = (i: typeof before[number]) => itemCost(pricing, i)
  return [...after.filter(i => !before.some(j => j.uid === i.uid)).map(i => [cost(i), `${i.name} added`] as const),
    ...before.filter(i => !after.some(j => j.uid === i.uid)).map(i => [-cost(i), `${i.name} removed`] as const)]
    .filter(([n]) => n !== 0).map(([n, t]) => `${n > 0 ? '+' : '−'}${fmt(Math.abs(n))}: ${t}`).join('; ')
}

export function Receipt() {
  const { c, ch, d, v, p, balance, career } = useEditor()
  const [open, setOpen] = useState(false)
  // a creation build's items changed: say what it cost or gave back, for a few seconds (the total alone can hide a refund)
  const [note, setNote] = useState('')
  const last = useRef({ id: ch.id, items: ch.build.items })
  useEffect(() => {
    const before = last.current
    last.current = { id: ch.id, items: ch.build.items }
    if (before.id !== ch.id || before.items === ch.build.items) return
    const msg = itemChange(c.pricing, before.items, ch.build.items)
    if (!msg) return
    setNote(msg)
    const t = setTimeout(() => setNote(''), 6000)
    return () => clearTimeout(t)
  }, [c, ch.id, ch.build.items])
  const over = !career && balance < 0
  const guide = ch.package !== 'free' ? packageGuide(c, ch.package) : undefined
  const pkg = c.packages.get(ch.package)
  const errors = v.filter(x => x.severity === 'error' && !x.approved).length
  const warnings = v.filter(x => x.severity === 'warning' && !x.approved).length
  const cats: [keyof typeof p & keyof NonNullable<typeof guide>, string][] = [['attributes', 'Attributes'], ['skills', 'Skills & knowledge'], ['amps', 'Shadow Amps'], ['gear', 'Gear'], ['spells', 'Spells']]
  const events = career ? activeEvents(ch) : []
  const earned = events.reduce((s, e) => s + (e.type === 'earn' ? e.amount : 0), 0)
  const voided = voidedIds(ch)
  const changed = sinceFinalize(ch).reduce((s, e) => s + (!voided.has(e.id) && e.type !== 'earn' && 'cost' in e ? e.cost : 0), 0)
  const T = d.thresholds

  return (
    <aside className={`receipt${open ? ' open' : ''}`} aria-label="Nuyen and summary" onClick={() => setOpen(o => !o)}>
      <div className="peek"><span>{career ? 'Balance' : over ? 'Over budget by' : 'Left to spend'}</span><span className={balance < 0 ? 'err' : ''}>{fmt(over ? -balance : balance)}</span></div>
      <div onClick={e => e.stopPropagation()}>
        <h2>{c.levels.get(ch.level)?.name ?? ch.level} build</h2>
        <div className="sub">{pkg ? <><AnarchyRef kind="packages" id={pkg.id}>{pkg.name}</AnarchyRef> package guide</> : 'Free allocation'}, budget {fmt(p.budget)}</div>
        {cats.map(([k, label]) => <Line key={k} label={label} amount={fmt(p[k])} guide={guide ? fmt(guide[k]) : undefined} over={!!guide && p[k] > guide[k]} />)}
        {d.knowledge.length > 0 && <div className="muted" style={{ fontSize: '0.85rem' }}>
          Knowledge &amp; languages: {d.knowledge.filter(k => !k.paid).length} free, {d.knowledge.filter(k => k.paid).length} paid
        </div>}
        <div className="muted" style={{ fontSize: '0.85rem' }}>
          Free: {d.build.items.filter(i => i.starting).map(i => i.name).join(', ')}
        </div>
        <div className="total"><Line label={career ? "Build total" : "Creation total"} amount={fmt(p.total)} /></div>
        {career ? (
          <>
            <Line label="Left at creation" amount={fmt(ch.finalRemaining ?? 0)} />
            <Line label="Earned" amount={fmt(earned)} />
            <Line label="Changes since (net)" amount={fmt(changed)} />
            <div className={`left${balance < 0 ? ' neg' : ''}`}>{fmt(balance)}</div>
            <div className="muted">balance</div>
          </>
        ) : (
          <>
            <div className={`left${over ? ' neg' : ''}`}>{fmt(balance)}</div>
            {over ? <div className="err">Over budget by {fmt(-balance)}</div> : <div className="muted">left to spend</div>}
          </>
        )}
        <div className="money-note" role="status" aria-live="polite">{note}</div>

        <div className="block">
          <Line label="Edge" amount={d.edge} />
          <Line label="Essence" amount={d.essence} />
          {d.essenceEffects.magicHitsCancelled > 0 && <div className="muted" style={{ fontSize: '0.85rem' }}>
            Cancels {d.essenceEffects.magicHitsCancelled} hit on magic{d.emerged ? ' and Tasking' : ''} Tests{d.essenceEffects.healingHitsCancelled ? `, ${d.essenceEffects.healingHitsCancelled} on healing` : ''}
          </div>}
          {(d.initiative ?? d.switched?.initiative) && <Line label="Initiative" amount={`${bracketed(d.initiative?.level ?? '–', d.switched?.initiative?.level)}${(d.initiative ?? d.switched?.initiative)!.realm ? ` (${(d.initiative ?? d.switched?.initiative)!.realm})` : ''}`} />}
          {d.firewall != null && <Line label={d.emerged ? 'Living persona FW / Att' : 'Firewall / Attack'} amount={`${d.firewall} / ${d.attack}`} />}
          {(d.mentalProtection > 0 || !!d.switched?.mentalProtection) && <Line label="Mental armor" amount={bracketed(d.mentalProtection, d.switched?.mentalProtection)} />}
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
