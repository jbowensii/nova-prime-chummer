// Ledger (career): the Anarchy Ledger tab's layout with two currencies. The balances; Record earnings; Spend (pick what,
// see its price and the balances after, Record, confirm); a note; the history with running balances, where an entry that
// may be voided has Void (a reason asked) and a voided one is struck through with its reason. Every price comes from the
// creation settings (src/sr6/runner-builder/domain/career/career.ts); a refusal reads as a sentence. What the runner lacks a prerequisite for
// is offered too, marked: recorded, Review flags it. What a spend or a history line names (an attribute, a skill, the
// entry picked) shows its card on hover, focus or tap (EntryRef.tsx Sr6AdvanceRef).
import { note } from '../../domain/career/career'
import { exportSr6Ledger } from '../repo'
import { n, reasonText } from '../editor'
import { Sr6AdvanceRef } from '../EntryRef'
import { BuyItemDesign } from '../Builder'
import { OPS, useLedgerForm, whole, type OpKey } from './LedgerForm'
import { LedgerDialogs } from './LedgerDialogs'
import { LedgerHistory } from './LedgerHistory'
import { LedgerSpendFields } from './LedgerSpendFields'

export { OPS, buyKinds } from './LedgerForm'

export function LedgerTab() {
  const L = useLedgerForm()
  const {
    ch,
    c,
    record,
    ledger,
    bal,
    inDebtQ,
    rawNuyen,
    debt,
    gain,
    setGain,
    op,
    setPicking,
    opFind,
    setOpFind,
    setConfirm,
    text,
    setText,
    importRef,
    choose,
    adv,
    typed,
    pv,
    priceRest,
    recordEarnings,
    earnOk,
    importLedger,
    setDebt,
    clearAll,
    deletable,
  } = L
  return (
    <div className="stack sr6-ledger">
      <h2>Ledger</h2>
      <p className="muted">
        Earnings add karma and nuyen; spends take them off at the table’s prices (Table setup → Creation rules). The ledger only grows: a mistake is undone by
        voiding it, newest spend first.
      </p>
      <p className="sr6-balances">
        <span>
          Karma <b className={bal.karma < 0 ? 'err' : ''}>{n(bal.karma)}</b>
        </span>
        <span>
          Nuyen <b className={bal.nuyen < 0 ? 'err' : ''}>{n(bal.nuyen)}¥</b>
        </span>
        {debt > 0 && (
          <span className="muted">
            after debt −{n(debt)}¥ ({ch.debtPercent}%)
          </span>
        )}
      </p>

      <div className="row">
        <button className="btn small" onClick={() => exportSr6Ledger(c, ch)}>
          Export ledger
        </button>
        <button className="btn small" onClick={() => importRef.current?.click()}>
          Import ledger
        </button>
        {deletable.size > 0 && (
          <button className="btn small quiet" onClick={clearAll}>
            Clear history
          </button>
        )}
        <input
          ref={importRef}
          type="file"
          accept=".xml,application/xml,text/xml"
          hidden
          onChange={e => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void importLedger(file)
          }}
        />
      </div>

      {inDebtQ && (
        <div className="row">
          <label>
            In Debt (CRB-HK): debt as a % of the nuyen total
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={ch.debtPercent ?? 0}
              onChange={e => setDebt(Math.max(0, Math.min(100, whole(e.target.value) || 0)))}
              aria-label="Debt percent"
              style={{ width: '6rem' }}
            />
          </label>
          {debt > 0 && (
            <span className="muted" style={{ alignSelf: 'end' }}>
              −{n(debt)}¥ of {n(rawNuyen)}¥ comes off the total.
            </span>
          )}
        </div>
      )}

      <h3>Record earnings</h3>
      <div className="row">
        <label>
          Karma
          <input type="number" min={0} step={1} value={gain.karma} onChange={e => setGain({ ...gain, karma: e.target.value })} style={{ width: '6rem' }} />
        </label>
        <label>
          Nuyen
          <input type="number" min={0} step={100} value={gain.nuyen} onChange={e => setGain({ ...gain, nuyen: e.target.value })} style={{ width: '8rem' }} />
        </label>
        <label style={{ flex: 1, minWidth: '10rem' }}>
          Run
          <input value={gain.run} onChange={e => setGain({ ...gain, run: e.target.value })} placeholder="e.g. Warehouse job" />
        </label>
        <label>
          Date
          <input type="date" value={gain.date} onChange={e => setGain({ ...gain, date: e.target.value })} />
        </label>
        <button className="btn primary" style={{ alignSelf: 'end' }} disabled={!earnOk} onClick={recordEarnings}>
          Record earnings
        </button>
      </div>

      <h3>Spend</h3>
      {/* a saved weapon or cyberware design (the Weapon and Cyberware designers): bought as built, a recorded spend */}
      <BuyItemDesign kind="weapon" />
      <BuyItemDesign kind="cyberware" />
      <div className="row">
        <label>
          What
          <select value={op} onChange={e => choose(e.target.value as OpKey)}>
            {OPS.filter(([k, l]) => k === op || l.toLowerCase().includes(opFind.trim().toLowerCase()))
              .slice()
              .sort((a, z) => a[1].localeCompare(z[1]))
              .map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
          </select>
        </label>
        <label>
          Find
          <input value={opFind} placeholder="type to filter" aria-label="Filter what to spend on" onChange={e => setOpFind(e.target.value)} />
        </label>
        <LedgerSpendFields L={L} />
      </div>
      <div className="row">
        <p className={`sr6-preview${pv && !pv.ok ? ' err' : ''}`} role="status" aria-label="Price" style={{ flex: 1, margin: 0 }}>
          {!pv ? (
            <span className="muted">Pick what to buy.</span>
          ) : pv.ok ? (
            <>
              {pv.label ? <Sr6AdvanceRef advance={adv!}>{pv.label}</Sr6AdvanceRef> : null}
              {pv.label && priceRest ? ' · ' : ''}
              {priceRest}
            </>
          ) : (
            reasonText(pv.reason)
          )}
        </p>
        {op === 'purchase' && (
          // buying a bunch of small things: record this one as its own line (no confirm) and reopen the picker for the next
          <button
            className="btn"
            disabled={!pv?.ok}
            onClick={() => {
              if (adv && !record(adv, typed)) {
                choose(op)
                setPicking(true)
              }
            }}
          >
            Record &amp; buy another
          </button>
        )}
        <button className="btn primary" disabled={!pv?.ok} onClick={() => setConfirm(true)}>
          Record
        </button>
      </div>

      <div className="row">
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Add a note to the history" aria-label="Note" style={{ flex: 1 }} />
        <button
          className="btn small"
          disabled={!text.trim()}
          onClick={() => {
            if (!ledger(x => ({ ok: true, ch: note(x, text.trim()) }))) setText('')
          }}
        >
          Add note
        </button>
      </div>

      <LedgerHistory L={L} />
      <LedgerDialogs L={L} />
    </div>
  )
}
