// The traditions index: the catalog's traditions in three buckets by the attribute they resist Drain with. One grouping
// for the Rules page and the Foundry journal, so they never differ. Pure: no DOM.
import type { Sr6Catalog, Sr6Entry } from '../../formats/domain/types'

export interface TraditionGroup {
  drain: 'log' | 'cha' | 'int'
  /** "Logic-Based" … */
  label: string
  /** the attribute itself ("Logic") */
  attr: string
  traditions: Sr6Entry[]
}
const GROUPS: Omit<TraditionGroup, 'traditions'>[] = [
  { drain: 'log', label: 'Logic-Based', attr: 'Logic' },
  { drain: 'cha', label: 'Charisma-Based', attr: 'Charisma' },
  { drain: 'int', label: 'Intuition-Based', attr: 'Intuition' },
]

/** The three groups in that order, each with its traditions by name; a tradition with no readable drain attribute is in none. */
export const traditionGroups = (c: Sr6Catalog): TraditionGroup[] =>
  GROUPS.map(g => ({
    ...g,
    traditions: [...c.entries.traditions.values()].filter(t => t.attrs.drain?.trim().toLowerCase() === g.drain).sort((a, b) => a.name.localeCompare(b.name)),
  }))
