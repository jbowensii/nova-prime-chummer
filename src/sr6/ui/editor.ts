// The SR6 editor's context: the open runner, the catalog views and creation rules, and everything the engine says about it
// (provider, budgets, violations, derived values). Tabs change the runner through edit (the build), act (an engine step:
// its refusal comes back as a sentence) or update (identity, notes, the character-level setters).
import { createContext, useContext } from 'react'
import type { Override, Violation } from '../../model/types'
import { apply, type Op } from '../engine/actions'
import type { Sr6Budgets } from '../engine/budgets'
import type { Preview, Typed } from '../engine/career'
import { CREATION_KEYS, type CreationRules } from '../engine/creation'
import type { Sr6Data } from '../engine/data'
import type { Sr6Derived } from '../engine/derive'
import type { Provider } from '../engine/providers'
import type { Sr6Advance, Sr6Attr, Sr6Build, Sr6Character, Sr6Npc } from '../model/character'
import type { Sr6Catalog } from '../model/types'

export interface Sr6Ctx {
  c: Sr6Catalog; data: Sr6Data; cr: CreationRules; ch: Sr6Character
  p: Provider; budgets: Sr6Budgets; v: Violation[]; d: Sr6Derived
  /** someone else's runner, or a finalized one (every tab but Concept, Review and Ledger) */
  ro: boolean
  /** finalized: ch is then the runner as it stands (its build with the ledger's live spends replayed) */
  career: boolean
  /** an NPC (#/sr6/n/<id>/<tab>): tabs Concept, Stat block and Print */
  npc: boolean
  edit(fn: (b: Sr6Build) => void): void
  /** an engine step; null when done, else why not (a sentence) */
  act(op: Op): string | null
  update(fn: (ch: Sr6Character) => void): void
  /** the whole runner swapped (Finalize, Back to draft) */
  replace(next: Sr6Character): void
  /** GM approval: the runner's approvals replaced (null when done, else why not); null for a viewer who isn't a GM or the
   *  admin, or someone else's runner outside a campaign */
  approve: ((overrides: Override[]) => Promise<string | null>) | null
  /** career: what a spend would cost, priced on the runner as it stands */
  preview(a: Sr6Advance, typed?: Typed): Preview
  /** career: record a spend; null when recorded, else why not (a sentence). Not on the undo stack: Void undoes it. */
  record(a: Sr6Advance, typed?: Typed): string | null
  /** career: an earning, a note or a void on the stored runner; null when done, else why not */
  ledger(fn: (ch: Sr6Character) => { ok: true; ch: Sr6Character } | { ok: false; reason: string }): string | null
  undo(): void; redo(): void; canUndo: boolean; canRedo: boolean
}

export const Sr6Editor = createContext<Sr6Ctx | null>(null)
export const useSr6Editor = () => {
  const e = useContext(Sr6Editor)
  if (!e) throw new Error('useSr6Editor outside <Sr6Editor>')
  return e
}
/** The Finalized badge's tooltip on the SR6 side. */
export const SR6_FINAL_TIP = 'Finalized: spend karma and nuyen on the Ledger tab'
export const sr6EditHref = (id: string, tab: string) => `#/sr6/c/${id}/${tab}`
export const sr6NpcHref = (id: string, tab = 'stats') => `#/sr6/n/${id}/${tab}`
/** NPCs & Critters' two sections: grunts and contacts are NPCs; critters, spirits and sprites are critters. */
export const npcSection = (npc?: Sr6Npc): 'npcs' | 'critters' => npc && npc.kind !== 'grunt' && npc.kind !== 'contact' ? 'critters' : 'npcs'
/** The NPC list section an NPC lists in (its editor's way back): #/sr6/npcs or #/sr6/npcs/critters. */
export const sr6NpcsHref = (npc?: Sr6Npc) => npcSection(npc) === 'critters' ? '#/sr6/npcs/critters' : '#/sr6/npcs'
/** The editor link for a runner or an NPC. */
export const sr6Href = (ch: { id: string; npc?: unknown }, tab: string) => ch.npc ? sr6NpcHref(ch.id, tab) : sr6EditHref(ch.id, tab)

export const ATTR_NAMES: Record<Sr6Attr, string> = { bod: 'Body', agi: 'Agility', rea: 'Reaction', str: 'Strength', wil: 'Willpower',
  log: 'Logic', int: 'Intuition', cha: 'Charisma', edg: 'Edge', mag: 'Magic', res: 'Resonance' }
