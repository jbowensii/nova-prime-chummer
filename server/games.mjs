// The rulesets the server keeps apart: Shadowrun Anarchy 2.0 (ca2: today's folders and unprefixed /api routes) and
// Shadowrun 6th World (sr6: the same stores one level down, in characters/sr6/ and custom/sr6/, under /api/sr6/).
// docs/superpowers/specs/2026-10-02-sr6-ruleset-design.md §1–§2.
// data: the root of its data-format files (a compendium's); foreign: the other game's namespace prefix, refused anywhere in
// a compendium (server/compendiums.mjs)
export const GAMES = {
  ca2: { id: 'ca2', tag: 'ca2:character', ns: 'urn:chummer-anarchy2:character:1', sub: '',
    data: { tag: 'ca2:data', ns: 'urn:chummer-anarchy2:data:1' }, foreign: 'urn:chummer-sr6:' },
  sr6: { id: 'sr6', tag: 'sr6:character', ns: 'urn:chummer-sr6:character:1', sub: 'sr6',
    data: { tag: 'sr6:data', ns: 'urn:chummer-sr6:data:1' }, foreign: 'urn:chummer-anarchy2:' },
}
/** SR6 catalog kind (its file) -> entry tag, as KINDS in importer/sr6/__init__.py and src/sr6/model/types.ts. */
export const SR6_KINDS = {
  priorities: 'priority', metatypes: 'metatype', attributes: 'attribute', skills: 'skill', qualities: 'quality',
  weapons: 'weapon', armor: 'armor', augmentations: 'augmentation', electronics: 'device', programs: 'program', gear: 'gear',
  vehicles: 'vehicle', spells: 'spell', rituals: 'ritual', adeptpowers: 'adeptpower', complexforms: 'complexform',
  metamagics: 'metamagic', echoes: 'echo', martialarts: 'martialart', martialtechniques: 'martialtechnique',
  traditions: 'tradition', critterpowers: 'critterpower', critters: 'critter', spirits: 'spirit',
  npcs: 'npc', sprites: 'sprite', lifestyles: 'lifestyle', contacts: 'contact',
  lifemodules: 'lifemodule', rules: 'rule',
}
/** Names an Anarchy listing must never reach: not an account (its folder would be characters/sr6/) nor a book id. */
export const RESERVED = ['sr6']

/** `/api/sr6` or `/api/sr6/...` -> { game: 'sr6', path: the same with /api in place of /api/sr6 }; anything else is
 *  Anarchy's, unchanged. */
export function scoped(path) {
  const m = /^\/api\/sr6(?=\/|$)/.exec(path)
  return m ? { game: 'sr6', path: '/api' + path.slice(m[0].length) } : { game: 'ca2', path }
}
