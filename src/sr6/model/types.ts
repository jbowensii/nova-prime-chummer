// The Shadowrun 6 catalog's kinds: one data file per kind (custom/sr6/imported/<source>/<kind>.xml), each entry under
// its tag. The same map is SR6_KINDS in server/games.mjs and KINDS in importer/sr6/__init__.py. docs/sr6-data-format.md.
import type { Formula, Issue } from '../../engine/formula'
import type { Sr6Character } from './character'

export type Sr6Kind =
  | 'priorities' | 'metatypes' | 'attributes' | 'skills' | 'qualities' | 'weapons' | 'armor' | 'augmentations' | 'grades'
  | 'electronics' | 'programs' | 'gear' | 'vehicles' | 'spells' | 'rituals' | 'adeptpowers' | 'complexforms' | 'metamagics'
  | 'echoes' | 'martialarts' | 'martialtechniques' | 'traditions' | 'critterpowers' | 'critters' | 'spirits' | 'npcs' | 'sprites' | 'lifestyles' | 'contacts' | 'lifemodules' | 'rules'

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
  rules: { tag: 'rule', label: 'Rules' },
}

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
export interface Sr6Part { tag: string; attrs: Record<string, string>; text: string }
/** One catalog entry, generic in S1 (S2 adds typed views). attrs: every attribute but id, source and page, as printed;
 * text: its description (the texts files); edited/by: from the edits layer (custom/sr6/edits/edits.xml). */
export interface Sr6Entry {
  id: string; kind: Sr6Kind; name: string; source: string; page: number; attrs: Record<string, string>; parts: Sr6Part[]; text: string
  edited?: boolean; by?: string
  /** <formula> children: how a field is worked out (src/engine/formula.ts); the attribute stays as printed */
  formulas?: Formula[]
  /** <issue> children: a field the book prints nothing for, or that the importer couldn't read; also a formula that can't
   *  be worked out (load.ts). An edit that sets the field clears its issue (the book's stays in `original`). */
  issues?: Issue[]
}
/** origin 'user': a GM's compendium (compendium: which one; publisher: its owner's name). published ("2019-08") and cat
 *  ("CAT28000"): the publication order (src/sr6/engine/npc.ts byPublication). */
export interface Sr6Source {
  id: string; name: string; publisher: string; canon: boolean; published?: string; cat?: string; texts?: string; file?: string; sha256?: string; imported?: string
  origin: 'shipped' | 'imported' | 'user'
  compendium?: { id: string; owner: string; campaign?: string }
}
/** A GM's SR6 compendium (src/sr6/engine/compendium.ts): entries of the compendium kinds citing its own source, and NPCs.
 *  owner/ownerName come from the server (the folder it's stored in), never from the file. */
export interface Sr6Compendium {
  id: string; name: string; source: string; sharing: 'private' | 'campaign' | 'table'; campaign?: string; rev?: number; updatedAt: string
  owner?: string; ownerName?: string
  entries: Sr6Entry[]; npcs: Sr6Character[]
}
/** original: the book's version of each edited entry, keyed by entryKey(kind, id) (src/sr6/engine/load.ts). */
export interface Sr6Catalog {
  entries: Record<Sr6Kind, Map<string, Sr6Entry>>
  sources: Map<string, Sr6Source>
  original: Map<string, Sr6Entry>
  files: { file: string; kind: string; entries: number }[]
  errors: { file: string; message: string }[]
}
