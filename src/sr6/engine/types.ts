// The SR6 creation engine's typed catalog views (data.ts builds them): type declarations only, so the modules
// data.ts imports (grades, effects…) can name Sr6Data without importing data.ts back.
import type { Violation } from '../../model/types'
import type { Letter, MagicKind, Sr6Attr } from '../model/character'
import type { Sr6Entry, Sr6Family, Sr6Kind } from '../model/types'
import type { CreationCatalog } from './creation'

export type RangeAttr = Exclude<Sr6Attr, 'mag' | 'res'>
export type Grant = 'attributePoints' | 'skillPoints' | 'adjustmentPoints' | 'nuyen' | 'contactPoints' | 'knowledgeSkills'

export interface Sr6PriorityRow {
  /** metatype id → adjustment points */
  metatypes: Record<string, number>
  attributes: number
  skills: number
  /** magic kind → rating (0: none printed, e.g. mundane) */
  magic: Partial<Record<MagicKind, number>>
  nuyen: number
  page: number
}
export interface Sr6MetatypeView {
  id: string
  name: string
  ranges: Record<RangeAttr, [number, number]>
  traits: string[]
  page: number
  /** a trait printed with its level (`Hardy 2`: a leveled quality at level 2), by quality id; absent: level 1 */
  traitLevels?: Record<string, number>
  /** a metavariant's adjustment points per metatype priority letter (absent: the priority table's row lists it or not) */
  priority?: Partial<Record<Letter, number>>
}
export interface Sr6SkillView {
  id: string
  name: string
  attr: string
  untrained: boolean
  specs: string[]
  page: number
}
export interface Sr6QualityChoice {
  category: string
  count: number
  max: number | null
}
/** karmaSteps: the prices it is bought at when its price line lists them (`7 or 12 Karma`), never one between */
export interface Sr6QualityView {
  id: string
  name: string
  positive: boolean
  karma: number | null
  karmaMax: number | null
  karmaSteps?: number[]
  perLevel: boolean
  maxLevel: number
  page: number
  category?: string
  /** never bought on its own, only granted by another quality's choice of its category (`Returned Soldier power`) */
  granted?: boolean
  choices?: Sr6QualityChoice[]
  /** not one of the six qualities a runner may take at creation (its text says so) */
  uncounted?: boolean
  /** the metatypes it is for (qualityMetatypes): offered only to them */
  metatypes?: string[]
  /** its Karma while the runner is Awakened (<karmaif flag="awakened">: Mutaqua 44, Astral Hazing 15), with the price's note */
  karmaIf?: { value: number; note?: string }
  /** the rated or leveled entry a family of levels was expanded from (levels.ts): read by a runner line still
   *  naming it, never offered by a picker */
  parent?: true
}
/** costCombat: its cost when the skill it is for is a combat skill (Improved Ability, CRB Hong Kong p. 157) */
export interface Sr6PowerView {
  id: string
  name: string
  cost: number | null
  costCombat?: number | null
  perLevel: boolean
  maxLevel: number
  page: number
  parent?: true
}
/** user: who may take it (absent: any initiate); perLevel: taken again, each time one more initiation's metamagic, up to
 *  maxLevel times (none printed: no limit) */
export interface Sr6MetamagicView {
  id: string
  name: string
  user?: 'adept' | 'magician'
  perLevel: boolean
  maxLevel: number | null
  page: number
  parent?: true
}
export interface Sr6LifeModuleView {
  id: string
  name: string
  stage: 'opening' | 'adult'
  requires?: string
  grants: Partial<Record<Grant, number>>
  /** the contact types its contact points buy or raise (absent: any) */
  contactTypes?: string[]
  choices: { kind: 'mixed'; points: number; options: string[] }[]
  page: number
}
/** A catalog grade (kind grades) by its key (src/sr6/engine/grades.ts): factors null when the book prints none. */
export interface Sr6GradeView {
  id: string
  key: string
  name: string
  essence: number | null
  cost: number | null
  avail: number | null
  types?: string[]
  page: number
  /** the grade a later book redefines as this one (Body Shop's omega: used): offered instead of it */
  replaces?: string
}
export interface Sr6Data extends CreationCatalog {
  priorities: Partial<Record<Letter, Sr6PriorityRow>>
  metatypes: Record<string, Sr6MetatypeView>
  skills: Record<string, Sr6SkillView>
  qualities: Record<string, Sr6QualityView>
  /** adept powers */
  powers: Record<string, Sr6PowerView>
  metamagics: Record<string, Sr6MetamagicView>
  lifemodules: Record<string, Sr6LifeModuleView>
  /** the catalog's implant grades by key (alpha, omega…); a later one with the same key replaces an earlier */
  grades: Record<string, Sr6GradeView>
  /** any catalog entry, for what has no typed view (gear, spells…) */
  entry(kind: Sr6Kind, id: string): Sr6Entry | undefined
  /** an entry by its printed name (normName), in `kind` or else any kind (an effect's link, effects.ts) */
  named?(name: string, kind?: Sr6Kind): Sr6Entry | undefined
  /** the categories' records (categories.ts categoryIndex): an accessory category's hosts */
  categories: Map<string, Sr6Entry[]>
  /** levels (src/sr6/engine/levels.ts): the family an id belongs to (a level's, a printed row's or the hidden parent's),
   *  the entry at a level of it, its levels lowest first, an entry's own level, and whether an id is `target` or a level
   *  of the family `target` names (a creation setting's quality) */
  family(kind: Sr6Kind, id: string | undefined): Sr6Family | undefined
  atLevel(kind: Sr6Kind, id: string | undefined, level: number): Sr6Entry | undefined
  siblings(kind: Sr6Kind, id: string | undefined): Sr6Entry[]
  levelOf(e: Sr6Entry | undefined): number | undefined
  sameFamily(kind: Sr6Kind, id: string, target: string | undefined): boolean
  /** names that didn't resolve (data.unresolved), numbers that didn't read (data.bookValue) and the entries' issues
   *  (catalog.issue), as warnings */
  problems: Violation[]
}
