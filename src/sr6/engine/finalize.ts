// Finalize and Back to draft (R, until S3's ledger): finalizing stamps the runner with when and the karma and nuyen left;
// the build is then read only. Back to draft undoes exactly that.
import type { Violation } from '../../model/types'
import type { Sr6Character } from '../model/character'
import type { Sr6Budgets } from './budgets'
import { canFinalizeSr6 } from './rules'

/** The runner finalized now, or null while an error isn't approved. */
export function finalizeSr6(ch: Sr6Character, budgets: Sr6Budgets, v: Violation[], now = new Date().toISOString()): Sr6Character | null {
  return canFinalizeSr6(v) ? { ...ch, finalizedAt: now, final: { karma: budgets.karma.left, nuyen: budgets.nuyen.left } } : null
}

/** The runner back to a draft. */
export function draftAgain(ch: Sr6Character): Sr6Character {
  const { finalizedAt: _f, final: _k, ...rest } = ch
  return rest
}
