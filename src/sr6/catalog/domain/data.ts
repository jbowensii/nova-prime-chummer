// Typed views over the SR6 catalog for the creation engine: the generic S1 entries (attributes and parts as printed)
// read once into the shapes the providers, budgets and rules use. Names the book prints (a priority row's metatypes, a
// metatype's traits) are resolved to ids here; what can't be resolved or read is a warning in `problems`, never a guess.
import { issueNote } from '../../../core/shared/formula'
import type { Violation } from '../../../core/shared/types'
import type { MagicKind, PickKind, Letter } from '../../formats/domain/character'
import type { Sr6Catalog, Sr6Entry, Sr6Kind } from '../../formats/domain/types'
import { MAX_RATING, rated } from './values'
import { resolveEntry } from './load'
import { categoryIndex, isMaterial } from './categories'
import { gradeKey, normName } from './names'
import { atLevel, familyOf, levelOf, sameFamily, siblings } from './levels'
import type { RangeAttr, Grant, Sr6PriorityRow, Sr6MetatypeView, Sr6Data } from './types'

export type {
  RangeAttr,
  Grant,
  Sr6PriorityRow,
  Sr6MetatypeView,
  Sr6SkillView,
  Sr6QualityChoice,
  Sr6QualityView,
  Sr6PowerView,
  Sr6MetamagicView,
  Sr6LifeModuleView,
  Sr6GradeView,
  Sr6Data,
} from './types'

/** What each magic kind can have (game vocabulary, no numbers). paysPowers: buys its power points (mystic adept). */
export const MAGIC_KINDS: Record<MagicKind, { spells: boolean; powers: boolean; paysPowers: boolean; resonance: boolean }> = {
  full: { spells: true, powers: false, paysPowers: false, resonance: false },
  aspected: { spells: true, powers: false, paysPowers: false, resonance: false },
  'mystic-adept': { spells: true, powers: true, paysPowers: true, resonance: false },
  adept: { spells: false, powers: true, paysPowers: false, resonance: false },
  technomancer: { spells: false, powers: false, paysPowers: false, resonance: true },
  mundane: { spells: false, powers: false, paysPowers: false, resonance: false },
}

/** Awakened (CRB pp. 127–128): a magician, aspected magician, mystic adept or adept; a technomancer is Emerged, not
 *  Awakened. (Awakened or emerged, any kind but mundane, is the providers' own test.) */
export const awakenedKind = (kind: MagicKind) => MAGIC_KINDS[kind].spells || MAGIC_KINDS[kind].powers

/** A quality's <karmaif flag="awakened" value note> (its price while the runner is Awakened), as the view's karmaIf. */
const karmaIf = (e: Sr6Entry) => {
  const k = e.parts.find(p => p.tag === 'karmaif' && p.attrs.flag === 'awakened')
  return k && /^-?\d+$/.test(k.attrs.value ?? '') ? { karmaIf: { value: Number(k.attrs.value), ...(k.attrs.note ? { note: k.attrs.note } : {}) } } : {}
}

/** Who may take a metamagic (its catalog `user`): an adept's only an adept or mystic adept, a magician's only a magician
 *  (full or aspected) or mystic adept; none set: any initiate. */
export const metamagicFits = (kind: MagicKind, user?: string) =>
  user === 'adept' ? MAGIC_KINDS[kind].powers : user === 'magician' ? MAGIC_KINDS[kind].spells : true

/** The most levels a pick taken by level may have (a leveled adept power's maxLevel, a metamagic taken again: its
 *  maxLevel, Infinity when none is printed); null: it is taken once. */
export function pickMaxLevel(data: Pick<Sr6Data, 'powers' | 'metamagics'>, kind: PickKind, id: string): number | null {
  // (a data structure comes in levels, none printed as its highest: Hack & Slash p. 70)
  if (kind === 'datastructures') return Infinity
  const v = kind === 'adeptpowers' ? data.powers[id] : kind === 'metamagics' ? data.metamagics[id] : undefined
  return v?.perLevel ? (v.maxLevel ?? Infinity) : null
}

