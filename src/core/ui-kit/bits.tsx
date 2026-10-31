// Small shared UI pieces: money format, stepper, catalog picker, dialog, receipt line.
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Npc } from '../../ca2/formats/domain/types'
import type { BrowseRow } from './types'
import { EntryHover } from './EntryHover'

export const fmt = (n: number) => `${n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('en-US')}¥`
export const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : fmt(n))

export function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (v: number) => void; label: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <span className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label={`Lower ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)}>
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        aria-label={label}
        min={min}
        max={max}
        value={draft ?? value}
        onChange={ev => {
          setDraft(ev.target.value) // a cleared box stays empty while typing; blur puts the value back
          const v = Math.round(Number(ev.target.value))
          if (ev.target.value.trim() !== '' && Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)))
        }}
        onBlur={() => setDraft(null)}
      />
      <button type="button" aria-label={`Raise ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)}>
        +
      </button>
    </span>
  )
}

/** Marks published content that isn't the game's official rules (sources.xml canon="false"). */
export const NonCanon = ({ source }: { source?: string }) => (
  <span className="noncanon" title={`Published, not canon${source ? ` (${source})` : ''}`}>
    Non-canon
  </span>
)

/** An entry from a GM's compendium (a house source): House and the compendium's name. */
export const HouseChip = ({ name }: { name: string }) => (
  <span className="noncanon house" title={`From the GM’s compendium ${name} (not canon)`}>
    House · {name}
  </span>
)

/** A runner the player made (not an example or an import of a book's). */
export const UserDefined = () => (
  <span className="noncanon userdef" title="Made by a player, not a book example">
    User defined
  </span>
)

/** Red chip on an overspent runner; its accessible name says by how much. */
export const OverspentChip = ({ by }: { by: number }) => (
  <span className="noncanon overspent" role="img" aria-label={`Error: overspent by ${fmt(by)}`} title={`Overspent by ${fmt(by)}`}>
    Error
  </span>
)

/** A runner's state, in the Non-canon badge's family: a draft still in creation (reopens where it was left), or
 *  finalized (career). */
/** finalTip: what a finalized runner's badge says (SR6 passes its own: spends are recorded on its Ledger tab). */
export const StateBadge = ({ finalized, finalTip = 'Finalized: every change is logged in the ledger' }: { finalized: boolean; finalTip?: string }) => (
  <span className={`noncanon runstate ${finalized ? 'final' : 'draft'}`} title={finalized ? finalTip : 'Draft: still in creation'}>
    {finalized ? 'Finalized' : 'Draft'}
  </span>
)

export const NPC_KINDS = { npc: 'NPC', critter: 'Critter', spirit: 'Spirit' } as const
export const NPC_TIERS = { prime: 'Prime', regular: 'Regular' } as const
/** An NPC's kind and tier, as chips (the NPC list and the editor's bar). */
export const NpcChips = ({ npc }: { npc: Npc }) => (
  <>
    <span className="noncanon npckind">{NPC_KINDS[npc.kind]}</span> <span className="noncanon npctier">{NPC_TIERS[npc.tier]}</span>
  </>
)

/** action: a control in the row (an Edit button) that doesn't pick it; disabled: listed (for its action) but not pickable */
export interface PickItem {
  id: string
  name: string
  meta?: string
  text?: string
  price?: string
  group?: string
  label?: ReactNode
  search?: string
  action?: ReactNode
  disabled?: boolean
  /** its catalog entry's card (src/core/ui-kit/EntryHover.tsx), shown on hover and while the item has focus */
  card?: () => BrowseRow
  cardKind?: string
}

/** A picker option's keys: Enter or Space picks it; Up and Down move to the next one that can be picked (from the first,
 *  Up goes back to the search box). Keys on a control inside it (its action) are its own. */
