import { describe } from 'vitest'
import { books } from '../../helpers'

export const describeBooks = books ? describe : describe.skip
export const SKIP_REASON = 'no private imports (set BOOKS_DIR or import your books); book tests skipped'
if (!books) console.info(SKIP_REASON)