/** Which picks a magic kind can have. */
export function picksFor(kind: MagicKind): Record<PickKind, boolean> {
  const k = MAGIC_KINDS[kind]
  return {
    spells: k.spells,
    rituals: k.spells,
    complexforms: k.resonance,
    echoes: k.resonance,
    metamagics: k.spells || k.powers,
    adeptpowers: k.powers,
    datastructures: k.resonance,
  }
}

const RANGE_ATTRS: RangeAttr[] = ['bod', 'agi', 'rea', 'str', 'wil', 'log', 'int', 'cha', 'edg']
const GRANTS: Grant[] = ['attributePoints', 'skillPoints', 'adjustmentPoints', 'nuyen', 'contactPoints', 'knowledgeSkills']

const METATYPE_WORDS: Record<string, string> = {
  human: 'human',
  humans: 'human',
  elf: 'elf',
  elves: 'elf',
  elven: 'elf',
  dwarf: 'dwarf',
  dwarfs: 'dwarf',
  dwarves: 'dwarf',
  ork: 'ork',
  orks: 'ork',
  troll: 'troll',
  trolls: 'troll',
}
/** The metatypes a poser or human-looking quality is for, read from its description (owner's decision 4, 2026-10-11):
 *  its first sentence names them (`Your blood may be human or ork`, `Small orks, tall dwarfs, and ugly elves`), less the
 *  one it imitates (Elf Poser: elf; Human-Looking: human). Any other quality, or one without its text: undefined (every
 *  metatype). ponytail: the core five by name; a metavariant isn't offered one (add a base metatype to the catalog's
 *  metavariants if a table wants it). */
export function qualityMetatypes(name: string, text: string): string[] | undefined {
  const n = normName(name),
    like = /^(\w+) poser$/.exec(n)?.[1] ?? (n === 'human looking' ? 'human' : undefined)
  if (!like || !text) return undefined
  const words = normName(text.split(/(?<=[.!?])\s/)[0])
    .split(' ')
    .map(w => METATYPE_WORDS[w])
    .filter((w): w is string => !!w && w !== like)
  return words.length ? [...new Set(words)] : undefined
}
/** Whether the runner's metatype may take quality `id` (qualityMetatypes; none picked: no metatype-bound quality). */
export const qualityFitsMetatype = (data: Pick<Sr6Data, 'qualities' | 'metatypes'>, metatype: string, id: string) => {
  const m = data.qualities[id]?.metatypes
  return !m || m.includes(normName(data.metatypes[metatype]?.name ?? ''))
}

/** An Infected type's gained power or weakness (<power>, <weakness>: docs/sr6-data-format/kinds.md, Infected rules as data). */
export interface Gained {
  tag: 'power' | 'weakness'
  name: string
  ref?: string
  rating?: number
}
/** An entry's gained powers and weaknesses, in the book's order. */
export const gainsOf = (e: Sr6Entry | undefined): Gained[] =>
  (e?.parts ?? [])
    .filter(p => (p.tag === 'power' || p.tag === 'weakness') && p.attrs.name)
    .map(p => ({
      tag: p.tag as Gained['tag'],
      name: p.attrs.name,
      ...(p.attrs.ref ? { ref: p.attrs.ref } : {}),
      ...(Number(p.attrs.rating) > 0 ? { rating: Number(p.attrs.rating) } : {}),
    }))
/** A gained power's or weakness's catalog entry: its ref, else its name less its parenthesis (`Natural Weapon (Claws,
 *  Bite)`: Natural Weapon) across the catalog, a power among the critter powers, then the qualities (`Built Tough 2`), a
 *  weakness among the critter weaknesses (the core rulebook prints them as rules, p. 228), then the critter powers.
 *  undefined: not in the catalog (sr6Data warns). Owner: critter powers cost nothing. */
export function gainedEntry(data: Pick<Sr6Data, 'entry' | 'named'>, g: Gained): Sr6Entry | undefined {
  const kinds: Sr6Kind[] = g.tag === 'power' ? ['critterpowers', 'qualities'] : ['rules', 'critterpowers']
  const head = g.name.split('(')[0].trim()
  for (const k of kinds) {
    const e = (g.ref ? data.entry(k, g.ref) : undefined) ?? data.named?.(head, k)
    if (e) return e
  }
  return undefined
}