function pickKey(e: React.KeyboardEvent<HTMLLIElement>, pick: () => void) {
  if (e.target !== e.currentTarget) return
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    pick()
    return
  }
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
  e.preventDefault()
  const all = [...e.currentTarget.parentElement!.querySelectorAll<HTMLElement>('[role=option][tabindex]')],
    k = all.indexOf(e.currentTarget)
  const next = all[k + (e.key === 'ArrowDown' ? 1 : -1)]
  if (next) next.focus()
  else if (e.key === 'ArrowUp') e.currentTarget.closest('.picker')?.querySelector<HTMLElement>('input[type=search]')?.focus()
}

export function Picker({
  items,
  onPick,
  placeholder = 'Search',
  groups,
}: {
  items: PickItem[]
  onPick: (id: string) => void
  placeholder?: string
  groups?: string[]
}) {
  const [q, setQ] = useState('')
  const [group, setGroup] = useState('')
  const [focused, setFocused] = useState('')
  const list = useRef<HTMLUListElement>(null)
  const matches = useMemo(() => {
    // every word of the query must appear (any order, any case, mid-word). Name, group and meta are the strong text; the
    // rest (book name, aliases, description) counts only when nothing matches the strong text, so "explosive" lists the
    // explosives, not every item from the book "Explosive Decompression".
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    const inGroup = items.filter(i => !group || i.group === group)
    const has = (parts: (string | undefined)[]) => {
      const hay = parts.filter(Boolean).join(' | ').toLowerCase()
      return words.every(w => hay.includes(w))
    }
    const strong = inGroup.filter(i => has([i.name, i.group, i.meta]))
    const hits = !words.length || strong.length ? strong : inGroup.filter(i => has([i.name, i.group, i.meta, i.text, i.search]))
    return hits // (callers hand the items in A-Z; search keeps that order)
  }, [items, q, group])
  const shown = matches.slice(0, 300)
  return (
    <div className="picker">
      <div className="row">
        <input
          type="search"
          autoFocus
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          style={{ flex: 1 }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              list.current?.querySelector<HTMLElement>('[role=option][tabindex]')?.focus()
            }
          }}
        />
        {groups && (
          <select value={group} onChange={e => setGroup(e.target.value)} aria-label="Filter">
            <option value="">All</option>
            {groups.map(g => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        )}
      </div>
      <ul role="listbox" aria-label="Matches" ref={list}>
        {shown.map(i => (
          <li
            key={i.id}
            role="option"
            aria-selected={focused === i.id}
            tabIndex={i.disabled ? undefined : 0}
            className={i.disabled ? 'off' : undefined}
            onFocus={() => setFocused(i.id)}
            onBlur={() => setFocused(f => (f === i.id ? '' : f))}
            onClick={() => !i.disabled && onPick(i.id)}
            onKeyDown={e => pickKey(e, () => !i.disabled && onPick(i.id))}
          >
            <span>
              <EntryHover row={i.card} kind={i.cardKind} open={focused === i.id} tabbable={false}>
                <b>{i.name}</b>
              </EntryHover>{' '}
              {i.meta && <span className="muted">{i.meta}</span>} {i.label}
            </span>
            <span className="num">
              {i.price}
              {i.action && (
                <span onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                  {' '}
                  {i.action}
                </span>
              )}
            </span>
            {i.text && <span className="t">{i.text}</span>}
          </li>
        ))}
        {matches.length > shown.length && (
          <li role="option" aria-selected={false} aria-disabled className="muted">
            Showing the first {shown.length} of {matches.length}: type or pick a category to narrow.
          </li>
        )}
        {!shown.length && (
          <li role="option" aria-selected={false} aria-disabled className="muted">
            Nothing matches “{q}”.
          </li>
        )}
      </ul>
    </div>
  )
}

/** Tab and Shift+Tab stay inside a dialog: from its last control to its first, and back (the page behind is inert anyway). */
function trapTab(e: React.KeyboardEvent<HTMLDialogElement>) {
  if (e.key !== 'Tab') return
  const all = [...e.currentTarget.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
    el => !(el as HTMLButtonElement).disabled && el.offsetParent !== null,
  )
  const first = all[0],
    last = all[all.length - 1]
  if (!first) return
  if (e.shiftKey ? document.activeElement === first : document.activeElement === last) {
    e.preventDefault()
    ;(e.shiftKey ? last : first).focus()
  }
}

