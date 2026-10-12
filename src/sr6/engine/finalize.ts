// Finalize and Back to draft: finalizing stamps the runner with when and the karma and nuyen left and opens the career
// ledger with a finalize entry (the balances run from it, src/sr6/engine/career.ts). Back to draft works only while the
// ledger holds nothing live to undo since then; the old entries stay as history and the next Finalize starts again.
import { newId, type Violation } from '../../model/types'
import type { Sr6Character } from '../model/character'
import type { Sr6Budgets } from './budgets'
import { canDraft } from './career'
import { canFinalizeSr6 } from './rules'

/** The runner finalized now, or null while an error isn't approved. */
export function finalizeSr6(ch: Sr6Character, budgets: Sr6Budgets, v: Violation[], now = new Date().toISOString()): Sr6Character | null {
  if (!canFinalizeSr6(v)) return null
  const karma = budgets.karma.left,
    nuyen = budgets.nuyen.left
  return { ...ch, finalizedAt: now, final: { karma, nuyen }, ledger: [...ch.ledger, { id: newId(), at: now, type: 'finalize', karma, nuyen }] }
}

/** The runner back to a draft (a "Back to draft" note in the ledger), or null while an earning or spend is still live. */
export function draftAgain(ch: Sr6Character, now = new Date().toISOString()): Sr6Character | null {
  if (!canDraft(ch)) return null
  const { finalizedAt: _f, final: _k, ...rest } = ch
  return { ...rest, ledger: [...ch.ledger, { id: newId(), at: now, type: 'note', text: 'Back to draft' }] }
}
