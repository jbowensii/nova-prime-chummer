// What a pick's or quality's note names: the attribute or skill a quality's choice is (`Exceptional (Attribute)`).
import { SR6_ATTRS, type Sr6Attr } from '../../../formats/domain/character'
import type { Sr6Data } from '../../../catalog/domain/data'
import type { Sr6Entry } from '../../../formats/domain/types'
import { normName } from '../../../catalog/domain/names'
import type { Sr6Build } from '../../../formats/domain/character'

const ATTR_WORDS: Record<string, Sr6Attr> = {
  body: 'bod',
  agility: 'agi',
  reaction: 'rea',
  strength: 'str',
  willpower: 'wil',
  logic: 'log',
  intuition: 'int',
  charisma: 'cha',
  edge: 'edg',
  magic: 'mag',
  resonance: 'res',
}
/** The attribute a quality's note names (`Agility`, `AGI`): the choice of an Exceptional or Impaired (Attribute). */
export function noteAttr(note?: string): Sr6Attr | undefined {
  for (const w of (note ?? '').toLowerCase().split(/[^a-z]+/)) {
    const k = ATTR_WORDS[w] ?? ((SR6_ATTRS as string[]).includes(w) ? (w as Sr6Attr) : undefined)
    if (k) return k
  }
  return undefined
}
/** The skill a quality's note names (`Close Combat`): the catalog skill whose name the note holds, the longest. */
export function noteSkill(data: Sr6Data, note?: string): string | undefined {
  const n = ` ${normName(note ?? '')} `
  return Object.values(data.skills)
    .filter(s => n.includes(` ${normName(s.name)} `))
    .sort((a, b) => b.name.length - a.name.length)[0]?.id
}
/** A quality whose name holds the choice it needs (`Exceptional (Attribute)`, `Aptitude (Skill)`, CRB Hong Kong pp. 70–77:
 *  "select a skill", "select a Physical or Mental attribute"): what its note must name. */
export function qualityChoice(name: string | undefined): 'attribute' | 'skill' | undefined {
  const m = /\((attribute|skill)\)\s*$/i.exec(name ?? '')
  return m ? (m[1].toLowerCase() as 'attribute' | 'skill') : undefined
}

export interface ChoiceSpec {
  kind: 'attribute' | 'skill' | 'specialization' | 'quality' | 'matrix' | 'spell' | 'list' | 'text'
  options: { value: string; label: string }[]
  /** how many picks the book asks for (Natural Venom: 4 vectors); the note holds them joined by `; ` */
  count?: number
}
// Commlink6's skill types (core skills.xml): a SKILL choice's `ref` (Skill Hardwires: PHYSICAL) lists only that type
const SKILL_TYPES: Record<string, string[]> = {
  COMBAT: ['close combat', 'exotic weapons', 'firearms'],
  PHYSICAL: ['athletics', 'outdoors', 'perception', 'stealth'],
  SOCIAL: ['con', 'influence'],
  TECHNICAL: ['biotech', 'cracking', 'electronics', 'engineering', 'piloting'],
  MAGIC: ['astral', 'conjuring', 'enchanting', 'sorcery'],
  RESONANCE: ['tasking'],
}
/** How many picks a selection asks for: `count`, else `distr`'s points (`1 1 1`: three different ones). */
const picks = (a: Record<string, string> = {}) => Math.max(Number(a.count) || 0, (a.distr ?? '').trim() ? a.distr.trim().split(/\s+/).length : 0)
const CORE_ATTRS = ['body', 'agility', 'reaction', 'strength', 'willpower', 'logic', 'intuition', 'charisma']
const cap = (w: string) => w[0].toUpperCase() + w.slice(1)
const titleCase = (t: string) =>
  t
    .toLowerCase()
    .split(/[_\s]+/)
    .map(cap)
    .join(' ')