/** The logo, home link and this build's version (vite.config.ts, from package.json): the game's own on #/sr6... */
export const Brand = () =>
  /^#\/?sr6(\/|$)/.test(location.hash) ? (
    <span className="brand-row">
      <a className="brand" href="#/sr6">
        Nova Prime Chummer <b>Shadowrun</b> 6
      </a>
      <span className="ver">v{__APP_VERSION__}</span>
    </span>
  ) : (
    <span className="brand-row">
      <a className="brand" href="#/">
        Nova Prime Chummer <b>Anarchy</b> 2.0
      </a>
      <span className="ver">v{__APP_VERSION__}</span>
    </span>
  )

/** A modal <dialog> that opens when `open` is true. Esc or the close button calls onClose; Tab stays inside; closing puts
 *  focus back where it was. light: a click outside it closes it too (a small settings popover, nothing to lose). */
export function Modal({
  open,
  onClose,
  title,
  children,
  actions,
  className,
  light,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  actions?: ReactNode
  className?: string
  light?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const tid = useId() // two dialogs can be open at once (an edit over a picker)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    // React passes a nested dialog's close and cancel up to this one too: only its own count
    <dialog
      ref={ref}
      className={className}
      onClose={e => e.target === e.currentTarget && onClose()}
      onKeyDown={trapTab}
      onClick={
        light
          ? e => {
              // the backdrop is the dialog itself: a click outside its box
              const r = e.currentTarget.getBoundingClientRect()
              if (e.target === e.currentTarget && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) onClose()
            }
          : undefined
      }
      onCancel={e => {
        if (e.target !== e.currentTarget) return
        e.preventDefault()
        onClose()
      }}
      aria-labelledby={tid}
    >
      {open && (
        <>
          <h2 id={tid}>{title}</h2>
          {children}
          <div className="actions">
            {actions ?? (
              <button className="btn" onClick={onClose}>
                Close
              </button>
            )}
          </div>
        </>
      )}
    </dialog>
  )
}

export function Line({ label, amount, guide, over }: { label: ReactNode; amount: ReactNode; guide?: ReactNode; over?: boolean }) {
  return (
    <div className={`line${over ? ' over' : ''}`}>
      <span className="lbl">{label}</span>
      <span className="lead" />
      <span className="amt num">{amount}</span>
      {guide != null && <span className="guide">/ {guide}</span>}
    </div>
  )
}

/** Runs `work` on every item, at most `at` at once (a few: many saves to the server, without flooding it), calling `step`
 *  as each finishes. `work` reports its own failures: one that throws stops the rest. */
export async function inBatches<T>(items: T[], work: (x: T) => Promise<void>, step: () => void, at = 4) {
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(at, items.length) }, async () => {
      while (next < items.length) {
        await work(items[next++])
        step()
      }
    }),
  )
}

/** A long job's progress, inside its page's status line: "Loading book NPCs: 120 of 450…" and a bar. */
export interface Busy {
  what: string
  done: number
  total: number
}
export const Working = ({ busy }: { busy: Busy }) => (
  <>
    {busy.what}: {busy.done} of {busy.total}… <progress value={busy.done} max={busy.total || 1} aria-hidden />
  </>
)

/** Suggestions for the free-text gender fields (both games' Concept tabs, each SR6 SIN): `list={GENDER_LIST}` and one
 *  <GenderList /> on the tab. Anything else may be typed. */
export const GENDERS = ['Female', 'Male', 'Non-binary', 'Agender', 'Genderfluid', 'Other']
export const GENDER_LIST = 'gender-suggestions'
export const GenderList = () => (
  <datalist id={GENDER_LIST}>
    {GENDERS.map(g => (
      <option key={g} value={g} />
    ))}
  </datalist>
)
