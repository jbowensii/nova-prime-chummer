// Small shared UI pieces: money format, stepper, catalog picker, dialog, receipt line.
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'

export const fmt = (n: number) => `${n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('en-US')}¥`
export const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : fmt(n))

export function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (v: number) => void; label: string }) {
  return (
    <span className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label={`Lower ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)}>−</button>
      <output aria-live="polite">{value}</output>
      <button type="button" aria-label={`Raise ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
    </span>
  )
}

/** Marks published content that isn't the game's official rules (sources.xml canon="false"). */
export const NonCanon = ({ source }: { source?: string }) =>
  <span className="noncanon" title={`Published, not canon${source ? ` (${source})` : ''}`}>Non-canon</span>

/** action: a control in the row (an Edit button) that doesn't pick it; disabled: listed (for its action) but not pickable */
export interface PickItem { id: string; name: string; meta?: string; text?: string; price?: string; group?: string; label?: ReactNode; search?: string; action?: ReactNode; disabled?: boolean }

export function Picker({ items, onPick, placeholder = 'Search', groups }: { items: PickItem[]; onPick: (id: string) => void; placeholder?: string; groups?: string[] }) {
  const [q, setQ] = useState('')
  const [group, setGroup] = useState('')
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return items.filter(i => (!group || i.group === group) &&
      (!t || i.name.toLowerCase().includes(t) || i.text?.toLowerCase().includes(t) || i.meta?.toLowerCase().includes(t) || i.search?.toLowerCase().includes(t))).slice(0, 300)
  }, [items, q, group])
  return (
    <div className="picker">
      <div className="row">
        <input type="search" autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} style={{ flex: 1 }} />
        {groups && (
          <select value={group} onChange={e => setGroup(e.target.value)} aria-label="Filter">
            <option value="">All</option>
            {groups.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        )}
      </div>
      <ul>
        {shown.map(i => (
          <li key={i.id} tabIndex={i.disabled ? undefined : 0} className={i.disabled ? 'off' : undefined}
            onClick={() => !i.disabled && onPick(i.id)} onKeyDown={e => !i.disabled && e.key === 'Enter' && onPick(i.id)}>
            <span><b>{i.name}</b> {i.meta && <span className="muted">{i.meta}</span>} {i.label}</span>
            <span className="num">{i.price}{i.action && <span onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}> {i.action}</span>}</span>
            {i.text && <span className="t">{i.text}</span>}
          </li>
        ))}
        {!shown.length && <li className="muted">Nothing matches “{q}”.</li>}
      </ul>
    </div>
  )
}

/** Tab and Shift+Tab stay inside a dialog: from its last control to its first, and back (the page behind is inert anyway). */
function trapTab(e: React.KeyboardEvent<HTMLDialogElement>) {
  if (e.key !== 'Tab') return
  const all = [...e.currentTarget.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter(el => !(el as HTMLButtonElement).disabled && el.offsetParent !== null)
  const first = all[0], last = all[all.length - 1]
  if (!first) return
  if (e.shiftKey ? document.activeElement === first : document.activeElement === last) { e.preventDefault(); (e.shiftKey ? last : first).focus() }
}

/** A modal <dialog> that opens when `open` is true. Esc or the close button calls onClose; Tab stays inside. */
export function Modal({ open, onClose, title, children, actions, className }: { open: boolean; onClose: () => void; title: string; children: ReactNode; actions?: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null)
  const tid = useId() // two dialogs can be open at once (an edit over a picker)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog ref={ref} className={className} onClose={onClose} onKeyDown={trapTab} onCancel={e => { e.preventDefault(); onClose() }} aria-labelledby={tid}>
      {open && (
        <>
          <h2 id={tid}>{title}</h2>
          {children}
          <div className="actions">{actions ?? <button className="btn" onClick={onClose}>Close</button>}</div>
        </>
      )}
    </dialog>
  )
}

export function Line({ label, amount, guide, over }: { label: ReactNode; amount: ReactNode; guide?: ReactNode; over?: boolean }) {
  return (
    <div className={`line${over ? ' over' : ''}`}>
      <span className="lbl">{label}</span><span className="lead" /><span className="amt num">{amount}</span>
      {guide != null && <span className="guide">/ {guide}</span>}
    </div>
  )
}
