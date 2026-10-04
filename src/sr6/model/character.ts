// The Shadowrun 6 runner model (docs/sr6-character-format.md, public/data/sr6/schema/character.xsd): one runner = one
// <sr6:character> file, read and written by src/sr6/engine/charxml.ts. The build holds what the player spent; budgets,
// rules and derived values are computed from it (src/sr6/engine/*), never stored.
import { newId, type Character, type Override } from '../../model/types'
import type { Sr6Entry } from './types'

/** The five creation methods. */
export type Sr6Method = 'priority' | 'sumtoten' | 'pointbuy' | 'karma' | 'lifepath'
export const SR6_METHODS: Sr6Method[] = ['priority', 'sumtoten', 'pointbuy', 'karma', 'lifepath']
export const SR6_METHOD_LABELS: Record<Sr6Method, string> = { priority: 'Priority', sumtoten: 'Sum to ten', pointbuy: 'Point buy', karma: 'Karma build', lifepath: 'Lifepath' }
export type Letter = 'A' | 'B' | 'C' | 'D' | 'E'
export const LETTERS: Letter[] = ['A', 'B', 'C', 'D', 'E']
export type PriorityColumn = 'metatype' | 'attributes' | 'magic' | 'skills' | 'resources'
export const PRIORITY_COLUMNS: PriorityColumn[] = ['metatype', 'attributes', 'magic', 'skills', 'resources']
/** The priority XSD's magic kinds (public/data/sr6/schema/common.xsd). */
export type MagicKind = 'full' | 'aspected' | 'mystic-adept' | 'adept' | 'technomancer' | 'mundane'
export const MAGIC_KIND_LABELS: Record<MagicKind, string> = {
  full: 'Full magician', aspected: 'Aspected magician', 'mystic-adept': 'Mystic adept', adept: 'Adept', technomancer: 'Technomancer', mundane: 'Mundane',
}
export type Sr6Attr = 'bod' | 'agi' | 'rea' | 'str' | 'wil' | 'log' | 'int' | 'cha' | 'edg' | 'mag' | 'res'
export const CORE_ATTRS: Sr6Attr[] = ['bod', 'agi', 'rea', 'str', 'wil', 'log', 'int', 'cha']
export const SPECIAL_ATTRS: Sr6Attr[] = ['edg', 'mag', 'res']
export const SR6_ATTRS: Sr6Attr[] = [...CORE_ATTRS, ...SPECIAL_ATTRS]
/** Point buy's character-point pools. */
export type CpPool = 'attribute' | 'skill' | 'adjustment' | 'resources' | 'powerPoints' | 'spells' | 'complexForms'
export const CP_POOLS: CpPool[] = ['attribute', 'skill', 'adjustment', 'resources', 'powerPoints', 'spells', 'complexForms']

/** What a ware, power or item adds, entered by the player (R: the catalog carries no bonus data). perRating: × the line's rating. */
export interface Bonus { target: Sr6Attr | 'initDice'; value: number; perRating?: true }
export const BONUS_TARGETS: Bonus['target'][] = [...SR6_ATTRS, 'initDice']

export type PickKind = 'spells' | 'rituals' | 'adeptpowers' | 'complexforms' | 'metamagics' | 'echoes'
export const PICK_KINDS: PickKind[] = ['spells', 'rituals', 'adeptpowers', 'complexforms', 'metamagics', 'echoes']
export type PurchaseKind = 'weapons' | 'armor' | 'augmentations' | 'electronics' | 'gear' | 'vehicles'
export const PURCHASE_KINDS: PurchaseKind[] = ['weapons', 'armor', 'augmentations', 'electronics', 'gear', 'vehicles']

/** A bought thing. No id: a custom item at the player's own cost/avail/essence (R). snapshot: the catalog entry as it was,
 *  written on export so the line still reads when the entry is gone. */
export interface Sr6Purchase {
  uid: string; kind: PurchaseKind; id?: string; name?: string; cost?: number; avail?: number; essence?: number; rating?: number
  qty: number; grade?: string; worn?: true; bonuses?: Bonus[]; note?: string; accessories: Sr6Purchase[]; snapshot?: Sr6Entry
}
export interface Sr6Skill { id: string; points: number; karma: number; spec?: string; expertise?: string }
export interface Sr6Knowledge { uid: string; name: string; kind: 'knowledge' | 'language'; native?: true; points: number; karma: number }
/** free: a metatype trait (costs nothing, can't be removed). name: the catalog name when it was added (shown if the entry goes). */
export interface Sr6Quality { uid: string; id: string; level: number; free?: true; note?: string; name?: string }
export interface Sr6Pick { uid: string; kind: PickKind; id: string; level?: number; bonuses?: Bonus[]; name?: string }
export interface Sr6Contact { uid: string; name: string; archetype: string; connection: number; loyalty: number }
export interface Sr6Sin { uid: string; name: string; kind: 'real' | 'fake'; rating?: number; licences: { name: string; rating: number }[] }
/** choices: a life module's mixed choice, by its index, to the option picked (an attribute abbr, skill:<id> or nuyen:<n>). */
export interface Sr6LifeModule { id: string; choices: Record<number, string> }
export interface Sr6AttrSpend { points: number; adjust: number; karma: number }

export interface Sr6Build {
  method: Sr6Method
  priorities: Record<PriorityColumn, Letter | null>
  cp: Record<CpPool, number>
  lifepath: Sr6LifeModule[]
  /** a metatype id, '' while none is picked */
  metatype: string
  magic: MagicKind
  aspectedSkill?: string; tradition?: string; drainAttr?: 'log' | 'int' | 'cha'
  powerPointsBought: number; initiation: number; submersion: number
  attributes: Record<Sr6Attr, Sr6AttrSpend>
  skills: Sr6Skill[]
  knowledge: Sr6Knowledge[]
  qualities: Sr6Quality[]
  picks: Sr6Pick[]
  purchases: Sr6Purchase[]
  contacts: Sr6Contact[]
  lifestyle?: { id: string; months: number }
  sins: Sr6Sin[]
  karmaToNuyen: number
}

/** identity.metatype mirrors build.metatype (the file keeps it once, on the root). final: the karma and nuyen left at Finalize. */
export interface Sr6Character {
  formatVersion: 1; id: string; identity: Character['identity']; build: Sr6Build
  finalizedAt?: string; final?: { karma: number; nuyen: number }; campaign?: string
  overrides: Override[]; updatedAt: string; lastExportedAt?: string
}

export const blankBuild = (method: Sr6Method = 'priority'): Sr6Build => ({
  method,
  priorities: { metatype: null, attributes: null, magic: null, skills: null, resources: null },
  cp: Object.fromEntries(CP_POOLS.map(p => [p, 0])) as Sr6Build['cp'],
  lifepath: [], metatype: '', magic: 'mundane', powerPointsBought: 0, initiation: 0, submersion: 0,
  attributes: Object.fromEntries(SR6_ATTRS.map(a => [a, { points: 0, adjust: 0, karma: 0 }])) as Sr6Build['attributes'],
  skills: [], knowledge: [], qualities: [], picks: [], purchases: [], contacts: [], sins: [], karmaToNuyen: 0,
})

/** A new runner: no metatype, mundane, nothing spent. */
export function blankSr6(method: Sr6Method = 'priority', id = newId(), now = new Date().toISOString()): Sr6Character {
  return { formatVersion: 1, id, identity: { name: '', streetName: '', metatype: '', background: '', notes: '' },
    build: blankBuild(method), overrides: [], updatedAt: now }
}