/** whole numbers with thousands separators; Essence-like values to two places */
export const n = (x: number) => (Number.isInteger(x) ? x : Math.round(x * 100) / 100).toLocaleString('en-US')

/** The engine's refusal codes (actions.ts, career.ts) in plain words. */
export const REASONS: Record<string, string> = {
  'below-zero': 'Can’t go below zero.',
  'below-one': 'Can’t go below one.',
  'unknown-attribute': 'The runner has no such attribute.',
  'unknown-entry': 'That isn’t in the catalog.',
  'unknown-line': 'That isn’t on the runner any more.',
  'unknown-host': 'The item to fit it on isn’t on the runner any more.',
  'unknown-grade': 'That grade isn’t set up: Table setup → Creation rules.',
  'no-grade': 'Only augmentations come in grades.',
  'unknown-choice': 'That life module has no such choice.',
  'unknown-option': 'That isn’t one of the choice’s options.',
  'already-taken': 'The runner already has that.',
  'not-taken': 'The runner doesn’t have that.',
  'free-trait': 'A metatype trait can’t be removed.',
  'no-levels': 'That has no levels.',
  'no-skill': 'Pick the skill the bonus is for.',
  'max-level': 'That’s already at its highest level.',
  'karma-range': 'That karma is outside the quality’s range.',
  duplicate: 'The runner already has that power, and it has no levels.',
  'rating-range': 'That rating is outside the item’s range.',
  'own-line': 'Each of these is its own line: add another one instead.',
  'not-fitted': 'That accessory isn’t fitted to it.',
  native: 'A native language is free: it has no ranks to buy.',
  'not-point-buy': 'Character points are for point buy only.',
  'not-lifepath': 'Life modules are for lifepath only.',
  'not-available': 'That isn’t an adult life module.',
  'module-count': 'Every adult life module is already picked.',
  'licence-above-sin': 'A licence can’t be rated above its fake SIN.',
  'conversion-cap': 'That’s more karma than may be turned into nuyen.',
  'not-awakened': 'Only an awakened runner can be initiated.',
  'not-emerged': 'Only an emerged runner can submerge.',
  'not-finalized': 'Finalize the runner first: career spends come after creation.',
  'not-enough-karma': 'Not enough karma.',
  'not-enough-nuyen': 'Not enough nuyen.',
  'at-maximum': 'That’s already at its maximum.',
  'needs-name': 'Give it a name first.',
  'not-a-number': 'An amount isn’t a whole number.',
  'already-known': 'The runner already has that.',
  'not-positive': 'Only a positive quality can be bought.',
  'not-negative': 'Only a negative quality can be bought off.',
  'cannot-learn': 'This runner’s magic kind can’t learn that.',
  'no-power-points': 'Not enough power points left.',
  'mundane-cannot-initiate': 'Only an awakened or emerged runner can initiate or submerge.',
  'optional-rule-off': 'That optional rule is off: Table setup → Creation rules.',
  'book-value': 'Its price isn’t a number the app can read: buy it as a custom item.',
  'not-latest': 'Only the newest spend can be voided: void the later ones first.',
  'not-voidable': 'That entry can’t be voided.',
  'already-voided': 'That entry is already voided.',
  'not-signature': 'Only the style’s signature technique comes with it: learn the others one by one.',
}
const LABELS = new Map(CREATION_KEYS.map(k => [k.key, k.label]))
/** A refusal code as a sentence; `unset:<key>` names the setting and where it's set. */
export const reasonText = (code: string) => code.startsWith('unset:')
  ? `${(LABELS.get(code.slice(6)) ?? code.slice(6)).replace(/ \(unset:[^)]*\)$/, '')} isn’t set: Table setup → Creation rules.`
  : REASONS[code] ?? `${code[0].toUpperCase()}${code.slice(1).replace(/-/g, ' ')}.`

/** One engine step on a copy of the runner: the changed copy, or why not. */
export function runAct(ch: Sr6Character, op: Op, data: Sr6Data, cr: CreationRules): { ch: Sr6Character } | { error: string } {
  const next = structuredClone(ch)
  const r = apply(next.build, op, data, cr)
  return r.ok ? { ch: next } : { error: reasonText(r.reason) }
}
