// The SR6 editor's context: the open runner, the catalog views and creation rules, and everything the engine says about it
// (provider, budgets, violations, derived values). Tabs change the runner through edit (the build), act (an engine step:
// its refusal comes back as a sentence) or update (identity, notes, the character-level setters).
import { createContext, useContext } from 'react'
import type { Violation } from '../../model/types'
import { apply, type Op } from '../engine/actions'
import type { Sr6Budgets } from '../engine/budgets'
import type { CreationRules } from '../engine/creation'
import type { Sr6Data } from '../engine/data'
import type { Sr6Derived } from '../engine/derive'
import type { Provider } from '../engine/providers'
import type { Sr6Attr, Sr6Build, Sr6Character } from '../model/character'
import type { Sr6Catalog } from '../model/types'

export interface Sr6Ctx {
  c: Sr6Catalog; data: Sr6Data; cr: CreationRules; ch: Sr6Character
  p: Provider; budgets: Sr6Budgets; v: Violation[]; d: Sr6Derived
  /** someone else's runner, or a finalized one (every tab but Concept) */
  ro: boolean
  career: boolean
  edit(fn: (b: Sr6Build) => void): void
  /** an engine step; null when done, else why not (a sentence) */
  act(op: Op): string | null
  update(fn: (ch: Sr6Character) => void): void
  undo(): void; redo(): void; canUndo: boolean; canRedo: boolean
}

export const Sr6Editor = createContext<Sr6Ctx | null>(null)
export const useSr6Editor = () => {
  const e = useContext(Sr6Editor)
  if (!e) throw new Error('useSr6Editor outside <Sr6Editor>')
  return e
}
export const sr6EditHref = (id: string, tab: string) => `#/sr6/c/${id}/${tab}`

export const ATTR_NAMES: Record<Sr6Attr, string> = { bod: 'Body', agi: 'Agility', rea: 'Reaction', str: 'Strength', wil: 'Willpower',
  log: 'Logic', int: 'Intuition', cha: 'Charisma', edg: 'Edge', mag: 'Magic', res: 'Resonance' }
/** whole numbers with thousands separators; Essence-like values to two places */
export const n = (x: number) => (Number.isInteger(x) ? x : Math.round(x * 100) / 100).toLocaleString('en-US')

/** The engine's refusal codes (actions.ts) in plain words. */
export const REASONS: Record<string, string> = {
  'below-zero': 'Can’t go below zero.',
  'below-one': 'Can’t go below one.',
  'unknown-attribute': 'The runner has no such attribute.',
  'unknown-entry': 'That isn’t in the catalog.',
  'unknown-line': 'That isn’t on the runner any more.',
  'unknown-host': 'The item to fit it on isn’t on the runner any more.',
  'unknown-grade': 'That grade isn’t set up: Game data → Creation rules.',
  'unknown-choice': 'That life module has no such choice.',
  'unknown-option': 'That isn’t one of the choice’s options.',
  'skill-untrained': 'Give the skill a rank first.',
  'already-taken': 'The runner already has that.',
  'not-taken': 'The runner doesn’t have that.',
  'free-trait': 'A metatype trait can’t be removed.',
  'no-levels': 'That has no levels.',
  'max-level': 'That’s already at its highest level.',
  duplicate: 'The runner already has that power, and it has no levels.',
  'rating-range': 'That rating is outside the item’s range.',
  'own-line': 'Each of these is its own line: add another one instead.',
  'not-fitted': 'That accessory isn’t fitted to it.',
  native: 'A native language is free: it has no ranks to buy.',
  'not-point-buy': 'Character points are for point buy only.',
  'not-lifepath': 'Life modules are for lifepath only.',
  'not-available': 'That life module isn’t open to this runner.',
  'module-count': 'Every adult life module is already picked.',
  'licence-above-sin': 'A licence can’t be rated above its fake SIN.',
  'conversion-cap': 'That’s more karma than may be turned into nuyen.',
  'not-awakened': 'Only an awakened runner can be initiated.',
  'not-emerged': 'Only an emerged runner can submerge.',
}
export const reasonText = (code: string) => REASONS[code] ?? `${code[0].toUpperCase()}${code.slice(1).replace(/-/g, ' ')}.`

/** One engine step on a copy of the runner: the changed copy, or why not. */
export function runAct(ch: Sr6Character, op: Op, data: Sr6Data, cr: CreationRules): { ch: Sr6Character } | { error: string } {
  const next = structuredClone(ch)
  const r = apply(next.build, op, data, cr)
  return r.ok ? { ch: next } : { error: reasonText(r.reason) }
}
