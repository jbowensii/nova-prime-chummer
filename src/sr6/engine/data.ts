// Typed views over the SR6 catalog for the creation engine: the generic S1 entries (attributes and parts as printed)
// read once into the shapes the providers, budgets and rules use. Names the book prints (a priority row's metatypes, a
// metatype's traits) are resolved to ids here; what can't be resolved or read is a warning in `problems`, never a guess.
import { issueNote } from '../../engine/formula'
import type { Violation } from '../../model/types'
import type { MagicKind, PickKind, Sr6Attr, Letter } from '../model/character'
import type { Sr6Catalog, Sr6Entry, Sr6Kind } from '../model/types'
import type { CreationCatalog } from './creation'
import { gradeKey } from './grades'
import { rated } from './values'
import { resolveEntry } from './load'
import { categoryIndex } from './categories'
import { atLevel, familyOf, levelOf, sameFamily, siblings, type Sr6Family } from './levels'

/** What each magic kind can have (game vocabulary, no numbers). paysPowers: buys its power points (mystic adept). */
export const MAGIC_KINDS: Record<MagicKind, { spells: boolean; powers: boolean; paysPowers: boolean; resonance: boolean }> = {
  full: { spells: true, powers: false, paysPowers: false, resonance: false },
  aspected: { spells: true, powers: false, paysPowers: false, resonance: false },
  'mystic-adept': { spells: true, powers: true, paysPowers: true, resonance: false },
  adept: { spells: false, powers: true, paysPowers: false, resonance: false },
  technomancer: { spells: false, powers: false, paysPowers: false, resonance: true },
  mundane: { spells: false, powers: false, paysPowers: false, resonance: false },
}

/** Who may take a metamagic (its catalog `user`): an adept's only an adept or mystic adept, a magician's only a magician
 *  (full or aspected) or mystic adept; none set: any initiate. */
export const metamagicFits = (kind: MagicKind, user?: string) =>
  user === 'adept' ? MAGIC_KINDS[kind].powers : user === 'magician' ? MAGIC_KINDS[kind].spells : true

/** The most levels a pick taken by level may have (a leveled adept power's maxLevel, a metamagic taken again: its
 *  maxLevel, Infinity when none is printed); null: it is taken once. */
export function pickMaxLevel(data: Pick<Sr6Data, 'powers' | 'metamagics'>, kind: PickKind, id: string): number | null {
  const v = kind === 'adeptpowers' ? data.powers[id] : kind === 'metamagics' ? data.metamagics[id] : undefined
  return v?.perLevel ? v.maxLevel ?? Infinity : null
}

