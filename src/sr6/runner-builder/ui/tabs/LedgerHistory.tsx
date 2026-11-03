// Ledger: the history table, every line with its running balances and Edit / Void / Delete, and the balance footer.
// Moved out of Ledger.tsx unchanged; the state lives in LedgerForm.ts.
import { ledgerLabel } from '../../domain/career/career'
import { n } from '../editor'
import { Sr6AdvanceRef } from '../EntryRef'
import type { LedgerForm } from './LedgerForm'

export function LedgerHistory({ L }: { L: LedgerForm }) {
  const { ch, bal, rawNuyen, debt, setVoiding, openEdit, doDelete, amount, rows, voidable, deletable } = L
  return (
    <div className="scroll-x">
      <table className="data">
        <thead>
          <tr>
            <th>When</th>
            <th>What</th>
            <th className="num">Karma</th>
            <th className="num">Nuyen</th>
            <th className="num">Karma left</th>
            <th className="num">Nuyen left</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map(({ e, karma, nuyen, voided, reason }) => (
            <tr key={e.id} className={voided ? 'voided' : undefined}>
              <td className="muted">{e.at.slice(0, 10)}</td>
              <td>
                {e.type === 'advance' ? <Sr6AdvanceRef advance={e.advance}>{ledgerLabel(e)}</Sr6AdvanceRef> : ledgerLabel(e)}
                {voided && reason && <span className="muted why">Voided: {reason}</span>}
              </td>
              <td className="num">{amount(e, 'karma')}</td>
              <td className="num">{amount(e, 'nuyen', '¥')}</td>
              <td className="num">{voided || e.type === 'note' || e.type === 'void' ? '' : n(karma)}</td>
              <td className="num">{voided || e.type === 'note' || e.type === 'void' ? '' : `${n(nuyen)}¥`}</td>
              <td className="num">
                {!voided && e.type !== 'void' && (
                  <button className="btn small quiet" aria-label={`Edit ${ledgerLabel(e)}`} onClick={() => openEdit(e)}>
                    Edit
                  </button>
                )}
                {voidable.has(e.id) && (
                  <button className="btn small quiet" aria-label={`Void ${ledgerLabel(e)}`} onClick={() => setVoiding(e)}>
                    Void
                  </button>
                )}
                {deletable.has(e.id) && (
                  <button className="btn small quiet" aria-label={`Delete ${ledgerLabel(e)}`} onClick={() => doDelete(e)}>
                    Delete
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          {debt > 0 && (
            <tr>
              <td />
              <td className="muted">In Debt ({ch.debtPercent}%)</td>
              <td />
              <td className="num muted">−{n(debt)}¥</td>
              <td />
              <td className="num muted">{n(rawNuyen)}¥</td>
              <td />
            </tr>
          )}
          <tr>
            <td />
            <td>
              <b>Balance</b>
            </td>
            <td />
            <td />
            <td className={`num${bal.karma < 0 ? ' err' : ''}`}>
              <b>{n(bal.karma)}</b>
            </td>
            <td className={`num${bal.nuyen < 0 ? ' err' : ''}`}>
              <b>{n(bal.nuyen)}¥</b>
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