export function sr6Data(c: Sr6Catalog): Sr6Data {
  const problems: Violation[] = []
  const all = (k: Sr6Kind) => [...c.entries[k].values()]
  // (the hidden parents of the families of levels too, marked: a runner line still naming one reads as before)
  const parentEntries = (k: Sr6Kind) => [...(c.levels?.values() ?? [])].filter(f => f.kind === k && f.parent).map(f => f.parent!)
  const withParents = (k: Sr6Kind) => [...all(k), ...parentEntries(k)]
  const isParent = (e: Sr6Entry) => (c.entries[e.kind].get(e.id) === e ? {} : { parent: true as const })
  // (a level derived from a rated or leveled parent, levels.ts, warns through its parent, once)
  const derived = (e: Sr6Entry) => !!e.attrs.family && !!c.levels?.get(`${e.kind}/${e.attrs.family}`)?.parent
  const warn = (code: string, e: Sr6Entry, message: string) => {
    if (!derived(e)) problems.push({ code, severity: 'warning', path: `${e.kind}.${e.id}`, message, source: e.source, page: e.page })
  }
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
  const parents = (k: Sr6Kind) =>
    [...(c.levels?.values() ?? [])].filter(f => f.kind === k && f.parent).map(f => ({ name: f.parent!.name, id: f.levels.get(Math.min(...f.levels.keys()))! }))
  const byName = (k: Sr6Kind) => new Map([...parents(k), ...all(k)].map(e => [normName(e.name), e.id]))
  const metatypeIds = byName('metatypes'),
    qualityIds = byName('qualities')
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
    priorities[e.attrs.letter as Letter] = {
      metatypes,
      magic,
      page: e.page,
      attributes: count(e, parts(e, 'attributes')[0]?.attrs.points, 'attribute points'),
      skills: count(e, parts(e, 'skills')[0]?.attrs.points, 'skill points'),
      nuyen: count(e, parts(e, 'resources')[0]?.attrs.nuyen, 'nuyen'),
    }
  }

  const metatypes = Object.fromEntries(
    all('metatypes').map(e => {
      const ranges = Object.fromEntries(
        RANGE_ATTRS.map(a => {
          const r = parts(e, 'range').find(p => p.attrs.attr === a)
          if (!r) warn('data.bookValue', e, `${e.name} has no range for ${a.toUpperCase()}.`)
          return [a, [count(e, r?.attrs.min, `${a} minimum`), count(e, r?.attrs.max, `${a} maximum`)]]
        }),
      ) as Sr6MetatypeView['ranges']
      const traitLevels: Record<string, number> = {}
      const traits = parts(e, 'trait').flatMap(p => {
        const name = normName(p.text),
          lv = name.match(/^(.*) (\d+)$/)
        let id = qualityIds.get(name)
        if (!id && lv && (id = qualityIds.get(lv[1]))) traitLevels[id] = Number(lv[2]) // `Hardy 2`: the quality at level 2
        if (!id) warn('data.unresolved', e, `${e.name}’s trait “${p.text}” isn’t a quality in the catalog.`)
        return id ? [id] : []
      })
      const priority = Object.fromEntries(parts(e, 'priority').map(p => [p.attrs.letter, count(e, p.attrs.points, `adjustment points at ${p.attrs.letter}`)]))
      return [
        e.id,
        {
          id: e.id,
          name: e.name,
          ranges,
          traits,
          page: e.page,
          ...(Object.keys(traitLevels).length ? { traitLevels } : {}),
          ...(Object.keys(priority).length ? { priority } : {}),
        },
      ]
    }),
  )

  // (none printed: no limit — null, like metamagics; a perLevel pick with null maxLevel is unlimited, PP/karma the only cap)
  const levels = (e: Sr6Entry) => ({
    perLevel: e.attrs.perLevel === 'true',
    maxLevel: e.attrs.maxLevel ? count(e, e.attrs.maxLevel, 'highest level', 1) : null,
  })
  // (Knowledge and Language are free-text entry points, a skill carrying a `knowledgeskill` choice: the creator types the
  // name on the Skills tab's Knowledge and languages line, so they are not skills to spend skill points on)
  const skills = Object.fromEntries(
    all('skills')
      .filter(e => !parts(e, 'choice').some(p => p.attrs.kind === 'knowledgeskill'))
      .map(e => [
        e.id,
        { id: e.id, name: e.name, attr: e.attrs.attr ?? '', untrained: e.attrs.untrained === 'true', specs: parts(e, 'spec').map(p => p.text), page: e.page },
      ]),
  )
  // (a quality path's bare step shows with its path: `Gestalt: Step 2`)
  const qualities = Object.fromEntries(
    withParents('qualities').map(e => [
      e.id,
      {
        id: e.id,
        name: e.attrs.group ? `${e.attrs.group}: ${e.name}` : e.name,
        positive: e.attrs.kind !== 'negative',
        ...isParent(e),
        karma: bookNum(e, e.attrs.karma, 'karma'),
        karmaMax: bookNum(e, e.attrs.karmaMax, 'karma'),
        ...levels(e),
        page: e.page,
        ...(e.attrs.karmaSteps ? { karmaSteps: e.attrs.karmaSteps.split(/\s+/).map(Number).filter(Number.isFinite) } : {}),
        ...(e.attrs.category ? { category: e.attrs.category } : {}),
        ...(e.attrs.granted === 'true' ? { granted: true } : {}),
        ...(e.attrs.uncounted === 'true' ? { uncounted: true } : {}),
        ...(qualityMetatypes(e.name, e.text) ? { metatypes: qualityMetatypes(e.name, e.text) } : {}),
        ...karmaIf(e),
        ...(parts(e, 'choice').length
          ? {
              choices: parts(e, 'choice').map(p => ({
                category: p.attrs.category ?? '',
                count: count(e, p.attrs.count, 'choice count', 1),
                max: p.attrs.max ? count(e, p.attrs.max, 'choice max', 1) : null,
              })),
            }
          : {}),
      },
    ]),
  )
  const powers = Object.fromEntries(
    withParents('adeptpowers').map(e => [
      e.id,
      {
        id: e.id,
        name: e.name,
        cost: bookNum(e, e.attrs.cost, 'cost'),
        ...isParent(e),
        ...(e.attrs.costCombat ? { costCombat: bookNum(e, e.attrs.costCombat, 'costCombat') } : {}),
        ...levels(e),
        page: e.page,
      },
    ]),
  )
  const metamagics = Object.fromEntries(
    withParents('metamagics').map(e => [
      e.id,
      {
        id: e.id,
        name: e.name,
        perLevel: e.attrs.perLevel === 'true',
        ...isParent(e),
        maxLevel: e.attrs.maxLevel ? count(e, e.attrs.maxLevel, 'highest level', 1) : null,
        page: e.page,
        ...(e.attrs.user === 'adept' || e.attrs.user === 'magician' ? { user: e.attrs.user as 'adept' | 'magician' } : {}),
      },
    ]),
  )
  const lifemodules = Object.fromEntries(
    all('lifemodules').map(e => [
      e.id,
      {
        id: e.id,
        name: e.name,
        stage: e.attrs.stage === 'opening' ? ('opening' as const) : ('adult' as const),
        ...(e.attrs.requires ? { requires: e.attrs.requires } : {}),
        ...(e.attrs.contactTypes ? { contactTypes: e.attrs.contactTypes.split(' ').filter(Boolean) } : {}),
        grants: Object.fromEntries(GRANTS.filter(g => e.attrs[g] != null).map(g => [g, count(e, e.attrs[g], g)])),
        choices: parts(e, 'choice').map(p => ({
          kind: 'mixed' as const,
          points: count(e, p.attrs.points, 'choice points', 1),
          options: (p.attrs.options ?? '').split(/\s+/).filter(Boolean),
        })),
        page: e.page,
      },
    ]),
  )

  /** a decimal as grades.xsd allows it (`-1`, `0.8`); else null and a warning */
  const decimal = (e: Sr6Entry, raw: string | undefined, what: string): number | null => {
    if (raw == null) return null
    if (/^\s*-?\d+(\.\d+)?\s*$/.test(raw)) return Number(raw)
    warn('data.bookValue', e, `${e.name}: the ${what} “${raw}” isn’t a number the app can read.`)
    return null
  }
  const grades = Object.fromEntries(
    all('grades').map(e => {
      const key = gradeKey(e.name)
      return [
        key,
        {
          id: e.id,
          key,
          name: e.name,
          essence: decimal(e, e.attrs.essence, 'Essence factor'),
          cost: decimal(e, e.attrs.cost, 'cost factor'),
          avail: decimal(e, e.attrs.avail, 'Availability modifier'),
          page: e.page,
          ...(e.attrs.types ? { types: e.attrs.types.split(/\s+/).filter(Boolean) } : {}),
          ...(e.attrs.replaces ? { replaces: e.attrs.replaces } : {}),
        },
      ]
    }),
  )

  // an entry the book leaves a value out of (or the importer couldn't read): Review notes it on the runners that use it
  for (const k of Object.keys(c.entries) as Sr6Kind[])
    for (const e of withParents(k))
      for (const x of derived(e) ? [] : (e.issues ?? []))
        problems.push({
          code: 'catalog.issue',
          severity: 'warning',
          path: `${e.kind}.${e.id}`,
          message: issueNote(e.name, x),
          source: e.source,
          page: x.page ?? e.page,
        })

  // a rating range or highest level past what the app reads (values.ts MAX_RATING): read as unrated, or not expanded
  for (const k of Object.keys(c.entries) as Sr6Kind[])
    for (const e of withParents(k))
      for (const [a, what] of [
        ['rating', 'rating'],
        ['maxLevel', 'highest level'],
      ] as const)
        if ((e.attrs[a]?.match(/\d+/g) ?? []).some(n => Number(n) > MAX_RATING))
          warn('data.bookValue', e, `${e.name}: the ${what} “${e.attrs[a]}” goes past ${MAX_RATING}, the most the app reads.`)

  let nameIndex: Map<string, Sr6Entry> | undefined
  const named = (name: string, kind?: Sr6Kind) => {
    if (!nameIndex) {
      nameIndex = new Map()
      for (const [k, map] of Object.entries(c.entries))
        for (const e of map.values()) {
          const n = normName(e.name)
          if (!nameIndex.has(`${k}/${n}`)) nameIndex.set(`${k}/${n}`, e)
          if (!nameIndex.has(`/${n}`)) nameIndex.set(`/${n}`, e)
        }
      // (a family's parent name answers its lowest level; a link's `level` picks another: effects.ts linkedEntries)
      for (const k of Object.keys(c.entries) as Sr6Kind[])
        for (const p of parents(k)) {
          const n = normName(p.name),
            e = c.entries[k].get(p.id)
          if (e && !nameIndex.has(`${k}/${n}`)) nameIndex.set(`${k}/${n}`, e)
          if (e && !nameIndex.has(`/${n}`)) nameIndex.set(`/${n}`, e)
        }
    }
    return nameIndex.get(`${kind ?? ''}/${normName(name)}`) ?? (kind ? undefined : nameIndex.get(`/${normName(name)}`))
  }
  // an Infected type's gained power or weakness its catalog lacks (gainedEntry): reported, never guessed
  const view = { entry: (kind: Sr6Kind, id: string) => resolveEntry(c, kind, id), named }
  for (const e of all('qualities'))
    if (e.parts.some(p => p.tag === 'infected'))
      for (const g of gainsOf(e))
        if (!gainedEntry(view, g))
          warn(
            'data.unresolved',
            e,
            `${e.name}’s gained ${g.tag} “${g.name}” isn’t a ${g.tag === 'power' ? 'critter power or quality' : 'critter weakness'} in the catalog.`,
          )

  return {
    priorities,
    metatypes,
    skills,
    qualities,
    powers,
    metamagics,
    lifemodules,
    grades,
    problems,
    entry: (kind, id) => resolveEntry(c, kind, id),
    hasSource: id => (s => !!s && s.origin !== 'shipped')(c.sources.get(id)),
    named,
    categories: categoryIndex(all('categories')),
    materials: all('ammotypes').filter(isMaterial),
    family: (kind, id) => familyOf(c, kind, id),
    atLevel: (kind, id, level) => atLevel(c, kind, id, level),
    siblings: (kind, id) => siblings(c, kind, id),
    levelOf,
    sameFamily: (kind, id, target) => sameFamily(c, kind, id, target),
  }
}
