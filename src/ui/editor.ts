// Editor context: the open character plus everything the engine says about it.
// Creation edits mutate a draft (with undo); career edits become ledger events after a confirm.
import { createContext, useContext } from 'react'
import type { CareerEvent, Catalog, Character, Violation } from '../model/types'
import type { Derived, PriceBreakdown } from '../engine'

export interface ConfirmSpec { title: string; lines: [string, string][]; cost: number; balanceAfter: number }

export interface EditorCtx {
  c: Catalog
  ch: Character
  d: Derived
  v: Violation[]
  p: PriceBreakdown
  balance: number
  career: boolean
  /** creation-mode build edit (undoable) */
  edit: (fn: (draft: Character) => void) => void
  /** edits allowed in both modes: identity, narrative, overrides, worn armor */
  update: (fn: (draft: Character) => void) => void
  /** career mode: confirm, then append the event */
  record: (ev: CareerEvent, summary: string) => Promise<boolean>
  replace: (ch: Character) => void
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
