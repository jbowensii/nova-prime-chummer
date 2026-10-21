// What a pick's or quality's note names: the attribute or skill a quality's choice is (`Exceptional (Attribute)`).
import { SR6_ATTRS, type Sr6Attr } from '../formats/domain/character'
import type { Sr6Data } from '../catalog/domain/data'
import { normName } from '../catalog/domain/names'

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
