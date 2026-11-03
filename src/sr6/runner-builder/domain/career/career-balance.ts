// Career balances: the ledger rows with the karma and nuyen after each, labels, the balance and the In Debt debt. Part of career.ts (the barrel).
import { type Sr6Character, type Sr6LedgerEntry } from '../../../formats/domain/character'

export interface LedgerRow {
  e: Sr6LedgerEntry
  karma: number
  nuyen: number
  voided: boolean
  reason?: string
}

/** Every entry with the karma and nuyen after it: a finalize sets both, an earning adds, an advance takes its amounts off;
 *  voided entries and voids leave them. Without any finalize entry (a runner finalized before S3) they start at `final`. */
export function ledgerRows(ch: Sr6Character): LedgerRow[] {
  const voids = new Map(ch.ledger.flatMap(e => (e.type === 'void' ? [[e.eventId, e.reason] as const] : [])))
  let karma = 0,
    nuyen = 0
  if (!ch.ledger.some(e => e.type === 'finalize')) ({ karma, nuyen } = ch.final ?? { karma: 0, nuyen: 0 })
  return ch.ledger.map(e => {
    const voided = voids.has(e.id)
    if (!voided) {
      if (e.type === 'finalize') {
        karma = e.karma
        nuyen = e.nuyen
      } else if (e.type === 'earn') {
        karma += e.karma
        nuyen += e.nuyen
      } else if (e.type === 'advance') {
        karma -= e.karma
        nuyen -= e.nuyen
      }
    }
    return { e, karma, nuyen, voided, ...(voided ? { reason: voids.get(e.id) } : {}) }
  })
}
/** An entry as the ledger shows it (and the SR6 export writes it). */
export const ledgerLabel = (e: Sr6LedgerEntry) =>
  e.type === 'finalize'
    ? 'Creation finished'
    : e.type === 'earn'
      ? `Earned: ${e.run} (${e.date})`
      : e.type === 'advance'
        ? e.label
        : e.type === 'note'
          ? e.text
          : `Voided: ${e.reason}`
export function balances(ch: Sr6Character): { karma: number; nuyen: number } {
  const last = ledgerRows(ch).at(-1)
  const base = last ? { karma: last.karma, nuyen: last.nuyen } : (ch.final ?? { karma: 0, nuyen: 0 })
  // In Debt: the debt comes off the nuyen total (debtAmount; the per-row "nuyen left" stays the raw running total)
  return { karma: base.karma, nuyen: base.nuyen - debtAmount(ch, base.nuyen) }
}
/** The In Debt debt on a nuyen total: `debtPercent`% of it, rounded (0/unset: none). */
export const debtAmount = (ch: Sr6Character, nuyen: number) => Math.round((nuyen * Math.max(0, Math.min(100, ch.debtPercent ?? 0))) / 100)
/** Set the In Debt debt percentage (0 clears it). */
export const setDebtPercent = (ch: Sr6Character, pct: number): Sr6Character => ({
  ...ch,
  debtPercent: pct > 0 ? Math.min(100, pct) : undefined,
  updatedAt: new Date().toISOString(),
})