// the Matrix attributes (ITEM_ATTRIBUTE choices), in their canonical A/S/D/F order
const MATRIX_ATTRS: Record<string, string> = { ATTACK: 'Attack', SLEAZE: 'Sleaze', DATA_PROCESSING: 'Data Processing', FIREWALL: 'Firewall' }
// Every other <selection> type Commlink6 uses (scan of 1.14.0, 2026-10): its listed options title-cased, else the book's set
// (SR6 CRB), else — gear, contacts, programs, SUBSELECT, TEXT… nothing the catalog can list — a free-text box.
const STATIC_LISTS: Record<string, string[]> = {
  SPELL_CATEGORY: ['Combat', 'Detection', 'Health', 'Illusion', 'Manipulation'],
  ELEMENT: ['Acid', 'Cold', 'Electricity', 'Fire'],
  DAMAGE_ELEMENT: ['Acid', 'Cold', 'Electricity', 'Fire'],
  SPIRIT: ['Air', 'Beasts', 'Earth', 'Fire', 'Man', 'Water'],
  SENSE: ['Hearing', 'Sight', 'Smell', 'Taste', 'Touch'],
  MATRIX_ATTRIBUTE: ['Attack', 'Sleaze', 'Data Processing', 'Firewall'],
}
/** What a choice can name from the runner: their contacts' names and the catalog entries of everything they own. */
export interface ChoiceCtx {
  contacts?: string[]
  owned?: Sr6Entry[]
}
/** The runner's contacts and owned entries (nested lines too: a weapon in a mount, an implant in a cyberlimb). */
// one per build and catalog: the editor asks once per purchase line, and each answer walks every line (the editor's builds
// are replaced, never changed in place, on an edit)
const ctxs = new WeakMap<object, { data: Sr6Data; ctx: ChoiceCtx }>()
export function choiceCtx(data: Sr6Data, b: Pick<Sr6Build, 'contacts' | 'purchases'>): ChoiceCtx {
  const hit = ctxs.get(b)
  if (hit?.data === data) return hit.ctx
  const flat = (xs: Sr6Build['purchases']): Sr6Build['purchases'] => xs.flatMap(x => [x, ...flat(x.accessories ?? [])])
  const ctx = {
    contacts: b.contacts.map(c => c.name).filter(Boolean),
    owned: flat(b.purchases)
      .map(x => (x.id ? data.entry(x.kind, x.id) : undefined))
      .filter((e): e is Sr6Entry => !!e),
  }
  ctxs.set(b, { data, ctx })
  return ctx
}
/** Does a catalog entry belong to a GEAR/CARRIED choice's `ref` (Commlink6's item type: CHEMICALS, WEAPON, MELEE,
 *  VEHICLE, DEVICE, ItemType:CYBERWARE)? No ref (or CARRIED) takes anything. */
export function ofRef(e: Sr6Entry, ref = ''): boolean {
  const r = ref.replace(/^ItemType:/i, '').toUpperCase(),
    c = (e.attrs.class ?? '').toUpperCase()
  if (!r || r === 'CARRIED') return true
  if (r === 'WEAPON') return e.kind === 'weapons'
  if (r === 'MELEE') return e.kind === 'weapons' && c.startsWith('WEAPON_CLOSE_COMBAT')
  if (r === 'VEHICLE') return e.kind === 'vehicles'
  if (r === 'DEVICE') return e.kind === 'electronics'
  return c.startsWith(r) // CHEMICALS, CYBERWARE, …
}
const GEAR_KINDS = ['weapons', 'armor', 'augmentations', 'electronics', 'programs', 'gear', 'vehicles'] as const
// types listed from the catalog's own entries
const CATALOG_LISTS: Record<string, (d: Sr6Data, ref: string, ctx: ChoiceCtx) => string[]> = {
  ADEPT_POWER: d => Object.values(d.powers).map(p => p.name),
  MENTOR_SPIRIT: d => d.kindNames?.('mentorspirits') ?? [],
  PARAGON: d => d.kindNames?.('mentorspirits') ?? [], // (Commlink6 files paragons with the mentor spirits)
  AMMUNITION_TYPE: d => d.kindNames?.('ammotypes') ?? [],
  SPRITE_POWER: d =>
    (d.kindEntries?.('sprites') ?? []).flatMap(e => e.parts.filter(p => p.tag === 'powers').flatMap(p => p.text.split(/,|;/).map(t => t.trim()))),
  PROGRAM: d => d.kindNames?.('programs') ?? [],
  SPRITE: d => d.kindNames?.('sprites') ?? [],
  SIGNATURE_MANEUVERS: d => d.kindNames?.('martialtechniques') ?? [],
  ACTION: d => d.kindNames?.('actions') ?? [],
  // a catalog item of the ref's type (Gas Grenade → which chemical, autosoft → which vehicle/weapon model); ref CARRIED:
  // one of the runner's own (Item Attunement)
  GEAR: (d, ref, ctx) =>
    /^CARRIED$/i.test(ref)
      ? (ctx.owned ?? []).map(e => e.name)
      : GEAR_KINDS.flatMap(k => (d.kindEntries?.(k) ?? []).filter(e => ofRef(e, ref)).map(e => e.name)),
  // one of the runner's own items (Weapon Focus → which of their melee weapons, Dying Cyberware → which implant); a text
  // box while they own none
  CARRIED: (_d, ref, ctx) => (ctx.owned ?? []).filter(e => ofRef(e, ref)).map(e => e.name),
  CONTACT: (_d, _r, ctx) => ctx.contacts ?? [], // the runner's own contacts (text box while there are none)
}
/** Every `<selection>` type choiceOptions answers for (the typed ones above plus the lists): a test iterates the catalog's. */
export const HANDLED_SELECTIONS = [
  'ATTRIBUTE',
  'SKILL',
  'QUALITY',
  'ITEM_ATTRIBUTE',
  'SPELL',
  'SKILLSPECIALIZATION',
  ...Object.keys(STATIC_LISTS),
  ...Object.keys(CATALOG_LISTS),
]
// a <selection> part's type → the choice kind it names
const SEL_KIND: Record<string, ChoiceSpec['kind']> = {
  ATTRIBUTE: 'attribute',
  SKILL: 'skill',
  QUALITY: 'quality',
  ITEM_ATTRIBUTE: 'matrix',
  SPELL: 'spell',
  SKILLSPECIALIZATION: 'specialization',
}
/** What an entry's choice is for and the values it may take. The universal marker is a `<selection>` part naming the
 *  choice domain (ATTRIBUTE/SKILL/QUALITY/ITEM_ATTRIBUTE) and its comma-separated `options`; older entries mark it with a
 *  `ref="CHOICE"` modifier, an `attr/skill(-max):choice` effect, or the `(Attribute)`/`(Skill)` name suffix. Options keep the
 *  data's order. A free-text selection (TEXT/PARAGON/…) returns undefined so the UI keeps a text box. */
