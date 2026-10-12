// Types the catalog browser, its hover card and their callers share (a leaf: no imports of ui/ modules).
import type { ReactNode } from 'react'
import type { Issue } from '../engine/formula'

/** What an entry's effect does on the runner: applied (always on: in the total shown first), conditional (switchable or
 *  on some tests only: in the bracketed total, `6 (9)`), target (a spell's on its target: never on the caster) or low
 *  (read with low confidence from its prose: shown, never applied). */
export interface CardEffect {
  text: string
  state: 'applied' | 'conditional' | 'target' | 'low'
}
export interface BrowseRow {
  key: string
  name: string
  source: string
  page: number
  /** the sub-category inside its kind ("Handguns", "Cyberware: eyeware") */
  group?: string
  /** the printed values, one line */
  details?: string
  /** its description: searched, and shown under Description */
  text?: string
  /** other words a search finds it by (its category with its name, the names it is printed under) */
  search?: string
  /** after the source: Edited, House… */
  marks?: ReactNode
  /** its Edit button or link */
  action?: ReactNode
  /** what needs attention: shown as badges, and Needs attention lists only these rows */
  issues?: Issue[]
  /** what it does on a runner (SR6: its effects, applied or shown only) */
  effects?: CardEffect[]
}
