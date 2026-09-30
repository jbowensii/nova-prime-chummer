// Editor context: the open character plus everything the engine says about it.
// Edits mutate a draft (with undo); once finalized, each build change is also logged in the ledger (engine/career.ts logChange).
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
  /** a build edit (undoable; logged in the ledger once finalized) */
  edit: (fn: (draft: Character) => void) => void
  /** any other edit: identity, narrative, overrides, layout (undoable) */
  update: (fn: (draft: Character) => void) => void
  /** finalized: confirm, then append an event (earnings); not undoable */
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
