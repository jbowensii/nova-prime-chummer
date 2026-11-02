// Where a problem shows and where it's fixed. A violation shows on the tab its path starts with (a vehicle line on Drones
// when it's a drone; a Magic pick on Method once the Magic tab is gone) and is fixed at its fixAt, by default the same tab
// and the row its path names (`magic.<uid>`). Rows and sections carry data-target; #/sr6/c/<id>/<tab>/<target> scrolls to
// one, flashes it and focuses it. The panel lists a tab's open problems (the context's, never re-validated) with Go fix.
import { useEffect } from 'react'
import type { FixAt, Violation } from '../../../core/shared/types'
import type { Sr6Data } from '../../catalog/domain/data'
import type { Sr6Character } from '../../formats/domain/character'
import { purchaseTab } from '../domain/creation/purchases'
import { sr6Href, useSr6Editor } from './editor'

type Tabs = readonly (readonly [string, string])[]

/** The tab a violation shows on, undefined when no tab is open for it. */
export function shownTab(ch: Sr6Character, data: Sr6Data, tabs: Tabs, path: string): string | undefined {
  const [head, uid] = path.split('.'),
    x = head === 'vehicles' ? ch.build.purchases.find(y => y.uid === uid) : undefined
  return x ? purchaseTab(x, data) : tabs.some(([k]) => k === head) ? head : head === 'magic' ? 'method' : undefined
}

/** Where it's fixed: its fixAt, else the tab it shows on and the row its path names. */
export function fixAtOf(ch: Sr6Character, data: Sr6Data, tabs: Tabs, x: Violation): FixAt | undefined {
  if (x.fixAt) return x.fixAt
  const tab = shownTab(ch, data, tabs, x.path),
    uid = x.path.split('.')[1]
  return tab ? (uid && tab !== 'method' ? { tab, target: uid } : { tab }) : undefined
}

export const fixHref = (ch: Sr6Character, at: FixAt) => sr6Href(ch, at.target ? `${at.tab}/${at.target}` : at.tab)

/** Scroll to the row or section named by the route's last segment, flash it and give it the focus. */
export function useScrollToTarget(target: string | undefined, ready: boolean) {
  useEffect(() => {
    if (!target || !ready) return
    const el = document.querySelector<HTMLElement>(`[data-target="${CSS.escape(target)}"]`) ?? document.getElementById(target)
    if (!el) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView?.({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
    el.focus({ preventScroll: true })
    el.classList.add('target-flash')
    const t = setTimeout(() => el.classList.remove('target-flash'), 2000)
    return () => clearTimeout(t)
  }, [target, ready])
}

/** The blocking problems that show on this tab, each with Go fix to where it's fixed. */
export function ProblemsPanel({ tab, tabs }: { tab: string; tabs: Tabs }) {
  const { ch, data, v } = useSr6Editor()
  const mine = v.filter(x => x.severity === 'error' && !x.approved && shownTab(ch, data, tabs, x.path) === tab)
  if (!mine.length) return null
  return (
    <div className="problems" role="region" aria-label="Problems on this tab">
      {mine.map(x => {
        const at = fixAtOf(ch, data, tabs, x)
        return (
          <div key={`${x.code}|${x.path}|${x.message}`} className="viol">
            <span className="sev err">Problem</span>
            <span className="msg">{x.message}</span>
            {at && (at.tab !== tab || at.target) && (
              <a className="btn small" href={fixHref(ch, at)}>
                Go fix{at.tab !== tab ? ` on ${tabs.find(([k]) => k === at.tab)?.[1] ?? at.tab}` : ''}
              </a>
            )}
          </div>
        )
      })}
    </div>
  )
}
