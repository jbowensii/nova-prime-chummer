// The Shadowrun 6 catalog's kinds: one data file per kind (custom/sr6/imported/<source>/<kind>.xml), each entry under
// its tag. The same map is SR6_KINDS in server/games.mjs and KINDS in importer/sr6/__init__.py. docs/sr6-data-format.md.
import type { Formula, Issue } from '../../../core/shared/formula'

export type Sr6Kind =
  | 'priorities'
  | 'metatypes'
  | 'attributes'
  | 'skills'
  | 'qualities'
  | 'weapons'
  | 'armor'
  | 'augmentations'
  | 'grades'
  | 'electronics'
  | 'programs'
  | 'gear'
  | 'vehicles'
  | 'spells'
  | 'rituals'
  | 'adeptpowers'
  | 'complexforms'
  | 'metamagics'
  | 'echoes'
  | 'martialarts'
  | 'martialtechniques'
  | 'traditions'
  | 'critterpowers'
  | 'critters'
  | 'spirits'
  | 'npcs'
  | 'sprites'
  | 'lifestyles'
  | 'contacts'
  | 'lifemodules'
  | 'actions'
  | 'packs'
  | 'vehicledesign'
  | 'ammotypes'
  | 'mentorspirits'
  | 'datastructures'
  | 'qualitypaths'
  | 'spellfeatures'
  | 'contacttypes'
  | 'qualitysets'
  | 'licencetypes'
  | 'magictypes'
  | 'ruleoptions'
  | 'senses'
  | 'trueelements'
  | 'categories'
  | 'rules'

export const SR6_KINDS: Record<Sr6Kind, { tag: string; label: string }> = {
  priorities: { tag: 'priority', label: 'Priorities' },
  metatypes: { tag: 'metatype', label: 'Metatypes' },
  attributes: { tag: 'attribute', label: 'Attributes' },
  skills: { tag: 'skill', label: 'Skills' },
  qualities: { tag: 'quality', label: 'Qualities' },
  weapons: { tag: 'weapon', label: 'Weapons' },
  armor: { tag: 'armor', label: 'Armor' },
  augmentations: { tag: 'augmentation', label: 'Augmentations' },
  grades: { tag: 'grade', label: 'Augmentation grades' },
  electronics: { tag: 'device', label: 'Electronics' },
  programs: { tag: 'program', label: 'Programs' },
  gear: { tag: 'gear', label: 'Gear' },
  vehicles: { tag: 'vehicle', label: 'Vehicles and drones' },
  spells: { tag: 'spell', label: 'Spells' },
  rituals: { tag: 'ritual', label: 'Rituals' },
  adeptpowers: { tag: 'adeptpower', label: 'Adept powers' },
  complexforms: { tag: 'complexform', label: 'Complex forms' },
  metamagics: { tag: 'metamagic', label: 'Metamagics' },
  echoes: { tag: 'echo', label: 'Echoes' },
  martialarts: { tag: 'martialart', label: 'Martial arts' },
  martialtechniques: { tag: 'martialtechnique', label: 'Martial art techniques' },
  traditions: { tag: 'tradition', label: 'Traditions' },
  critterpowers: { tag: 'critterpower', label: 'Critter powers' },
  critters: { tag: 'critter', label: 'Critters' },
  spirits: { tag: 'spirit', label: 'Spirits' },
  npcs: { tag: 'npc', label: 'NPCs' },
  sprites: { tag: 'sprite', label: 'Sprites' },
  lifestyles: { tag: 'lifestyle', label: 'Lifestyles' },
  contacts: { tag: 'contact', label: 'Contacts' },
  lifemodules: { tag: 'lifemodule', label: 'Life modules' },
  actions: { tag: 'action', label: 'Actions' },
  packs: { tag: 'pack', label: 'Gear packs' },
  vehicledesign: { tag: 'design', label: 'Vehicle design' },
  ammotypes: { tag: 'ammotype', label: 'Ammunition types' },
  mentorspirits: { tag: 'mentorspirit', label: 'Mentor spirits' },
  datastructures: { tag: 'datastructure', label: 'Data structures' },
  qualitypaths: { tag: 'qualitypath', label: 'Quality paths' },
  spellfeatures: { tag: 'spellfeature', label: 'Spell features' },
  contacttypes: { tag: 'contacttype', label: 'Contact types' },
  qualitysets: { tag: 'qualityset', label: 'Quality sets' },
  licencetypes: { tag: 'licencetype', label: 'Licence types' },
  magictypes: { tag: 'magictype', label: 'Magic types' },
  ruleoptions: { tag: 'ruleoption', label: 'Rule options' },
  senses: { tag: 'sense', label: 'Senses' },
  trueelements: { tag: 'trueelement', label: 'True elements' },
  categories: { tag: 'category', label: 'Categories' },
  rules: { tag: 'rule', label: 'Rules' },
}

/** The kinds read from the books' own sections and tables (actions, packs, …): listed in Game data as printed, with no
 *  rules of their own yet (the owner decides how each is used); the Foundry book export carries them (reference journals). */
