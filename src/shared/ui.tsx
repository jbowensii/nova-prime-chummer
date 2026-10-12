// UI pieces both games' editors use.
import { Component, useId, useState, useSyncExternalStore, type ReactNode } from 'react'

/** A text field that commits on Enter or leaving it (a finalized runner's changes are ledger lines, not keystrokes). */
export function NameField({ value, label, onCommit }: { value: string; label: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value)
  const [was, setWas] = useState(value)
  if (value !== was) { setWas(value); setV(value) }
  const commit = () => { const t = v.trim(); if (t && t !== value) onCommit(t); else setV(value) }
  return <input value={v} aria-label={label} onChange={e => setV(e.target.value)} onBlur={commit} onKeyDown={e => e.key === 'Enter' && commit()} />
}

/** Around an editor's tab: one that throws while drawing shows a message and a reload button, not a blank page. Keyed by
 *  the tab, so another tab starts afresh. (Each change was saved as it was made.) */
export class TabBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed
      ? <div className="banner err" role="alert"><p>This tab hit an error — your saved changes are safe.</p>
        <button type="button" className="btn" onClick={() => location.reload()}>Reload</button></div>
      : this.props.children
  }
}

/** How a catalog entry stands in the edits layer, in words (Game data lists, the edit form). */
export const STATE_TEXT = { book: '', changed: 'Changed from the book', added: 'Added by you (house rule)', orphan: 'Orphaned edit (book removed)' }

// app.css: at this width the side panel is a bar at the bottom of the screen
const NARROW = '(max-width: 900px)'
const narrowNow = () => typeof matchMedia === 'function' && matchMedia(NARROW).matches
function onNarrow(cb: () => void) {
  if (typeof matchMedia !== 'function') return () => {}
  const m = matchMedia(NARROW)
  m.addEventListener('change', cb)
  return () => m.removeEventListener('change', cb)
}

/** The editor's side panel (Anarchy's receipt, SR6's budgets). On a narrow screen a bar whose button (`peek`) opens and
 *  closes it; closed, what's under the bar is inert, so it is out of the tab order and screen readers skip it. */
export function SidePanel({ className, label, peek, children }: { className: string; label: string; peek: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const id = useId(), narrow = useSyncExternalStore(onNarrow, narrowNow, () => false)
  return (
    <aside className={`${className}${open ? ' open' : ''}`} aria-label={label}>
      <button type="button" className="peek" aria-expanded={open} aria-controls={id} onClick={() => setOpen(o => !o)}>{peek}</button>
      <div id={id} inert={narrow && !open}>{children}</div>
    </aside>
  )
}
