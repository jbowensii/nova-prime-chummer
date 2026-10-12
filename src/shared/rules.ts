// Review rules both games share.
import type { Violation } from '../model/types'

/** No error left that a GM hasn't approved. */
export const canFinalize = (v: Violation[]) => !v.some(x => x.severity === 'error' && !x.approved)
