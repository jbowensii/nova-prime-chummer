// SR6 NPCs (S3): a grunt, contact, critter, spirit or sprite is an SR6 runner file with an <npc> block and a blank build. Its stat
// block is a copy of the catalog entry's printed values and its rating (Professional Rating, Force or Level), read at
// that rating with formula(); its skills line gives dice pools against the catalog's skills. No book numbers here.
export {
  NPC_KINDS,
  NPC_STATS,
  npcKindOf,
  blankSr6Npc,
  npcFromEntry,
  bookNpcKey,
  byPublication,
  type BookNpcVersion,
  bookNpcVersions,
  BOOK_NPC_RATING,
  bookNpc,
  npcValues,
  npcPools,
  npcHeadline,
  poolText,
  npcParts,
} from './npc-block'
export { type Sr6NpcThing, NPC_MATCH, type Sr6NpcMatch } from './npc-types'
export { splitThings } from './npc-parse'
export { ammoRowOf } from './npc-ammo'
export { npcThings } from './npc-things'
export { npcCorrections, attackSkill } from './npc-corrections'
export { type Sr6NpcTradition, npcTradition, traditionNote } from './npc-tradition'
