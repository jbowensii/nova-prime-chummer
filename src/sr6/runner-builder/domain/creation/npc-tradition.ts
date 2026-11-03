// NPC tradition: a caster's tradition and drain from its spells line.
import { type Sr6Npc } from '../../../formats/domain/character'
import { type Sr6NpcThing } from './npc-types'
import { npcValues } from './npc-block'

const DRAIN_LABELS = { log: 'Logic', int: 'Intuition', cha: 'Charisma' } as const
/** The three drain attributes every tradition uses one of (owner 2026-10-22), in the order a tie lists them. */
const DRAIN_TRADITIONS = [
  { id: 'logic-based', name: 'Logic-Based Tradition', drainAttr: 'log' },
  { id: 'charisma-based', name: 'Charisma-Based Tradition', drainAttr: 'cha' },
  { id: 'intuition-based', name: 'Intuition-Based Tradition', drainAttr: 'int' },
] as const
export interface Sr6NpcTradition {
  /** the name of each tradition with that drain pool, joined by "or" on a tie */
  tradition: string
  drainAttr: 'log' | 'int' | 'cha'
  drain: number
  /** every tradition with that drain pool, the first the one set (one unless they tie) */
  traditions: { id: string; name: string; drainAttr: 'log' | 'int' | 'cha' }[]
}
/** A caster's tradition (an NPC whose spells line prints a spell; owner 2026-10-21 "NPC spells", 2026-10-22: every
 *  tradition resists Drain with Willpower and one of three attributes): of Willpower + Logic, + Charisma and + Intuition
 *  (CRB p. 127, from the NPC's own stats, augmented: `4(6)` is 6) the largest, as a Logic-, Charisma- or
 *  Intuition-Based Tradition; a tie lists each, the first set. None when Willpower or all three can't be read. */
export function npcTradition(npc: Sr6Npc, things: Sr6NpcThing[]): Sr6NpcTradition | undefined {
  if (!things.some(t => t.part === 'spells')) return
  const v = new Map(
    npcValues(npc).flatMap(x => {
      const m = x.ok ? x.value.match(/^(\d+)(?:\s*\((\d+)\))?$/) : null
      return m ? [[x.key, Number(m[2] ?? m[1])] as const] : []
    }),
  )
  const wil = v.get('wil')
  if (wil == null) return
  const all = DRAIN_TRADITIONS.flatMap(t => (v.has(t.drainAttr) ? [{ ...t, drain: wil + v.get(t.drainAttr)! }] : []))
  if (!all.length) return
  const drain = Math.max(...all.map(t => t.drain)),
    best = all.filter(t => t.drain === drain)
  return {
    tradition: best.map(t => t.name).join(' or '),
    drainAttr: best[0].drainAttr,
    drain,
    traditions: best.map(({ id, name, drainAttr }) => ({ id, name, drainAttr })),
  }
}
/** The tradition's line for the NPC's notes: `Tradition: Logic-Based Tradition (Willpower + Logic), drain pool 9`, a tie's `… or …`. */
export const traditionNote = (t: Sr6NpcTradition) =>
  `Tradition: ${t.traditions.map(x => `${x.name} (Willpower + ${DRAIN_LABELS[x.drainAttr]})`).join(' or ')}, drain pool ${t.drain}`
