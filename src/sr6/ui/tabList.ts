// The SR6 editor's tabs (EditorView's tab bar, Review's links to them, the page title in Sr6App)
import { MAGIC_KINDS } from '../engine/data'
import type { MagicKind } from '../model/character'

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
export const NPC_TABS: [string, string][] = [
  ['concept', 'Concept'],
  ['stats', 'Stat block'],
  ['print', 'Print'],
]
