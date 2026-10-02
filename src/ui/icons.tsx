// The header icons (24px line icons, drawn in currentColor) and the icon button/link that carries one: the label is its
// accessible name and its tooltip (data-tip: installTips below shows it above the icon on hover and keyboard focus).
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'

const P: Record<string, ReactNode> = {
  runners: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M8 2v2M16 2v2" /><circle cx="12" cy="11" r="3" /><path d="M7 22v-2a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2" /></>,
  npcs: <><path d="M12 3a8 8 0 0 0-8 8c0 2.5 1.2 4.4 3 5.6V21h10v-4.4c1.8-1.2 3-3.1 3-5.6a8 8 0 0 0-8-8z" /><circle cx="9" cy="11.5" r="1.6" /><circle cx="15" cy="11.5" r="1.6" /><path d="M10 21v-2.5M14 21v-2.5" /></>,
  compendiums: <path d="M4 4v16M8 8v12M12 6v14M16 6l4 14" />,
  campaigns: <><path d="M14.1 5.6a2 2 0 0 0 1.8 0l3.6-1.8a1 1 0 0 1 1.5.9v12.7a1 1 0 0 1-.6.9l-4.5 2.3a2 2 0 0 1-1.8 0l-4.2-2.1a2 2 0 0 0-1.8 0l-3.6 1.8a1 1 0 0 1-1.5-.9V6.6a1 1 0 0 1 .6-.9l4.5-2.3a2 2 0 0 1 1.8 0z" /><path d="M15 5.8v15M9 3.2v15" /></>,
  books: <><path d="M12 7v14" /><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" /></>,
  rules: <><path d="M12 3v18M7 21h10M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" /><path d="m16 16 3-8 3 8c-.9.7-1.9 1-3 1s-2.1-.3-3-1zM2 16l3-8 3 8c-.9.7-1.9 1-3 1s-2.1-.3-3-1z" /></>,
  data: <><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14a9 3 0 0 0 18 0V5" /><path d="M3 12a9 3 0 0 0 18 0" /></>,
  trash: <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />,
  ask: <><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" /></>,
  settings: <><path d="M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.3a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.5a2 2 0 0 1-1 1.7l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.3a2 2 0 0 1 1 1.7v.2a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.3a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.7v-.5a2 2 0 0 1 1-1.7l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.3a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></>,
  account: <><circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 0 0-16 0" /></>,
  plus: <path d="M5 12h14M12 5v14" />,
  upload: <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />,
  download: <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />,
  foundry: <><path d="M7 10H6a4 4 0 0 1-4-4 1 1 0 0 1 1-1h4" /><path d="M7 5a1 1 0 0 1 1-1h13a1 1 0 0 1 1 1 7 7 0 0 1-7 7H8a1 1 0 0 1-1-1z" /><path d="M9 12v5M15 12v5M5 20a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3 1 1 0 0 1-1 1H6a1 1 0 0 1-1-1" /></>,
  examples: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></>,
  book: <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />,
  move: <path d="M2 9V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.7.9l.8 1.2a2 2 0 0 0 1.7.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1M2 13h10M9 16l3-3-3-3" />,
  save: <><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7M7 3v4a1 1 0 0 0 1 1h7" /></>,
  close: <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
  undo: <path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />,
  redo: <path d="m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />,
  back: <path d="m12 19-7-7 7-7M19 12H5" />,
  print: <><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6" /><rect x="6" y="14" width="12" height="8" rx="1" /></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" /></>,
  copies: <><rect x="8" y="8" width="14" height="14" rx="2" /><path d="M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2" /></>,
  ai: <><path d="M12 8V4H8" /><rect x="4" y="8" width="16" height="12" rx="2" /><path d="M2 14h2M20 14h2M15 13v2M9 13v2" /></>,
}
/** "New …": the page's own icon, a little smaller, with a plus at its top right */
const plus = (p: ReactNode) => <><g transform="translate(0 6) scale(0.75)" strokeWidth={2.5}>{p}</g><path d="M19.5 1v6M16.5 4h6" /></>
Object.assign(P, { 'runner-add': plus(P.runners), 'npc-add': plus(P.npcs), 'campaign-add': plus(P.campaigns),
  'compendium-add': plus(P.compendiums), 'account-add': plus(P.account) })
export type IconName = keyof typeof P | 'runner-add' | 'npc-add' | 'campaign-add' | 'compendium-add' | 'account-add'

export const Icon = ({ name }: { name: IconName }) =>
  <svg className="icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.9"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{P[name]}</svg>

type Common = { icon: IconName; label: string; badge?: ReactNode }
const inner = ({ icon, badge }: Common) => <><Icon name={icon} />{badge != null && <span className="ibadge" aria-hidden="true">{badge}</span>}</>
const cls = (extra?: string) => `btn quiet ibtn ${extra ?? ''}`.trim()

export function IconButton({ icon, label, badge, className, ...rest }: Common & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...rest} className={cls(className)} aria-label={label} data-tip={label}>{inner({ icon, label, badge })}</button>
}

export function IconLink({ icon, label, badge, className, ...rest }: Common & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...rest} className={cls(className)} aria-label={label} data-tip={label}>{inner({ icon, label, badge })}</a>
}

/** One tooltip for every [data-tip] control (installed once, main.tsx): shown on hover and on keyboard focus, ABOVE the
 *  control, below it only when there's no room above, and always inside the window (a popover, so it's over dialogs
 *  too). Not while the control's menu is open (.open). */
export function installTips() {
  const tip = Object.assign(document.createElement('div'), { className: 'tip', role: 'tooltip', hidden: true })
  if ('popover' in tip) tip.popover = 'manual'
  document.body.append(tip)
  let on: HTMLElement | null = null
  const hide = () => { on = null; tip.hidden = true; if (tip.matches(':popover-open')) tip.hidePopover() }
  const show = (el: HTMLElement) => {
    if (el.classList.contains('open') || !el.dataset.tip) return hide()
    on = el
    tip.textContent = el.dataset.tip
    tip.hidden = false
    if ('popover' in tip && !tip.matches(':popover-open')) tip.showPopover()
    const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight, gap = 6, edge = 4
    const above = r.top - gap - h >= edge
    tip.dataset.side = above ? 'above' : 'below'
    tip.style.top = `${above ? r.top - gap - h : r.bottom + gap}px`
    tip.style.left = `${Math.max(edge, Math.min(r.left + r.width / 2 - w / 2, document.documentElement.clientWidth - w - edge))}px`
  }
  const target = (e: Event) => (e.target instanceof Element ? e.target.closest<HTMLElement>('[data-tip]') : null)
  document.addEventListener('pointerover', e => { const t = target(e); if (t !== on) { if (t) show(t); else hide() } })
  document.addEventListener('pointerout', e => { if (on && !on.contains(e.relatedTarget as Node | null)) hide() })
  document.addEventListener('focusin', e => { const t = target(e); if (t?.matches(':focus-visible')) show(t) })
  document.addEventListener('focusout', hide)
  document.addEventListener('pointerdown', hide)
  addEventListener('scroll', hide, true)
  addEventListener('resize', hide)
}