export const DISPLAY_KINDS: ReadonlySet<Sr6Kind> = new Set<Sr6Kind>([
  'actions',
  'packs',
  'vehicledesign',
  'ammotypes',
  'mentorspirits',
  'datastructures',
  'qualitypaths',
  'spellfeatures',
  'contacttypes',
  'qualitysets',
  'licencetypes',
  'magictypes',
  'ruleoptions',
  'senses',
  'trueelements',
  'categories',
])

/** An augmentation's type (common.xsd). Grades (alpha, beta…) apply to cyberware and bioware only (CRB p. 283, Body Shop
 *  p. 29); the others are bought as printed. */
export const AUG_TYPES = ['cyberware', 'bioware', 'geneware', 'nanoware', 'symbionts', 'transgenics'] as const
export type AugType = (typeof AUG_TYPES)[number]
export const GRADED_TYPES: readonly string[] = ['cyberware', 'bioware']
/** The two families a reader that knows only cyberware and bioware (the Foundry export) maps the others to: nanoware is
 *  cyberware, geneware, symbionts and transgenic infusions bioware. */
export const augFamily = (type: string | undefined): 'cyberware' | 'bioware' =>
  type === 'bioware' || type === 'geneware' || type === 'symbionts' || type === 'transgenics' ? 'bioware' : 'cyberware'

/** An entry's child element other than <name>, <text>, <formula> and <issue> (a priority's <metatype>, a skill's <spec>, a critter's <skills>…). */
export interface Sr6Part {
  tag: string
  attrs: Record<string, string>
  text: string
}
/** One catalog entry, generic in S1 (S2 adds typed views). attrs: every attribute but id, source and page, as printed;
 * text: its description (the texts files); edited/by: from the edits layer (custom/sr6/edits/edits.xml). */
export interface Sr6Entry {
  id: string
  kind: Sr6Kind
  name: string
  source: string
  page: number
  attrs: Record<string, string>
  parts: Sr6Part[]
  text: string
  edited?: boolean
  by?: string
  /** <formula> children: how a field is worked out (src/core/shared/formula.ts); the attribute stays as printed */
  formulas?: Formula[]
  /** <issue> children: a field the book prints nothing for, or that the importer couldn't read; also a formula that can't
   *  be worked out (load.ts). An edit that sets the field clears its issue (the book's stays in `original`). */
  issues?: Issue[]
  /** <alias> names: the other names the book prints it under, and the composed names of a bare part (`Cyberarm` for the
   *  Cyberlimb row `Arm (synthetic)`): searched, never shown as its name */
  aliases?: string[]
  /** <note field> children: a cell's footnote */
  notes?: { field: string; text: string }[]
}
/** origin 'user': a GM's compendium (compendium: which one; publisher: its owner's name). published ("2019-08") and cat
 *  ("CAT28000"): the publication order (src/sr6/engine/npc.ts byPublication). */
export interface Sr6Source {
  id: string
  name: string
  publisher: string
  canon: boolean
  published?: string
  cat?: string
  texts?: string
  file?: string
  sha256?: string
  imported?: string
  origin: 'shipped' | 'imported' | 'user'
  compendium?: { id: string; owner: string; campaign?: string }
}
/** original: the book's version of each edited entry, keyed by entryKey(kind, id) (src/sr6/catalog/domain/load.ts). */
export interface Sr6Catalog {
  entries: Record<Sr6Kind, Map<string, Sr6Entry>>
  sources: Map<string, Sr6Source>
  original: Map<string, Sr6Entry>
  /** an id an entry had in an earlier import (its <alias id kind>), by entryKey(old kind, old id): where it is now */
  moved: Map<string, { kind: Sr6Kind; id: string }>
  /** the families of levels (src/sr6/catalog/domain/levels.ts), by entryKey(kind, family): a rated or leveled entry expanded
   *  into one entry per level (the parent kept here, out of `entries`), or rows the book prints one per level */
  levels?: Map<string, Sr6Family>
  files: { file: string; kind: string; entries: number }[]
  errors: { file: string; message: string }[]
  /** corrections of book sample runners' printed lines (the edits layer's <samplefix>), by sample id */
  sampleFixes?: Map<string, Sr6SampleFix>
}
/** A book sample runner's printed lines corrected (the owner's override file, edits.xsd <samplefix>): each `correct` sets
 *  `field` of the line buying catalog item `item` from `from` to `to`, while the runner's line still has `from`. */
export interface Sr6SampleFix {
  id: string
  source: string
  page: number
  name: string
  by?: string
  text: string
  corrects: { item: string; field: 'rating' | 'qty' | 'grade'; from: string; to: string; note?: string }[]
}

/** A family of levels: the parent (absent for rows the book prints apart) and each level's entry id. */
export interface Sr6Family {
  kind: Sr6Kind
  family: string
  parent?: Sr6Entry
  levels: Map<number, string>
}
