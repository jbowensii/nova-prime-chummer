// NPCs, critters and spirits: a character with an npc block (CRB p.81 for the average-hits table).
import type { AttrId, Character, Npc } from '../model/types'
import { blankCharacter } from './file'

export const isNpc = (ch: Pick<Character, 'npc'>): boolean => !!ch.npc
/** A critter or spirit has no metatype, so its attributes have no metatype range. */
export const hasNoMetatype = (ch: Pick<Character, 'npc'>): boolean => ch.npc?.kind === 'critter' || ch.npc?.kind === 'spirit'

/** Average hits on a pool of dice pool dp with Risk Reduction rr (CRB p.81 table). */
export const averageHits = (dp: number, rr: number): number => Math.round(dp / 3) + rr + 1

/** "Ranged Weapons 5 (5+A, RR 1)": the pool's average hits, then skill rating + attribute initial and RR; the
 *  specialization's name follows the skill on a spec row, and its +2 counts in the pool (not in the printed rating). */
export function npcPoolLabel(skill: string, spec: string | undefined, rating: number, attr: AttrId, attrValue: number, rr: number): string {
  return `${skill}${spec ? ` (${spec})` : ''} ${averageHits(rating + attrValue + (spec ? 2 : 0), rr)} (${rating}+${attr[0].toUpperCase()}, RR ${rr})`
}

/** A blank NPC: the npc block, no starting gear; a critter or spirit has no metatype unless one is given. */
export function blankNpc(kind: Npc['kind'], tier: Npc['tier'], metatype?: string): Character {
  const ch = blankCharacter('runner', metatype ?? (kind === 'npc' ? 'human' : ''))
  ch.npc = { kind, tier }
  ch.build.items = []
  return ch
}
