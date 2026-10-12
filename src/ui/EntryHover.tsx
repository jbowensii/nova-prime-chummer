// A catalog entry's card on hover (both games, 0.11.4): wherever the editor names a catalog entry (a quality, a skill, a
// line of gear, a spell, a Review or budget line), hovering it, focusing it or tapping it shows the entry as Game data
// shows it (src/ui/CatalogBrowser.tsx's BrowseRow: its values, effects, formulas, source and page, issues, edits and
// description), so a misprint can be checked against the book where it is used. Escape closes it. Each game maps its
// entries to a BrowseRow once (src/ui/tabs/Data.tsx anarchyRow, src/sr6/ui/Data.tsx sr6Row).
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { BrowseRow } from './CatalogBrowser'
import { IssueBadges } from './Issues'
import { Prose } from './Prose'

/** What an entry's effect does on the runner: applied (always on: in the total shown first), conditional (switchable or
 *  on some tests only: in the bracketed total, `6 (9)`), target (a spell's on its target: never on the caster) or low
 *  (read with low confidence from its prose: shown, never applied). */
export interface CardEffect { text: string; state: 'applied' | 'conditional' | 'target' | 'low' }
// (a conditional or switchable effect gets a tick box as a reminder, as the printed sheet prints one; owner decision 17, 2026-10-11)
const STATE: Record<CardEffect['state'], string> = { applied: 'applied', conditional: 'switchable or conditional: in brackets, tick when it applies',
  target: 'affects target(s)', low: 'low confidence: shown, not applied' }

/** The entry as Game data shows it: name, source and page, its marks (Edited, House…) and issues, its values, effects and
 *  description. */
export function EntryCard({ row, kind }: { row: BrowseRow; kind?: string }) {
  return (
    <span className="entry-card">{/* (spans only: it may sit inside a line's text) */}
      <span className="entry-card-head"><b>{row.name}</b>{kind && <span className="muted"> {kind}</span>}</span>
      <span className="srcline">{row.source && <span className="src">{row.source} p.{row.page}</span>}{row.marks}<IssueBadges issues={row.issues} source={row.source} /></span>
      {row.details && <span className="muted entry-card-values">{row.details}</span>}
      {!!row.effects?.length && <span className="entry-card-effects" role="list" aria-label="Effects">
        {row.effects.map((x, i) => <span role="listitem" key={i} className={x.state}>{x.state === 'conditional' ? '☐ ' : ''}{x.text} <span className="muted">({STATE[x.state]})</span></span>)}</span>}
      {row.text && <span className="entry-card-text"><Prose text={row.text} /></span>}
    </span>
  )
}

/** `children` with its entry's card: on hover, on focus (Tab reaches it), on a tap (a second tap closes it); Escape, a
 *  tap elsewhere or moving away closes it. No row: just the children. `open` forces it open and `tabbable` false keeps
 *  it from being a tab stop of its own (a picker's item: its row is focusable and opens it). */
export function EntryHover({ row, kind, children, open: forced, tabbable = true }: {
  /** the entry's row, or a function making it (only when shown: a line names many entries) */
  row?: BrowseRow | (() => BrowseRow); kind?: string; children: ReactNode; open?: boolean; tabbable?: boolean
}) {
  const [open, setOpen] = useState(false), [tapped, setTapped] = useState(false) // (tapped: touch's, for the render)
  const id = useId(), ref = useRef<HTMLSpanElement>(null), pop = useRef<HTMLSpanElement>(null), touch = useRef(false)
  const shown = !!row && (open || !!forced)
  // placed by the viewport (fixed), so a table's scroll box never clips it: below the name, or above it near the bottom
  const [at, setAt] = useState<{ left: number; top?: number; bottom?: number } | null>(null)
  useLayoutEffect(() => {
    if (!shown) return
    const place = () => {
      const r = ref.current?.getBoundingClientRect()
      if (!r) return
      const w = Math.min(416, innerWidth * 0.9), left = Math.max(8, Math.min(r.left, innerWidth - w - 8))
      setAt(r.bottom + 360 > innerHeight && r.top > innerHeight - r.bottom ? { left, bottom: innerHeight - r.top + 4 } : { left, top: r.bottom + 4 })
    }
    place()
    addEventListener('scroll', place, true); addEventListener('resize', place)
    return () => { removeEventListener('scroll', place, true); removeEventListener('resize', place) }
  }, [shown])
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node) && !pop.current?.contains(e.target as Node)) setOpen(false) }
    // Escape closes the card only (not the dialog it sits in)
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false) } }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc, true)
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc, true) }
  }, [open])
  if (!row) return <>{children}</>
  return (
    <span ref={ref} className="entry-ref" tabIndex={tabbable ? 0 : undefined} aria-describedby={shown ? id : undefined}
      onPointerDown={e => { touch.current = e.pointerType !== 'mouse'; setTapped(touch.current) }}
      onClick={() => { if (touch.current) setOpen(o => !o) }}
      onMouseEnter={() => { if (!touch.current) setOpen(true) }} onMouseLeave={() => { if (!touch.current) setOpen(false) }}
      onFocus={() => { if (!touch.current) setOpen(true) }} onBlur={e => { if (!ref.current?.contains(e.relatedTarget as Node)) setOpen(false) }}>
      {children}
      {/* (on the page's body: never part of the line's own text, never clipped by its box; a pointer goes through it
          unless a tap opened it, to scroll a long one) */}
      {shown && createPortal(<span ref={pop} role="tooltip" id={id} className={`entry-pop${tapped ? ' touch' : ''}`} style={at ?? { visibility: 'hidden' }}>
        <EntryCard row={typeof row === 'function' ? row() : row} kind={kind} /></span>, document.querySelector('dialog[open]') ?? document.body)}
    </span>
  )
}
