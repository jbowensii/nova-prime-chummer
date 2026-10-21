// Ledger (Anarchy career): record earnings and notes; the history with its running balance. What a line names (an
// attribute, a skill or specialization, an amp, an item) shows its card on hover, focus or tap (AnarchyRef.tsx).
import { Fragment, useState, type ReactNode } from 'react'
import { changeText, ledgerRunning, makeEarn, makeNote, voidEvent } from '../../domain/career'
import { OPTIONAL_RULES, optionOn } from '../../domain/derive'
import type { AttrId, CareerEvent, Change } from '../../../formats/domain/types'
import { AnarchyAttrRef, AnarchyRef } from '../AnarchyRef'
import { fmt } from '../../../../core/ui-kit/bits'
import { useEditor } from '../editor'

export function LedgerTab() {
  const { c, ch, balance, record, update, table } = useEditor()
  // lifestyle Amps in play (DHSA p.16, optional): the lifestyle is an Amp with a fixed cost, no per-run adjustment
  const lifeAmps = optionOn(OPTIONAL_RULES.lifestyleAmps, ch, table)
  const life = lifeAmps ? undefined : c.lifestyles.get(ch.identity.lifestyle ?? 'low')
  const [withLife, setWithLife] = useState(true)
  const today = new Date().toISOString().slice(0, 10)
  const [amount, setAmount] = useState('')
  const [run, setRun] = useState('')
  const [date, setDate] = useState(today)
  const [note, setNote] = useState('')

  const earn = async () => {
    const pay = Number(amount)
    if (!pay || pay <= 0) return
    const adj = withLife && life ? life.perRun : 0
    const n = Math.max(0, pay + adj)
    const label = `${run.trim() || 'Run'}${adj ? ` (${life!.name} lifestyle ${adj > 0 ? '+' : '−'}${fmt(Math.abs(adj))})` : ''}`
    if (
      await record(
        makeEarn(n, label, date),
        `Earned ${fmt(n)}${run.trim() ? ` from ${run.trim()}` : ''}${adj ? `: ${fmt(pay)} pay, ${adj > 0 ? '+' : '−'}${fmt(Math.abs(adj))} for ${life!.name} lifestyle` : ''}`,
      )
    ) {
      setAmount('')
      setRun('')
    }
  }
  const item = (catalogId: string | undefined, name: ReactNode) => {
    const k = catalogId ? c.items.get(catalogId)?.kind : undefined
    return k ? (
      <AnarchyRef kind={k} id={catalogId}>
        {name}
      </AnarchyRef>
    ) : (
      name
    )
  }
  // one change line with the card of what it names (diffBuild's keys: attr:, skill:, spec:<skill>:, amp:<uid>, item:<uid>)
  const change = (x: Change) => {
    const [k, id] = x.key.split(':'),
      text = changeText(x)
    if (k === 'attr') return <AnarchyAttrRef attr={id as AttrId}>{text}</AnarchyAttrRef>
    if (k === 'skill' || k === 'spec')
      return (
        <AnarchyRef kind="skills" id={id}>
          {text}
        </AnarchyRef>
      )
    if (k === 'amp')
      return (
        <AnarchyRef kind="amps" id={ch.build.amps.find(a => a.uid === id)?.catalogId}>
          {text}
        </AnarchyRef>
      )
    if (k === 'item') return item(ch.build.items.find(i => i.uid === id)?.catalogId, text)
    return text
  }
  const describe = (e: CareerEvent): ReactNode => {
    switch (e.type) {
      case 'earn':
        return `Earned: ${e.run} (${e.date})`
      case 'finalize':
        return `Creation finished · ${fmt(e.remaining)} left`
      case 'change':
        return e.changes.map((x, i) => (
          <Fragment key={i}>
            {i > 0 && '; '}
            {change(x)}
          </Fragment>
        ))
      case 'advance': {
        const [k, id] = e.path.split('.')
        return k === 'attributes' ? (
          <AnarchyAttrRef attr={id as AttrId}>
            {c.attributes.get(id as AttrId)?.name} {e.from} → {e.to}
          </AnarchyAttrRef>
        ) : (
          <AnarchyRef kind="skills" id={id}>
            {c.skills.get(id)?.name ?? id} {e.from} → {e.to}
          </AnarchyRef>
        )
      }
      case 'buy':
        return <>Bought {item(e.item.catalogId, e.item.name)}</>
      case 'sell':
        return `Sold ${ch.career.map(x => (x.type === 'buy' && x.item.uid === e.itemUid ? x.item.name : '')).find(Boolean) ?? 'an item'}`
      case 'amp-add':
        return (
          <>
            New amp:{' '}
            <AnarchyRef kind="amps" id={e.amp.catalogId}>
              {e.amp.name}
            </AnarchyRef>
          </>
        )
      case 'amp-modify':
        return (
          <>
            Improved{' '}
            <AnarchyRef kind="amps" id={e.after.catalogId}>
              {e.after.name}
            </AnarchyRef>
          </>
        )
      case 'spec-add':
        return (
          <AnarchyRef kind="skills" id={e.skill}>
            Specialization: {c.skills.get(e.skill)?.name} ({c.skills.get(e.skill)?.specs.find(s => s.id === e.spec)?.name ?? e.spec.replace(/^custom:/, '')})
          </AnarchyRef>
        )
      case 'knowledge-add':
        return `${e.kind === 'language' ? 'Language' : 'Knowledge'}${e.from ? (e.cost ? ', now paid' : ', free slot') : ''}: ${e.name}`
      case 'note':
        return e.text
      case 'void':
        return `Voided: ${e.reason}`
    }
  }
  const delta = (e: CareerEvent) => (e.type === 'earn' ? e.amount : 'cost' in e ? -e.cost : 0)

  // the same running total the balance is (engine/career.ts ledgerRunning)
  const rows = ledgerRunning(ch).map(r => ({
    ...r,
    reason: (ch.career.find(v => v.type === 'void' && v.eventId === r.e.id) as { reason?: string } | undefined)?.reason,
  }))

  return (
    <div className="stack">
      <h2>Ledger</h2>
      <p className="muted">
        In Anarchy 2.0, nuyen is experience too: runs pay out, and you spend it to improve the runner at the creation prices (CRB p.83). Nothing is locked:
        change the runner on any tab and the change is logged here by itself, charged at the book price or, for anything removed, refunded. Mistakes are undone
        with Undo or by changing it back.
      </p>
      <div className="row">
        <label>
          Nuyen earned
          <input type="number" min={0} step={1000} value={amount} onChange={e => setAmount(e.target.value)} style={{ width: '9rem' }} />
        </label>
        <label style={{ flex: 1 }}>
          Run
          <input value={run} onChange={e => setRun(e.target.value)} placeholder="e.g. Renraku extraction" />
        </label>
        <label>
          Date
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </label>
        <button className="btn primary" style={{ alignSelf: 'end' }} disabled={!(Number(amount) > 0)} onClick={earn}>
          Record earnings
        </button>
      </div>
      {lifeAmps && (
        <p className="muted small">Lifestyle Amps are in play (DHSA p.16): the lifestyle is an Amp with a fixed cost, so no per-run lifestyle adjustment.</p>
      )}
      {life && life.perRun !== 0 && (
        <label className="row" style={{ display: 'flex' }}>
          <input type="checkbox" checked={withLife} onChange={e => setWithLife(e.target.checked)} />
          Apply {life.name} lifestyle: {life.perRun > 0 ? '+' : '−'}
          {fmt(Math.abs(life.perRun))} per run (CRB p.{life.page})
        </label>
      )}
      <div className="row">
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Add a note to the history" aria-label="Note" style={{ flex: 1 }} />
        <button
          className="btn small"
          disabled={!note.trim()}
          onClick={() => {
            update(d => {
              d.career.push(makeNote(note.trim()))
            })
            setNote('')
          }}
        >
          Add note
        </button>
      </div>

      <div className="scroll-x">
        <table className="data">
          <thead>
            <tr>
              <th>When</th>
              <th>What</th>
              <th className="num">Nuyen</th>
              <th className="num">Balance</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ e, running, voided, reason }) => (
              <tr key={e.id} style={voided ? { textDecoration: 'line-through', color: 'var(--ink-3)' } : undefined}>
                <td className="muted">{e.at.slice(0, 10)}</td>
                <td>
                  {describe(e)}
                  {voided && reason && (
                    <span className="muted" style={{ textDecoration: 'none', display: 'block' }}>
                      Voided: {reason}
                    </span>
                  )}
                </td>
                <td className="num">{delta(e) ? fmt(delta(e)) : ''}</td>
                <td className="num">{voided ? '' : fmt(running)}</td>
                <td className="num">
                  {!voided && e.type === 'earn' && (
                    <button
                      className="btn small quiet"
                      onClick={() => {
                        const why = prompt('Why void this entry?')?.trim()
                        if (why)
                          update(d => {
                            Object.assign(d, voidEvent(d, e.id, why))
                          })
                      }}
                    >
                      Void
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td />
              <td>
                <b>Balance</b>
              </td>
              <td />
              <td className={`num ${balance < 0 ? 'err' : ''}`}>
                <b>{fmt(balance)}</b>
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
