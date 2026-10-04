// The Shadowrun 6 catalog's kinds: one data file per kind (custom/sr6/imported/<source>/<kind>.xml), each entry under
// its tag. The same map is SR6_KINDS in server/games.mjs and KINDS in importer/sr6/__init__.py. docs/sr6-data-format.md.
export type Sr6Kind =
  | 'priorities' | 'metatypes' | 'attributes' | 'skills' | 'qualities' | 'weapons' | 'armor' | 'augmentations'
  | 'electronics' | 'gear' | 'vehicles' | 'spells' | 'rituals' | 'adeptpowers' | 'complexforms' | 'metamagics'
  | 'echoes' | 'critterpowers' | 'critters' | 'spirits' | 'npcs' | 'sprites' | 'lifestyles' | 'contacts' | 'lifemodules' | 'rules'

export const SR6_KINDS: Record<Sr6Kind, { tag: string; label: string }> = {
  priorities: { tag: 'priority', label: 'Priorities' },
  metatypes: { tag: 'metatype', label: 'Metatypes' },
  attributes: { tag: 'attribute', label: 'Attributes' },
  skills: { tag: 'skill', label: 'Skills' },
  qualities: { tag: 'quality', label: 'Qualities' },
  weapons: { tag: 'weapon', label: 'Weapons' },
  armor: { tag: 'armor', label: 'Armor' },
  augmentations: { tag: 'augmentation', label: 'Augmentations' },
  electronics: { tag: 'device', label: 'Electronics' },
  gear: { tag: 'gear', label: 'Gear' },
  vehicles: { tag: 'vehicle', label: 'Vehicles and drones' },
  spells: { tag: 'spell', label: 'Spells' },
  rituals: { tag: 'ritual', label: 'Rituals' },
  adeptpowers: { tag: 'adeptpower', label: 'Adept powers' },
  complexforms: { tag: 'complexform', label: 'Complex forms' },
  metamagics: { tag: 'metamagic', label: 'Metamagics' },
  echoes: { tag: 'echo', label: 'Echoes' },
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

/** An entry's child element other than <name> and <text> (a priority's <metatype>, a skill's <spec>, a critter's <skills>…). */
export interface Sr6Part { tag: string; attrs: Record<string, string>; text: string }
/** One catalog entry, generic in S1 (S2 adds typed views). attrs: every attribute but id, source and page, as printed;
 * text: its description (the texts files); edited/by: from the edits layer (custom/sr6/edits/edits.xml). */
export interface Sr6Entry {
  id: string; kind: Sr6Kind; name: string; source: string; page: number; attrs: Record<string, string>; parts: Sr6Part[]; text: string
  edited?: boolean; by?: string
}
export interface Sr6Source {
  id: string; name: string; publisher: string; canon: boolean; texts?: string; file?: string; sha256?: string; imported?: string
  origin: 'shipped' | 'imported'
}
/** original: the book's version of each edited entry, keyed by entryKey(kind, id) (src/sr6/engine/load.ts). */
export interface Sr6Catalog {
  entries: Record<Sr6Kind, Map<string, Sr6Entry>>
  sources: Map<string, Sr6Source>
  original: Map<string, Sr6Entry>
  files: { file: string; kind: string; entries: number }[]
  errors: { file: string; message: string }[]
}