/** Which picks a magic kind can have. */
export function picksFor(kind: MagicKind): Record<PickKind, boolean> {
  const k = MAGIC_KINDS[kind]
  return { spells: k.spells, rituals: k.spells, complexforms: k.resonance, echoes: k.resonance, metamagics: k.spells || k.powers, adeptpowers: k.powers }
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
export interface Sr6MetatypeView {
  id: string; name: string; ranges: Record<RangeAttr, [number, number]>; traits: string[]; page: number
  /** a trait printed with its level (`Hardy 2`: a leveled quality at level 2), by quality id; absent: level 1 */
  traitLevels?: Record<string, number>
  /** a metavariant's adjustment points per metatype priority letter (absent: the priority table's row lists it or not) */
  priority?: Partial<Record<Letter, number>>
}
export interface Sr6SkillView { id: string; name: string; attr: string; untrained: boolean; specs: string[]; page: number }
/** granted: never bought on its own, only granted by another quality's choice of its category (`Returned Soldier power`) */
export interface Sr6QualityChoice { category: string; count: number; max: number | null }
/** parent: the rated or leveled entry a family of levels was expanded from (levels.ts): read by a runner line still
 *  naming it, never offered by a picker */
export interface Sr6QualityView { id: string; name: string; positive: boolean; karma: number | null; karmaMax: number | null; perLevel: boolean; maxLevel: number; page: number
  category?: string; granted?: boolean; choices?: Sr6QualityChoice[]; parent?: true
  /** not one of the six qualities a runner may take at creation (its text says so) */
  uncounted?: boolean }
export interface Sr6PowerView { id: string; name: string; cost: number | null; perLevel: boolean; maxLevel: number; page: number; parent?: true }
/** user: who may take it (absent: any initiate); perLevel: taken again, each time one more initiation's metamagic, up to
 *  maxLevel times (none printed: no limit) */
export interface Sr6MetamagicView { id: string; name: string; user?: 'adept' | 'magician'; perLevel: boolean; maxLevel: number | null; page: number; parent?: true }
export interface Sr6LifeModuleView {
  id: string; name: string; stage: 'opening' | 'adult'; requires?: string; grants: Partial<Record<Grant, number>>
  /** the contact types its contact points buy or raise (absent: any) */
  contactTypes?: string[]
  choices: { kind: 'mixed'; points: number; options: string[] }[]; page: number
}
/** A catalog grade (kind grades) by its key (src/sr6/engine/grades.ts): factors null when the book prints none. */
export interface Sr6GradeView { id: string; key: string; name: string; essence: number | null; cost: number | null; avail: number | null; types?: string[]; page: number
  /** the grade a later book redefines as this one (Body Shop's omega: used): offered instead of it */
  replaces?: string }
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
  // (the hidden parents of the families of levels too, marked: a runner line still naming one reads as before)
  const parentEntries = (k: Sr6Kind) => [...c.levels?.values() ?? []].filter(f => f.kind === k && f.parent).map(f => f.parent!)
  const withParents = (k: Sr6Kind) => [...all(k), ...parentEntries(k)]
  const isParent = (e: Sr6Entry) => (c.entries[e.kind].get(e.id) === e ? {} : { parent: true as const })
  // (a level derived from a rated or leveled parent, levels.ts, warns through its parent, once)
  const derived = (e: Sr6Entry) => !!e.attrs.family && !!c.levels?.get(`${e.kind}/${e.attrs.family}`)?.parent
  const warn = (code: string, e: Sr6Entry, message: string) =>
    { if (!derived(e)) problems.push({ code, severity: 'warning', path: `${e.kind}.${e.id}`, message, source: e.source, page: e.page }) }
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
  // (a family's parent by its printed name too: its lowest level, `Hardy` the trait at level 1, `Hardy 2` the level)
  const parents = (k: Sr6Kind) => [...c.levels?.values() ?? []].filter(f => f.kind === k && f.parent).map(f => ({ name: f.parent!.name, id: f.levels.get(Math.min(...f.levels.keys()))! }))
  const byName = (k: Sr6Kind) => new Map([...parents(k), ...all(k)].map(e => [normName(e.name), e.id]))
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
    const traitLevels: Record<string, number> = {}
    const traits = parts(e, 'trait').flatMap(p => {
      const name = normName(p.text), lv = name.match(/^(.*) (\d+)$/)
      let id = qualityIds.get(name)
      if (!id && lv && (id = qualityIds.get(lv[1]))) traitLevels[id] = Number(lv[2])  // `Hardy 2`: the quality at level 2
      if (!id) warn('data.unresolved', e, `${e.name}’s trait “${p.text}” isn’t a quality in the catalog.`)
      return id ? [id] : []
    })
    const priority = Object.fromEntries(parts(e, 'priority').map(p => [p.attrs.letter, count(e, p.attrs.points, `adjustment points at ${p.attrs.letter}`)]))
    return [e.id, { id: e.id, name: e.name, ranges, traits, page: e.page, ...(Object.keys(traitLevels).length ? { traitLevels } : {}),
      ...(Object.keys(priority).length ? { priority } : {}) }]
  }))

  const levels = (e: Sr6Entry) => ({ perLevel: e.attrs.perLevel === 'true', maxLevel: count(e, e.attrs.maxLevel, 'highest level', 1) })
  const skills = Object.fromEntries(all('skills').map(e => [e.id, { id: e.id, name: e.name, attr: e.attrs.attr ?? '',
    untrained: e.attrs.untrained === 'true', specs: parts(e, 'spec').map(p => p.text), page: e.page }]))
  // (a quality path's bare step shows with its path: `Gestalt: Step 2`)
  const qualities = Object.fromEntries(withParents('qualities').map(e => [e.id, { id: e.id, name: e.attrs.group ? `${e.attrs.group}: ${e.name}` : e.name, positive: e.attrs.kind !== 'negative', ...isParent(e),
    karma: bookNum(e, e.attrs.karma, 'karma'), karmaMax: bookNum(e, e.attrs.karmaMax, 'karma'), ...levels(e), page: e.page,
    ...(e.attrs.category ? { category: e.attrs.category } : {}), ...(e.attrs.granted === 'true' ? { granted: true } : {}),
    ...(e.attrs.uncounted === 'true' ? { uncounted: true } : {}),
    ...(parts(e, 'choice').length ? { choices: parts(e, 'choice').map(p => ({ category: p.attrs.category ?? '',
      count: count(e, p.attrs.count, 'choice count', 1), max: p.attrs.max ? count(e, p.attrs.max, 'choice max', 1) : null })) } : {}) }]))
  const powers = Object.fromEntries(withParents('adeptpowers').map(e => [e.id, { id: e.id, name: e.name, cost: bookNum(e, e.attrs.cost, 'cost'), ...isParent(e),
    ...levels(e), page: e.page }]))
  const metamagics = Object.fromEntries(withParents('metamagics').map(e => [e.id, { id: e.id, name: e.name, perLevel: e.attrs.perLevel === 'true', ...isParent(e),
    maxLevel: e.attrs.maxLevel ? count(e, e.attrs.maxLevel, 'highest level', 1) : null, page: e.page,
    ...(e.attrs.user === 'adept' || e.attrs.user === 'magician' ? { user: e.attrs.user as 'adept' | 'magician' } : {}) }]))
  const lifemodules = Object.fromEntries(all('lifemodules').map(e => [e.id, {
    id: e.id, name: e.name, stage: e.attrs.stage === 'opening' ? 'opening' as const : 'adult' as const,
    ...(e.attrs.requires ? { requires: e.attrs.requires } : {}),
    ...(e.attrs.contactTypes ? { contactTypes: e.attrs.contactTypes.split(' ').filter(Boolean) } : {}),
    grants: Object.fromEntries(GRANTS.filter(g => e.attrs[g] != null).map(g => [g, count(e, e.attrs[g], g)])),
    choices: parts(e, 'choice').map(p => ({ kind: 'mixed' as const, points: count(e, p.attrs.points, 'choice points', 1),
      options: (p.attrs.options ?? '').split(/\s+/).filter(Boolean) })),
    page: e.page }]))

  /** a decimal as grades.xsd allows it (`-1`, `0.8`); else null and a warning */
  const decimal = (e: Sr6Entry, raw: string | undefined, what: string): number | null => {
    if (raw == null) return null
    if (/^\s*-?\d+(\.\d+)?\s*$/.test(raw)) return Number(raw)
    warn('data.bookValue', e, `${e.name}: the ${what} “${raw}” isn’t a number the app can read.`)
    return null
  }
  const grades = Object.fromEntries(all('grades').map(e => {
    const key = gradeKey(e.name)
    return [key, { id: e.id, key, name: e.name, essence: decimal(e, e.attrs.essence, 'Essence factor'), cost: decimal(e, e.attrs.cost, 'cost factor'),
      avail: decimal(e, e.attrs.avail, 'Availability modifier'), page: e.page,
      ...(e.attrs.types ? { types: e.attrs.types.split(/\s+/).filter(Boolean) } : {}), ...(e.attrs.replaces ? { replaces: e.attrs.replaces } : {}) }]
  }))

  // an entry the book leaves a value out of (or the importer couldn't read): Review notes it on the runners that use it
  for (const k of Object.keys(c.entries) as Sr6Kind[]) for (const e of withParents(k)) for (const x of derived(e) ? [] : e.issues ?? [])
    problems.push({ code: 'catalog.issue', severity: 'warning', path: `${e.kind}.${e.id}`, message: issueNote(e.name, x), source: e.source, page: x.page ?? e.page })

  let nameIndex: Map<string, Sr6Entry> | undefined
  const named = (name: string, kind?: Sr6Kind) => {
    if (!nameIndex) {
      nameIndex = new Map()
      for (const [k, map] of Object.entries(c.entries)) for (const e of map.values()) {
        const n = normName(e.name)
        if (!nameIndex.has(`${k}/${n}`)) nameIndex.set(`${k}/${n}`, e)
        if (!nameIndex.has(`/${n}`)) nameIndex.set(`/${n}`, e)
      }
      // (a family's parent name answers its lowest level; a link's `level` picks another: effects.ts linkedEntries)
      for (const k of Object.keys(c.entries) as Sr6Kind[]) for (const p of parents(k)) {
        const n = normName(p.name), e = c.entries[k].get(p.id)
        if (e && !nameIndex.has(`${k}/${n}`)) nameIndex.set(`${k}/${n}`, e)
        if (e && !nameIndex.has(`/${n}`)) nameIndex.set(`/${n}`, e)
      }
    }
    return nameIndex.get(`${kind ?? ''}/${normName(name)}`) ?? (kind ? undefined : nameIndex.get(`/${normName(name)}`))
  }
  return { priorities, metatypes, skills, qualities, powers, metamagics, lifemodules, grades, problems, entry: (kind, id) => resolveEntry(c, kind, id), named,
    categories: categoryIndex(all('categories')),
    family: (kind, id) => familyOf(c, kind, id), atLevel: (kind, id, level) => atLevel(c, kind, id, level), siblings: (kind, id) => siblings(c, kind, id),
    levelOf, sameFamily: (kind, id, target) => sameFamily(c, kind, id, target) }
}
