// Editor context: the open character plus everything the engine says about it.
// Edits mutate a draft (with undo); once finalized, each build change is also logged in the ledger (engine/career.ts logChange).
import { createContext, useContext } from 'react'
import type { CareerEvent, Catalog, Character, Override, Violation } from '../model/types'
import type { Derived } from '../engine/derive'
import type { PriceBreakdown } from '../engine/price'
import type { TableFlags } from '../model/types'

export interface ConfirmSpec {
  title: string
  lines: [string, string][]
  cost: number
  balanceAfter: number
}

export interface EditorCtx {
  c: Catalog
  ch: Character
  d: Derived
  v: Violation[]
  p: PriceBreakdown
  balance: number
  career: boolean
  /** someone else's runner: read only (a GM may still approve its rule problems) */
  ro?: boolean
  /** the table's switches (Table setup), once loaded: the optional rules the GM switched on */
  table?: TableFlags
  /** a build edit (undoable; logged in the ledger once finalized) */
  edit: (fn: (draft: Character) => void) => void
  /** any other edit: identity, narrative, overrides, layout (undoable) */
  update: (fn: (draft: Character) => void) => void
  /** finalized: confirm, then append an event (earnings); not undoable */
  record: (ev: CareerEvent, summary: string) => Promise<boolean>
  replace: (ch: Character) => void
  /** GM approval: the runner's approvals replaced (null when done, else why not); null for a viewer who isn't a GM or the
   *  admin, or someone else's runner outside a campaign */
  approve: ((overrides: Override[]) => Promise<string | null>) | null
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}

export const Editor = createContext<EditorCtx | null>(null)
export const useEditor = () => {
  const e = useContext(Editor)
  if (!e) throw new Error('useEditor outside <Editor>')
  return e
}

/** A tab of the character's editor: #/c/<id>/<tab> for a runner, #/n/<id>/<tab> for an NPC (its own store). */
export const editHref = (ch: Pick<Character, 'id' | 'npc'>, tab: string) => `#/${ch.npc ? 'n' : 'c'}/${ch.id}/${tab}`
/** Where the editor's "back" goes: the runner list, or the NPC area's section: NPCs, or Critters (critters and spirits). */
export const homeHref = (ch: Pick<Character, 'npc'> | undefined) => (!ch?.npc ? '#/' : ch.npc.kind === 'npc' ? '#/npcs' : '#/npcs/critters')
