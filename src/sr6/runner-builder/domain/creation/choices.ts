// What a pick's or quality's note names: the attribute or skill a quality's choice is (`Exceptional (Attribute)`).
import { SR6_ATTRS, type Sr6Attr } from '../../../formats/domain/character'
import type { Sr6Data } from '../../../catalog/domain/data'
import type { Sr6Entry } from '../../../formats/domain/types'
import { normName } from '../../../catalog/domain/names'

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
  kind: 'attribute' | 'skill' | 'quality' | 'matrix'
  options: { value: string; label: string }[]
}
const CORE_ATTRS = ['body', 'agility', 'reaction', 'strength', 'willpower', 'logic', 'intuition', 'charisma']
const cap = (w: string) => w[0].toUpperCase() + w.slice(1)
const titleCase = (t: string) => t.toLowerCase().split(/[_\s]+/).map(cap).join(' ')
// the Matrix attributes (ITEM_ATTRIBUTE choices), in their canonical A/S/D/F order
const MATRIX_ATTRS: Record<string, string> = { ATTACK: 'Attack', SLEAZE: 'Sleaze', DATA_PROCESSING: 'Data Processing', FIREWALL: 'Firewall' }
// a <selection> part's type → the choice kind it names
const SEL_KIND: Record<string, ChoiceSpec['kind']> = { ATTRIBUTE: 'attribute', SKILL: 'skill', QUALITY: 'quality', ITEM_ATTRIBUTE: 'matrix' }
/** What an entry's choice is for and the values it may take. The universal marker is a `<selection>` part naming the
 *  choice domain (ATTRIBUTE/SKILL/QUALITY/ITEM_ATTRIBUTE) and its comma-separated `options`; older entries mark it with a
 *  `ref="CHOICE"` modifier, an `attr/skill(-max):choice` effect, or the `(Attribute)`/`(Skill)` name suffix. Options keep the
 *  data's order. A free-text selection (TEXT/PARAGON/…) returns undefined so the UI keeps a text box. */
export function choiceOptions(data: Sr6Data, e: Sr6Entry | undefined): ChoiceSpec | undefined {
  if (!e) return undefined
  const parts = e.parts ?? []
  const typed = parts.find(p => p.attrs.ref === 'CHOICE' && /^(ATTRIBUTE|SKILL)$/.test(p.attrs.type ?? ''))
  const target = parts.find(p => p.tag === 'effect' && /^(attr|attr-max|skill|skill-max):choice$/.test(p.attrs.target ?? ''))
  const sel = parts.find(p => p.tag === 'selection' && /^(ATTRIBUTE|SKILL|QUALITY|ITEM_ATTRIBUTE)$/.test(p.attrs.type ?? ''))
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
  if (!kind) return undefined
  // explicit catalog options are comma-separated; skill names hold spaces, so never split on whitespace. Prefer the
  // selection part's options, else any typed CHOICE part's (e.g. Improved Mental Attribute's separate selection).
  const tokens = (sel?.attrs.options ?? parts.find(p => p.attrs.options && (p.attrs.ref === 'CHOICE' || p.attrs.type))?.attrs.options ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  let names: string[]
  if (kind === 'attribute') {
    const picked = tokens.map(t => t.toLowerCase()).filter(t => ATTR_WORDS[t])
    names = (picked.length ? picked : CORE_ATTRS).map(cap) // fall back to every core attribute when nothing resolves
  } else if (kind === 'skill') {
    // tokens are skill ids (`biotech`) or names; resolve to the catalog skill name
    const picked = tokens.map(t => data.skills[t]?.name ?? data.skills[noteSkill(data, t) ?? '']?.name).filter((s): s is string => !!s)
    names = picked.length
      ? picked
      : Object.values(data.skills)
          .map(s => s.name)
          .sort((a, b) => a.localeCompare(b))
  } else if (kind === 'quality') {
    // tokens are quality ids with underscores (`artisans_way`); the catalog uses hyphens
    names = tokens.map(t => data.entry('qualities', t.replace(/_/g, '-'))?.name ?? data.entry('qualities', t)?.name).filter((s): s is string => !!s)
  } else {
    names = tokens.map(t => MATRIX_ATTRS[t] ?? titleCase(t)) // matrix attribute labels
  }
  const options = [...new Set(names)].map(v => ({ value: v, label: v }))
  return options.length ? { kind, options } : undefined
}
/** choiceOptions' values plus the current note when it isn't one of them (an older free-text note, `AGI`): so a stored,
 *  still-valid choice stays shown in the dropdown instead of reading blank and being lost on the next edit. */
export function choiceSelectOptions(spec: ChoiceSpec, note?: string): { value: string; label: string }[] {
  const n = (note ?? '').trim()
  return n && !spec.options.some(o => o.value === n) ? [{ value: n, label: n }, ...spec.options] : spec.options
}
