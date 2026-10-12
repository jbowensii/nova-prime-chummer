// UI pieces both games' editors use.
import { useState } from 'react'

/** A text field that commits on Enter or leaving it (a finalized runner's changes are ledger lines, not keystrokes). */
export function NameField({ value, label, onCommit }: { value: string; label: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value)
  const [was, setWas] = useState(value)
  if (value !== was) { setWas(value); setV(value) }
  const commit = () => { const t = v.trim(); if (t && t !== value) onCommit(t); else setV(value) }
  return <input value={v} aria-label={label} onChange={e => setV(e.target.value)} onBlur={commit} onKeyDown={e => e.key === 'Enter' && commit()} />
}

/** How a catalog entry stands in the edits layer, in words (Game data lists, the edit form). */
export const STATE_TEXT = { book: '', changed: 'Changed from the book', added: 'Added by you (house rule)', orphan: 'Orphaned edit (book removed)' }
