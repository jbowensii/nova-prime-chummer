// The Shadowrun 6 runner model (docs/sr6-character-format.md). So far the creation vocabulary the creation rules use;
// S2 Task 3 adds the runner itself.

/** The five creation methods. */
export type Sr6Method = 'priority' | 'sumtoten' | 'pointbuy' | 'karma' | 'lifepath'
export const SR6_METHODS: Sr6Method[] = ['priority', 'sumtoten', 'pointbuy', 'karma', 'lifepath']
export type Letter = 'A' | 'B' | 'C' | 'D' | 'E'
export const LETTERS: Letter[] = ['A', 'B', 'C', 'D', 'E']
/** The priority XSD's magic kinds (public/data/sr6/schema/common.xsd). */
export type MagicKind = 'full' | 'aspected' | 'mystic-adept' | 'adept' | 'technomancer' | 'mundane'
export const MAGIC_KIND_LABELS: Record<MagicKind, string> = {
  full: 'Full magician', aspected: 'Aspected magician', 'mystic-adept': 'Mystic adept', adept: 'Adept', technomancer: 'Technomancer', mundane: 'Mundane',
}