export function choiceOptions(data: Sr6Data, e: Sr6Entry | undefined, ctx: ChoiceCtx = {}): ChoiceSpec | undefined {
  if (!e) return undefined
  const parts = e.parts ?? []
  const typed = parts.find(p => p.attrs.ref === 'CHOICE' && /^(ATTRIBUTE|SKILL)$/.test(p.attrs.type ?? ''))
  const target = parts.find(p => p.tag === 'effect' && /^(attr|attr-max|skill|skill-max):choice$/.test(p.attrs.target ?? ''))
  const sel = parts.find(p => p.tag === 'selection' && /^(ATTRIBUTE|SKILL|QUALITY|ITEM_ATTRIBUTE|SPELL|SKILLSPECIALIZATION)$/.test(p.attrs.type ?? ''))
  // any other selection part: a list or free text, never nothing
  const listed = parts.some(p => p.tag === 'option') // (its SUBSELECTs are listed as <option>s: ui OptionFields)
  const other = typed || target || sel ? undefined : parts.find(p => p.tag === 'selection' && !(listed && p.attrs.type === 'SUBSELECT'))
  const kind: ChoiceSpec['kind'] | undefined = typed
    ? typed.attrs.type === 'ATTRIBUTE'
      ? 'attribute'
      : 'skill'
    : target
      ? target.attrs.target.startsWith('attr')
        ? 'attribute'
        : 'skill'
      : sel
        ? SEL_KIND[sel.attrs.type!]
        : qualityChoice(e.name)
  if (!kind && other) return otherChoice(data, other.attrs, ctx)
  if (!kind) return undefined
  // explicit catalog options are comma-separated; skill names hold spaces, so never split on whitespace. Prefer the
  // selection part's options, else any typed CHOICE part's (e.g. Improved Mental Attribute's separate selection).
  const tokens = (sel?.attrs.options ?? parts.find(p => p.attrs.options && (p.attrs.ref === 'CHOICE' || p.attrs.type))?.attrs.options ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  let names: string[]
  if (kind === 'attribute') {
    const picked = tokens.map(t => t.toLowerCase()).filter(t => ATTR_WORDS[t] || t === 'armor') // (Armor: a cyberlimb's Attribute increase, CRB p. 288)
    names = (picked.length ? picked : CORE_ATTRS).map(cap) // fall back to every core attribute when nothing resolves
  } else if (kind === 'skill') {
    // tokens are skill ids (`biotech`) or names; resolve to the catalog skill name
    const picked = tokens.map(t => data.skills[t]?.name ?? data.skills[noteSkill(data, t) ?? '']?.name).filter((s): s is string => !!s)
    const typed = SKILL_TYPES[(sel?.attrs.ref ?? '').toUpperCase()]
    // an adept power that also takes combat skills at a higher cost (Improved Ability: `costCombat`, CRB p. 157)
    const combat =
      picked.length && e.attrs.costCombat ? SKILL_TYPES.COMBAT.map(c => data.skills[noteSkill(data, c) ?? '']?.name).filter((s): s is string => !!s) : []
    names = picked.length
      ? [...picked, ...combat]
      : Object.values(data.skills)
          .map(s => s.name)
          .filter(s => !typed || typed.includes(normName(s)))
          .sort((a, b) => a.localeCompare(b))
  } else if (kind === 'specialization') {
    // one of a skill's specializations (Grease Monkey: <selection type="SKILLSPECIALIZATION" ref="engineering">)
    // options are `skill/spec` pairs (Enthralling Performance: `con/performance,…`): the spec, its skill named
    names = tokens.length
      ? tokens.map(t => {
          const [sk, sp = ''] = t.split('/')
          const skill = data.skills[sk] ?? data.skills[noteSkill(data, sk.replace(/_/g, ' ')) ?? '']
          const spec = skill?.specs?.find(x => normName(x) === normName(sp.replace(/_/g, ' '))) ?? titleCase(sp)
          return skill ? `${skill.name} (${spec})` : spec
        })
      : (data.skills[sel?.attrs.ref ?? '']?.specs ?? [])
  } else if (kind === 'quality') {
    // tokens are quality ids with underscores (`artisans_way`); the catalog uses hyphens
    names = tokens.map(t => data.entry('qualities', t.replace(/_/g, '-'))?.name ?? data.entry('qualities', t)?.name).filter((s): s is string => !!s)
  } else if (kind === 'spell') {
    // no listed options → every catalog spell, A to Z; listed options resolve to their spells (an
    // unresolvable option surfaces as a missing entry rather than silently reopening the whole list)
    const picked = tokens.map(t => data.entry('spells', t)?.name ?? data.entry('spells', t.replace(/_/g, '-'))?.name).filter((s): s is string => !!s)
    names = tokens.length ? picked : data.spellNames
  } else {
    names = tokens.map(t => MATRIX_ATTRS[t] ?? titleCase(t)) // matrix attribute labels
  }
  const options = [...new Set(names)].map(v => ({ value: v, label: v }))
  // a non-Matrix ITEM_ATTRIBUTE choice (Shock Shield, Attribute Overclocking): an ordinary list, not "Which Matrix attribute"
  if (kind === 'matrix' && tokens.some(t => !MATRIX_ATTRS[t])) return options.length ? { kind: 'list', options } : undefined
  const n = picks(sel?.attrs) > 1 ? { count: picks(sel?.attrs) } : {}
  return options.length ? { kind, options, ...n } : sel ? { kind: 'text', options: [], ...n } : undefined // a selection nothing can list: a text box
}
function otherChoice(data: Sr6Data, a: Record<string, string>, ctx: ChoiceCtx): ChoiceSpec {
  const type = a.type ?? ''
  const listed = (a.options ?? '')
    .split(',')
    .map(t => t.trim())
    .filter(Boolean)
  const cat = CATALOG_LISTS[type]
  const names = listed.length ? listed.map(t => MATRIX_ATTRS[t] ?? titleCase(t)) : (STATIC_LISTS[type] ?? cat?.(data, a.ref ?? '', ctx) ?? [])
  const options = [...new Set(names)].sort((x, y) => x.localeCompare(y)).map(v => ({ value: v, label: v }))
  const count = picks(a) > 1 ? { count: picks(a) } : {}
  return options.length ? { kind: 'list', options, ...count } : { kind: 'text', options: [], ...count }
}
/** choiceOptions' values plus the current note when it isn't one of them (an older free-text note, `AGI`): so a stored,
 *  still-valid choice stays shown in the dropdown instead of reading blank and being lost on the next edit. */
export function choiceSelectOptions(spec: ChoiceSpec, note?: string): { value: string; label: string }[] {
  const n = (note ?? '').trim()
  return n && !spec.options.some(o => o.value === n) ? [{ value: n, label: n }, ...spec.options] : spec.options
}
