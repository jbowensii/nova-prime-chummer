import { useState } from 'react'
import { makeEarn, makeNote, voidEvent, voidedIds } from '../../engine'
import type { CareerEvent } from '../../model/types'
import { fmt } from '../bits'
import { useEditor } from '../editor'

export function LedgerTab() {
  const { c, ch, balance, record, update } = useEditor()
  const today = new Date().toISOString().slice(0, 10)
  const [amount, setAmount] = useState('')
  const [run, setRun] = useState('')
  const [date, setDate] = useState(today)
  const [note, setNote] = useState('')
  const voided = voidedIds(ch)

  const earn = async () => {
    const n = Number(amount)
    if (!n || n <= 0) return
    if (await record(makeEarn(n, run.trim() || 'Run', date), `Earned ${fmt(n)}${run.trim() ? ` from ${run.trim()}` : ''}`)) { setAmount(''); setRun('') }
  }
  const describe = (e: CareerEvent): string => {
    switch (e.type) {
      case 'earn': return `Earned: ${e.run} (${e.date})`
      case 'advance': {
        const [k, id] = e.path.split('.')
        return `${k === 'attributes' ? c.attributes.get(id as never)?.name : c.skills.get(id)?.name ?? id} ${e.from} → ${e.to}`
      }
      case 'buy': return `Bought ${e.item.name}`
      case 'sell': return `Sold ${ch.build.items.find(i => i.uid === e.itemUid)?.name ?? 'an item'}`
      case 'amp-add': return `New amp: ${e.amp.name}`
      case 'amp-modify': return `Improved ${e.after.name}`
      case 'spec-add': return `Specialization: ${c.skills.get(e.skill)?.name} (${c.skills.get(e.skill)?.specs.find(s => s.id === e.spec)?.name ?? e.spec.replace(/^custom:/, '')})`
      case 'knowledge-add': return `Knowledge: ${e.name}`
      case 'note': return e.text
      case 'void': return `Voided: ${e.reason}`
    }
  }
  const delta = (e: CareerEvent) => (e.type === 'earn' ? e.amount : 'cost' in e ? -e.cost : 0)

  let running = ch.finalRemaining ?? 0
  const rows = ch.career.filter(e => e.type !== 'void').map(e => {
    if (!voided.has(e.id)) running += delta(e)
    return { e, running, voided: voided.has(e.id), reason: (ch.career.find(v => v.type === 'void' && v.eventId === e.id) as { reason?: string } | undefined)?.reason }
  })

  return (
    <div className="stack">
      <h2>Ledger</h2>
      <p className="muted">In Anarchy 2.0, nuyen is experience too: runs pay out, and you spend it to improve the runner at the creation prices (CRB p.83).</p>
      <div className="row">
        <label>Nuyen earned<input type="number" min={0} step={1000} value={amount} onChange={e => setAmount(e.target.value)} style={{ width: '9rem' }} /></label>
        <label style={{ flex: 1 }}>Run<input value={run} onChange={e => setRun(e.target.value)} placeholder="e.g. Renraku extraction" /></label>
        <label>Date<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        <button className="btn primary" style={{ alignSelf: 'end' }} disabled={!(Number(amount) > 0)} onClick={earn}>Record earnings</button>
      </div>
      <div className="row">
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Add a note to the history" aria-label="Note" style={{ flex: 1 }} />
        <button className="btn small" disabled={!note.trim()} onClick={() => { update(d => { d.career.push(makeNote(note.trim())) }); setNote('') }}>Add note</button>
      </div>

      <table className="data">
        <thead><tr><th>When</th><th>What</th><th className="num">Nuyen</th><th className="num">Balance</th><th /></tr></thead>
        <tbody>
          <tr><td className="muted">{ch.finalizedAt?.slice(0, 10)}</td><td>Finalized; left over from creation</td><td className="num">{fmt(ch.finalRemaining ?? 0)}</td><td className="num">{fmt(ch.finalRemaining ?? 0)}</td><td /></tr>
          {rows.map(({ e, running, voided, reason }) => (
            <tr key={e.id} style={voided ? { textDecoration: 'line-through', color: 'var(--ink-3)' } : undefined}>
              <td className="muted">{e.at.slice(0, 10)}</td>
              <td>{describe(e)}{voided && reason && <span className="muted" style={{ textDecoration: 'none', display: 'block' }}>Voided: {reason}</span>}</td>
              <td className="num">{delta(e) ? fmt(delta(e)) : ''}</td>
              <td className="num">{voided ? '' : fmt(running)}</td>
              <td className="num">{!voided && e.type !== 'note' && <button className="btn small quiet" onClick={() => {
                const why = prompt('Why void this entry?')?.trim()
                if (why) update(d => { Object.assign(d, voidEvent(d, e.id, why)) })
              }}>Void</button>}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><td /><td><b>Balance</b></td><td /><td className={`num ${balance < 0 ? 'err' : ''}`}><b>{fmt(balance)}</b></td><td /></tr></tfoot>
      </table>
    </div>
  )
}
