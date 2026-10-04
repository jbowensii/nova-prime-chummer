// Typed views over the SR6 catalog for the creation engine: the generic S1 entries (attributes and parts as printed)
// read once into the shapes the providers, budgets and rules use. Names the book prints (a priority row's metatypes, a
// metatype's traits) are resolved to ids here; what can't be resolved or read is a warning in `problems`, never a guess.
import type { Violation } from '../../model/types'
import type { MagicKind, Sr6Attr, Letter } from '../model/character'
import type { Sr6Catalog, Sr6Entry, Sr6Kind } from '../model/types'
import type { CreationCatalog } from './creation'
import { rated } from './values'

/** What each magic kind can have (game vocabulary, no numbers). paysPowers: buys its power points (mystic adept). */
export const MAGIC_KINDS: Record<MagicKind, { spells: boolean; powers: boolean; paysPowers: boolean; resonance: boolean }> = {
  full: { spells: true, powers: false, paysPowers: false, resonance: false },
  aspected: { spells: true, powers: false, paysPowers: false, resonance: false },
  'mystic-adept': { spells: true, powers: true, paysPowers: true, resonance: false },
  adept: { spells: false, powers: true, paysPowers: false, resonance: false },
  technomancer: { spells: false, powers: false, paysPowers: false, resonance: true },
  mundane: { spells: false, powers: false, paysPowers: false, resonance: false },
}

export type RangeAttr = Exclude<Sr6Attr, 'mag' | 'res'>
const RANGE_ATTRS: RangeAttr[] = ['bod', 'agi', 'rea', 'str', 'wil', 'log', 'int', 'cha', 'edg']
export type Grant = 'attributePoints' | 'skillPoints' | 'adjustmentPoints' | 'nuyen' | 'contactPoints' | 'knowledgeSkills'
const GRANTS: Grant[] = ['attributePoints', 'skillPoints', 'adjustmentPoints', 'nuyen', 'contactPoints', 'knowledgeSkills']

export interface Sr6PriorityRow {
  /** metatype id → adjustment points */
  metatypes: Record<string, number>; attributes: number; skills: number
  /** magic kind → rating (0: none printed, e.g. mundane) */
  magic: Partial<Record<MagicKind, number>>; nuyen: number; page: number
}
export interface Sr6MetatypeView { id: string; name: string; ranges: Record<RangeAttr, [number, number]>; traits: string[]; page: number }
export interface Sr6SkillView { id: string; name: string; attr: string; untrained: boolean; specs: string[]; page: number }
export interface Sr6QualityView { id: string; name: string; positive: boolean; karma: number | null; perLevel: boolean; maxLevel: number; page: number }
export interface Sr6PowerView { id: string; name: string; cost: number | null; perLevel: boolean; maxLevel: number; page: number }
export interface Sr6LifeModuleView {
  id: string; name: string; stage: 'opening' | 'adult'; requires?: string; grants: Partial<Record<Grant, number>>
  choices: { kind: 'mixed'; points: number; options: string[] }[]; page: number
}
export interface Sr6Data extends CreationCatalog {
  priorities: Partial<Record<Letter, Sr6PriorityRow>>
  metatypes: Record<string, Sr6MetatypeView>
  skills: Record<string, Sr6SkillView>
  qualities: Record<string, Sr6QualityView>
  /** adept powers */
  powers: Record<string, Sr6PowerView>
  lifemodules: Record<string, Sr6LifeModuleView>
  /** any catalog entry, for what has no typed view (gear, spells…) */
  entry(kind: Sr6Kind, id: string): Sr6Entry | undefined
  /** names that didn't resolve (data.unresolved) and numbers that didn't read (data.bookValue), as warnings */
  problems: Violation[]
}

/** As the importer's norm() (importer/sr6/regroup.py): accents and quotes dropped, & as "and", punctuation as spaces,
 *  lower case, no leading "the". */
export function normName(name: string): string {
  const s = name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/&/g, ' and ').replace(/['‘’"“”]/g, '')
  const out = s.replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean).join(' ')
  return out.startsWith('the ') ? out.slice(4) : out
}

