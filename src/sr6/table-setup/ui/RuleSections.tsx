// The creation rules in foldable sections (creationLayout.ts), for Table setup, a campaign's page and a runner's Creation
// rules panel: the search box filters rows by name, a section shows its rows only while it is open (so a closed section
// costs nothing to draw), and each section can be reset to the standard values. The caller draws a row.
import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { CREATION_GROUPS, nested } from '../domain/creation'
import { ALPHA_SECTIONS, RULE_META, SECTION_ABOUT, SECTIONS, sectionOf, splitLabel, type Section } from './creationLayout'

export interface RuleItem {
  key: string
  label: string
  group: string
}
/** the sub-headings inside the big sections (the old groups that say something) */
const SUB = new Set([
  'Karma prices',
  'Advancement',
  'Nuyen',
  'Sum to ten',
  'Point buy',
  'Karma build',
  'Metatypes',
  'Lifepath',
  'Augmentation grades',
  'Derived values',
])
const SUBHEADED = new Set<Section>(['Budgets & priorities', 'Attributes & skills', 'Gear & augmentations'])
const at = (g: string) => {
  const i = CREATION_GROUPS.indexOf(g)
  return i < 0 ? 99 : i
}

export function RuleSearch({ q, setQ, label }: { q: string; setQ: (q: string) => void; label: string }) {
  return (
    <p className="cr-search">
      <input type="search" value={q} onChange={e => setQ(e.target.value)} aria-label={label} placeholder="Find a setting by name" />
    </p>
  )
}

/** `items` in the order they are listed; `row` draws one; `changed` says which differ from the standard (the badge and
 *  Reset section); `onReset` gets a section's keys. A search with text opens every section that has a match. */
export function RuleSections<T extends RuleItem>({
  items,
  q,
  row,
  changed,
  onReset,
  head,
}: {
  items: T[]
  q: string
  row: (item: T, depth: number) => ReactNode
  changed?: (item: T) => boolean
  onReset?: (keys: string[]) => void
  head?: ReactNode
}) {
  const by = useMemo(() => {
    const sorted = items
      .map((item, i) => ({ item, i }))
      .sort((a, b) => at(a.item.group) - at(b.item.group) || a.i - b.i)
      .map(x => x.item)
    const map = new Map<Section, T[]>()
    for (const item of sorted) {
      const s = sectionOf(item.key, item.group)
      map.set(s, [...(map.get(s) ?? []), item])
    }
    // the rule sections A–Z by their top-level rule, a nested one still right under its parent
    const title = (i: T) => splitLabel(i.label).title
    const order = (s: Section, rows: ReturnType<typeof nested<T>>) =>
      ALPHA_SECTIONS.has(s) ? [...rows].sort((a, b) => title(a.root).localeCompare(title(b.root))) : rows
    return SECTIONS.flatMap(s => (map.has(s) ? [[s, order(s, nested(map.get(s)!))] as const] : []))
  }, [items])
  const [open, setOpen] = useState<Set<Section>>(new Set())
  const want = q.trim().toLowerCase()
  return (
    <div className="cr-sections">
      {!want && (
        <p className="cr-tools">
          <button type="button" className="btn small quiet" onClick={() => setOpen(new Set(by.map(([s]) => s)))}>
            Open all sections
          </button>{' '}
          <button type="button" className="btn small quiet" onClick={() => setOpen(new Set())}>
            Close all sections
          </button>
        </p>
      )}
      {by.map(([section, rows]) => {
        const shown = want ? rows.filter(r => r.item.label.toLowerCase().includes(want)) : rows
        if (!shown.length) return null
        const isOpen = !!want || open.has(section),
          n = changed ? rows.filter(r => changed(r.item)).length : 0
        const sub = SUBHEADED.has(section)
        let last = ''
        return (
          <details
            key={section}
            className="fold sub"
            open={isOpen}
            data-section={section}
            onToggle={e => {
              if (!want) {
                const o = e.currentTarget.open
                setOpen(p => (p.has(section) === o ? p : new Set(o ? [...p, section] : [...p].filter(x => x !== section))))
              }
            }}
          >
            <summary>
              <h3>{section}</h3>
              <span className="muted">
                {want ? `${shown.length} of ${rows.length}` : rows.length} {rows.length === 1 ? 'setting' : 'settings'}
              </span>
              {n > 0 && <span className="cr-changed">{n} changed</span>}
            </summary>
            {isOpen && (
              <>
                <p className="muted small">{SECTION_ABOUT[section]}</p>
                {onReset && !want && (
                  <p>
                    <button
                      type="button"
                      className="btn small"
                      disabled={n === 0}
                      aria-label={`Reset section ${section}`}
                      onClick={() => onReset(rows.map(r => r.item.key))}
                    >
                      Reset section
                    </button>
                  </p>
                )}
                <div className="cr-list">
                  {head}
                  {shown.map(({ item, depth }) => {
                    const title = sub && !depth && item.group !== last && SUB.has(item.group) ? item.group : ''
                    if (!depth && sub) last = SUB.has(item.group) ? item.group : ''
                    return (
                      <Fragment key={item.key}>
                        {title && <h4 className="cr-sub">{title}</h4>}
                        {row(item, depth)}
                      </Fragment>
                    )
                  })}
                </div>
              </>
            )}
          </details>
        )
      })}
      {want && !by.some(([, rows]) => rows.some(r => r.item.label.toLowerCase().includes(want))) && (
        <p className="muted">No setting’s name contains “{q.trim()}”.</p>
      )}
    </div>
  )
}

/** A rule's plain-English line and, for a book's optional rule, its book and page (RULE_META), under its name. */
export function RuleDesc({ k }: { k: string }) {
  const meta = RULE_META[k]
  if (!meta) return null
  return (
    <div className="muted small cr-desc">
      {meta.about}
      {meta.book && <cite> ({meta.book})</cite>}
    </div>
  )
}
