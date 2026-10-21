// The SR6 editor's tabs (EditorView's tab bar, Review's links to them, the page title in Sr6App)
import { MAGIC_KINDS } from '../catalog/domain/data'
import type { MagicKind } from '../formats/domain/character'

/** Every tab; Magic only shows for an awakened or emerged runner, titled Resonance for a technomancer, and Ledger only in
 *  career (sr6Tabs). */
export const SR6_TABS: [string, string][] = [
  ['concept', 'Concept'],
  ['method', 'Creation method'],
  ['attributes', 'Attributes'],
  ['skills', 'Skills'],
  ['qualities', 'Qualities'],
  ['martial', 'Martial arts'],
  ['magic', 'Magic'],
  ['augmentations', 'Augmentations'],
  ['gear', 'Gear'],
  ['vehicles', 'Vehicles'],
  ['drones', 'Drones'],
  ['critters', 'Critters'],
  ['contacts', 'Contacts & lifestyle'],
  ['review', 'Review'],
  ['ledger', 'Ledger'],
  ['print', 'Print'],
]
export const sr6Tabs = (magic: MagicKind, career = false): [string, string][] =>
  SR6_TABS.filter(([k]) => (k !== 'magic' || magic !== 'mundane') && (k !== 'ledger' || career)).map(([k, l]) => [
    k,
    k === 'magic' && MAGIC_KINDS[magic].resonance ? 'Resonance' : l,
  ])
/** An NPC's tabs; Design only for a critter (npcTabs). */
export const NPC_TABS: [string, string][] = [
  ['concept', 'Concept'],
  ['stats', 'Stat block'],
  ['design', 'Design'],
  ['print', 'Print'],
]
export const npcTabs = (kind?: string): [string, string][] => NPC_TABS.filter(([k]) => k !== 'design' || kind === 'critter')