export function sr6Data(c: Sr6Catalog): Sr6Data {
  const problems: Violation[] = []
  const all = (k: Sr6Kind) => [...c.entries[k].values()]
  const warn = (code: string, e: Sr6Entry, message: string) =>
    problems.push({ code, severity: 'warning', path: `${e.kind}.${e.id}`, message, source: e.source, page: e.page })
  /** a whole number printed as such (XSD-checked, but an edit or a new import may hold anything); else 0 and a warning */
  const count = (e: Sr6Entry, raw: string | undefined, what: string, absent = 0): number => {
    if (raw == null) return absent
    if (/^\s*\d+\s*$/.test(raw)) return Number(raw)
    warn('data.bookValue', e, `${e.name}: the ${what} “${raw}” isn’t a number the app can read.`)
    return absent
  }
  const bookNum = (e: Sr6Entry, raw: string | undefined, what: string): number | null => {
    if (raw == null) return null
    const v = rated(raw)
    if (v.ok && v.n !== null) return v.n
    warn('data.bookValue', e, `${e.name}: the ${what} “${raw}” isn’t a number the app can read.`)
    return null
  }
  const byName = (k: Sr6Kind) => new Map(all(k).map(e => [normName(e.name), e.id]))
  const metatypeIds = byName('metatypes'), qualityIds = byName('qualities')
  const parts = (e: Sr6Entry, tag: string) => e.parts.filter(p => p.tag === tag)

  const priorities: Sr6Data['priorities'] = {}
  for (const e of all('priorities')) {
    const metatypes: Record<string, number> = {}
    for (const p of parts(e, 'metatype')) {
      const id = metatypeIds.get(normName(p.attrs.name ?? ''))
      if (id) metatypes[id] = count(e, p.attrs.points, `adjustment points of ${p.attrs.name}`)
      else warn('data.unresolved', e, `${e.name}’s metatype “${p.attrs.name}” isn’t a metatype in the catalog.`)
    }
    const magic: Sr6PriorityRow['magic'] = {}
    for (const p of parts(e, 'magic')) magic[p.attrs.kind as MagicKind] = count(e, p.attrs.rating, `${p.attrs.kind} rating`)
    priorities[e.attrs.letter as Letter] = { metatypes, magic, page: e.page,
      attributes: count(e, parts(e, 'attributes')[0]?.attrs.points, 'attribute points'),
      skills: count(e, parts(e, 'skills')[0]?.attrs.points, 'skill points'),
      nuyen: count(e, parts(e, 'resources')[0]?.attrs.nuyen, 'nuyen') }
  }

  const metatypes = Object.fromEntries(all('metatypes').map(e => {
    const ranges = Object.fromEntries(RANGE_ATTRS.map(a => {
      const r = parts(e, 'range').find(p => p.attrs.attr === a)
      if (!r) warn('data.bookValue', e, `${e.name} has no range for ${a.toUpperCase()}.`)
      return [a, [count(e, r?.attrs.min, `${a} minimum`), count(e, r?.attrs.max, `${a} maximum`)]]
    })) as Sr6MetatypeView['ranges']
    const traits = parts(e, 'trait').flatMap(p => {
      const id = qualityIds.get(normName(p.text))
      if (!id) warn('data.unresolved', e, `${e.name}’s trait “${p.text}” isn’t a quality in the catalog.`)
      return id ? [id] : []
    })
    return [e.id, { id: e.id, name: e.name, ranges, traits, page: e.page }]
  }))

  const levels = (e: Sr6Entry) => ({ perLevel: e.attrs.perLevel === 'true', maxLevel: count(e, e.attrs.maxLevel, 'highest level', 1) })
  const skills = Object.fromEntries(all('skills').map(e => [e.id, { id: e.id, name: e.name, attr: e.attrs.attr ?? '',
    untrained: e.attrs.untrained === 'true', specs: parts(e, 'spec').map(p => p.text), page: e.page }]))
  const qualities = Object.fromEntries(all('qualities').map(e => [e.id, { id: e.id, name: e.name, positive: e.attrs.kind !== 'negative',
    karma: bookNum(e, e.attrs.karma, 'karma'), ...levels(e), page: e.page }]))
  const powers = Object.fromEntries(all('adeptpowers').map(e => [e.id, { id: e.id, name: e.name, cost: bookNum(e, e.attrs.cost, 'cost'),
    ...levels(e), page: e.page }]))
  const lifemodules = Object.fromEntries(all('lifemodules').map(e => [e.id, {
    id: e.id, name: e.name, stage: e.attrs.stage === 'opening' ? 'opening' as const : 'adult' as const,
    ...(e.attrs.requires ? { requires: e.attrs.requires } : {}),
    grants: Object.fromEntries(GRANTS.filter(g => e.attrs[g] != null).map(g => [g, count(e, e.attrs[g], g)])),
    choices: parts(e, 'choice').map(p => ({ kind: 'mixed' as const, points: count(e, p.attrs.points, 'choice points', 1),
      options: (p.attrs.options ?? '').split(/\s+/).filter(Boolean) })),
    page: e.page }]))

  return { priorities, metatypes, skills, qualities, powers, lifemodules, problems, entry: (kind, id) => c.entries[kind].get(id) }
}
