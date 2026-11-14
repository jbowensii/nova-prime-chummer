// Review rules, shared context: the Ctx a rule checks, the Hit and Rule shapes, citation helpers and the checks several rules share.
import type { FixAt, Severity } from '../../../../core/shared/types'
import { CP_POOLS, MAGIC_KIND_LABELS, SR6_ATTRS, type Sr6Attr, type Sr6Build, type Sr6Character, type Sr6Purchase } from '../../../formats/domain/character'
import { entryOf, fitted, PURCHASE_TAB, skillRank, type Sr6Budgets } from '../creation/budgets'
import { flag, num, str, type CreationRules } from '../../../table-setup/domain/creation'
import { type QualityPath, type Sr6Data } from '../../../catalog/domain/data'
import { normName } from '../../../catalog/domain/names'
import type { Sr6Entry } from '../../../formats/domain/types'
import { deriveSr6 } from '../creation/derive'
import type { Provider } from '../creation/providers'
import { entryLabel } from '../../../catalog/domain/categories'

export interface Ctx {
  data: Sr6Data
  cr: CreationRules
  ch: Sr6Character
  b: Sr6Build
  p: Provider
  budgets: Sr6Budgets
  /** the loaded quality paths ([] until fetched: the path rules wait) */
  paths: QualityPath[]
}
export const fixOf = (h: Hit, r: Rule) => (h.fixAt ? { fixAt: h.fixAt } : r.fixAt ? { fixAt: { tab: r.fixAt } } : {})
/** A broken rule: where (default: the rule's tab), what, and its citation when it isn't the setting's. */
export interface Hit {
  path?: string
  message: string
  source?: string
  page?: number
  /** where it's fixed, when not where it shows */
  fixAt?: FixAt
}
export interface Rule {
  /** hard: no GM approval (owner's decision 19, 2026-10-11: negative Karma or nuyen blocks Finalize) */
  code: string
  severity: Severity
  tab: string
  /** the tab it's fixed on, when not the one it shows on (a hit's own fixAt wins) */
  fixAt?: string
  hard?: true
  /** the settings the rule needs; with one unset it's skipped. The first one's cite goes on the violation. */
  setting?: string[] | ((c: Ctx) => string[])
  check(c: Ctx): Hit | Hit[] | null
}

export const A = (k: Sr6Attr) => k.toUpperCase()
export const lowerFirst = (s: string) => s[0].toLowerCase() + s.slice(1)
export const kindLabel = (b: Sr6Build) => lowerFirst(MAGIC_KIND_LABELS[b.magic])
export const article = (w: string) => (/^[aeiou]/i.test(w) ? 'An' : 'A')
export const usesLetters = (p: Provider) => p.id === 'priority' || p.id === 'sumtoten'
export const fmt = (n: number) => n.toLocaleString('en-US')
export const n0 = (cr: CreationRules, key: string) => num(cr, key) ?? 0
export const over = (budget: { left: number }, what: string, unit = ''): Hit | null =>
  budget.left >= 0 ? null : { message: `${what} overspent by ${fmt(-budget.left)}${unit}.` }
export const entryCite = (e?: { source: string; page: number }) => (e ? { source: e.source, page: e.page } : {})
export const CRB = (page: number) => ({ source: 'CRB', page })
export const CRB_HK = (page: number) => ({ source: 'CRB-HK', page })
export const SWC = (page: number) => ({ source: 'SWC', page })
export const metaName = (c: Ctx) => c.data.metatypes[c.b.metatype]?.name ?? c.b.metatype
/** every purchase and accessory, with the path of the line it sits on */
export function* lines(b: Sr6Build): Generator<{ x: Sr6Purchase; path: string; host?: Sr6Purchase; own?: Sr6Purchase }> {
  for (const x of b.purchases) {
    const path = `${PURCHASE_TAB[x.kind]}.${x.uid}`
    yield { x, path }
    // (an implant's add-on has its grade, CRB p. 282; own: the accessory as the file has it)
    for (const a of x.accessories) yield { x: fitted(x, a), path, host: x, own: a }
  }
}
/** 1 when the runner has the quality a setting names (Many Talents, Many Skills: Sixth World Companion p. 134), else 0. */
export const has = (c: Ctx, key: string) => {
  const id = str(c.cr, key)
  return id && c.b.qualities.some(q => c.data.sameFamily('qualities', q.id, id)) ? 1 : 0
}
export const pickName = (c: Ctx, x: Sr6Build['picks'][number]) => {
  const e = c.data.entry(x.kind, x.id)
  return e ? entryLabel(e) : (x.name ?? x.id)
}

/** The Review code of a designed vehicle's or drone's GM approval: a warning a GM may approve (Review.tsx). */
export const DESIGN_APPROVAL = 'vehicle.design'
/** The Review code of a vehicle or drone bought at a GM-adjusted price: a warning a GM approves (Review.tsx). */
export const PRICE_APPROVAL = 'vehicle.price'
/** The Review code of a player's own add-on (the item builders, owner ruling 6): a warning a GM approves. */
export const CUSTOM_APPROVAL = 'gear.custom'
/** The Review codes a GM approves in career too (Review.tsx). */
export const GM_APPROVALS = new Set([DESIGN_APPROVAL, PRICE_APPROVAL, CUSTOM_APPROVAL])

/** "Initiative: the book prints 9(11) + 3D6; the rules give 9(12) + 3D6.": a book sample's printed attributes (natural
 *  and augmented), Essence, initiative, condition monitors and Defense Rating where the rules give others, cited to its page. */
export function printedHits(c: Ctx): Hit[] {
  const pr = c.ch.printed
  if (!pr) return []
  // (the book prints the always-on values first and the switchable ones on in brackets: the bracketed total's, derive.ts on)
  const d = deriveSr6(c.data, c.cr, c.ch).on,
    hits: Hit[] = []
  // spaces aside, and `6(6)` (augmented as natural) read as `6`
  const same = (book: string, rules: string) => book.replace(/\s/g, '').replace(/^(\d+)\(\1\)/, '$1') === rules.replace(/\s/g, '')
  const say = (path: string, what: string, book: string | undefined, rules: string) => {
    if (book && !same(book, rules)) hits.push({ path, message: `${what}: the book prints ${book}; the rules give ${rules}.`, source: pr.source, page: pr.page })
  }
  const pair = (natural: number, augmented: number) => (augmented === natural ? `${natural}` : `${natural}(${augmented})`)
  // the number a book prints: the natural value with its always-on bonuses folded in (`natural:<attr>` below, owner
  // 2026-10-10), the brackets the value with the switchable ones on
  const folded = (k: Sr6Attr) => (pr.values[`natural:${k}`]?.split('|')[1] ?? '').split(' + ').reduce((t, x) => t + (Number(x.match(/(-?\d+)$/)?.[1]) || 0), 0)
  const shown = (k: Sr6Attr) => d.attrs[k].natural + folded(k)
  for (const k of SR6_ATTRS) say(`attributes.${k}`, A(k), pr.values[k], pair(shown(k), d.attrs[k].augmented))
  if (Number(pr.values.ess) !== d.essence) say('augmentations', 'Essence', pr.values.ess, String(d.essence))
  // (a book printing one initiative number, `11 + 1D6`, prints the augmented one)
  const init = pr.values.init?.includes('(') ? pair(shown('rea') + shown('int'), d.initiative.base) : `${d.initiative.base}`
  if (d.initiative.dice !== null) say('review', 'Initiative', pr.values.init, `${init} + ${d.initiative.dice}D6`)
  if (d.monitors.physical !== null && d.monitors.stun !== null) say('review', 'Condition monitors', pr.values.cm, `${d.monitors.physical}/${d.monitors.stun}`)
  say('gear', 'Defense Rating', pr.values.dr, String(d.defenseRating))
  // an always-on bonus folded into the printed number (owner, 2026-10-10: a switchable one is printed in brackets), value
  // `<printed>|<what adds, as printed>`: the natural value is the printed less it, noted here
  for (const [k, v] of Object.entries(pr.values))
    if (k.startsWith('natural:')) {
      const key = k.slice(8),
        [printedAs, plus] = v.split('|')
      if (key.startsWith('skill:')) {
        const id = key.slice(6),
          s = c.b.skills.find(x => x.id === id),
          name = c.data.skills[id]?.name ?? id
        if (s)
          hits.push({
            path: `skills.${id}`,
            source: pr.source,
            page: pr.page,
            message: `The book prints ${name} ${printedAs}, an always-on bonus included: ${name} ${skillRank(s)} + ${plus}.`,
          })
      } else if ((SR6_ATTRS as string[]).includes(key)) {
        const a = key as Sr6Attr
        hits.push({
          path: `attributes.${a}`,
          source: pr.source,
          page: pr.page,
          message: `The book prints ${a.toUpperCase()} ${printedAs}, an always-on bonus included: ${a.toUpperCase()} ${d.attrs[a].natural} + ${plus}.`,
        })
      }
    }
  // a level printed on a quality that has none (`Magic Resistance 2`): taken without it (owner, 2026-10-09), noted here
  for (const [k, v] of Object.entries(pr.values))
    if (k.startsWith('level:')) {
      const id = k.slice(6),
        e = c.data.entry('qualities', id),
        q = c.b.qualities.find(x => x.id === id)
      if (e)
        hits.push({
          path: q ? `qualities.${q.uid}` : 'qualities',
          source: e.source,
          page: e.page,
          message: `The book prints ${v}; ${entryLabel(e)} has no levels (${e.source} p.${e.page}), so it’s taken once.`,
        })
    }
  return hits
}

/** The runner's augmentations, adept powers and qualities that can't be combined (an entry's <incompatible> parts,
 *  importer/sr6/effects.py incompatibilities): one that raises an attribute or initiative the other names
 *  (`incompatible with augmentations that affect Reaction or Initiative`), one the other names (`including wired
 *  reflexes`), two of a family only one of which may be installed (`Bone Lacing`). wireless: an exception the book
 *  makes while wireless (<compatible switch="wireless">). The Sixth World Companion's Suprathyroid Bonuses Stack (p. 149,
 *  suprathyroidStacks) exempts the suprathyroid gland from the attribute and initiative ones. */
export function incompatible(c: Ctx): (Hit & { wireless: boolean })[] {
  type Line = { path: string; e: Sr6Entry; raises: Set<string> }
  const lines: Line[] = []
  const raises = (e: Sr6Entry) =>
    new Set(
      e.parts
        .filter(p => p.tag === 'effect' && p.attrs.op === 'add' && !/^-/.test(p.attrs.value ?? ''))
        .map(p => (p.attrs.target === 'derived:initiative' ? 'derived:initiative-dice' : (p.attrs.target ?? ''))),
    )
  const add = (path: string, e: Sr6Entry | undefined) => {
    if (e) lines.push({ path, e, raises: raises(e) })
  }
  for (const x of c.b.purchases) if (x.kind === 'augmentations') add(`augmentations.${x.uid}`, entryOf(x, c.data))
  for (const x of c.b.picks) if (x.kind === 'adeptpowers') add(`magic.${x.uid}`, c.data.entry(x.kind, x.id))
  for (const q of c.b.qualities) add(`qualities.${q.uid}`, c.data.entry('qualities', q.id))
  const words = (s: string) =>
    normName(s)
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .map(w => w.replace(/(?<=[a-z]{3})s$/, ''))
  const names = (n: string, e: Sr6Entry) => {
    const a = words(n),
      b = words(e.name)
    return a.length > 0 && a.every((w, i) => b[i] === w)
  }
  const gland = (e: Sr6Entry) => !!flag(c.cr, 'suprathyroidStacks') && normName(e.name) === 'suprathyroid gland'
  /** why a can't go with b: a named it, its family, or b raises what a names */
  const why = (a: Line, b: Line) => {
    for (const p of a.e.parts) {
      if (p.tag !== 'incompatible') continue
      if (p.attrs.family && names(p.attrs.family, b.e)) return 'named'
      if ((p.attrs.names ?? '').split(/;\s*/).some(n => n && names(n, b.e))) return 'named'
      if (!gland(a.e) && !gland(b.e) && (p.attrs.targets ?? '').split(/\s+/).some(t => t && b.raises.has(t))) return 'raises'
    }
    return null
  }
  const wireless = (a: Line, b: Line) =>
    [a, b].some((x, i) => x.e.parts.some(p => p.tag === 'compatible' && p.attrs.switch === 'wireless' && names(p.attrs.name ?? '', (i ? a : b).e)))
  const hits: (Hit & { wireless: boolean })[] = []
  for (let i = 0; i < lines.length; i++)
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i],
        b = lines[j],
        one = why(a, b) ? a : why(b, a) ? b : null
      if (!one) continue
      const w = wireless(a, b)
      hits.push({
        path: b.path,
        wireless: w,
        ...entryCite(one.e),
        message: w
          ? `${entryLabel(a.e)} and ${entryLabel(b.e)}: compatible only while wireless (the wireless bonus).`
          : `${entryLabel(a.e)} and ${entryLabel(b.e)} can’t be combined.`,
      })
    }
  return hits
}

/** quality.granted's hits: a granted-only quality with no quality offering its list (none), or more of a list than its
 *  offers allow. */
export function granted(c: Ctx): (Hit & { none: boolean })[] {
  const offers = c.b.qualities.flatMap(q => c.data.qualities[q.id]?.choices ?? [])
  const hits: (Hit & { none: boolean })[] = [],
    taken: Record<string, number> = {}
  for (const q of c.b.qualities) {
    const v = c.data.qualities[q.id]
    if (!v?.granted || !v.category) continue
    taken[v.category] = (taken[v.category] ?? 0) + 1
    const room = offers.filter(o => o.category === v.category).reduce((t, o) => t + (o.max ?? o.count), 0)
    if (!room)
      hits.push({
        none: true,
        path: `qualities.${q.uid}`,
        message: `${v.name} is granted only, by a quality offering a ${v.category}; the runner has none.`,
        ...entryCite(c.data.entry('qualities', q.id)),
      })
    else if (taken[v.category] > room)
      hits.push({
        none: false,
        path: `qualities.${q.uid}`,
        message: `More than ${room} ${v.category} qualities taken.`,
        ...entryCite(c.data.entry('qualities', q.id)),
      })
  }
  return hits
}

/** Each number on the build below 0 where none can be (a bonus's value can: it isn't checked). */
export function negatives(b: Sr6Build): Hit[] {
  const hits: Hit[] = []
  const at = (path: string, o: object, keys: string[]) => {
    for (const k of keys) {
      const v = (o as Record<string, unknown>)[k]
      if (typeof v === 'number' && v < 0) hits.push({ path, message: `${k} is ${v}; it can’t be below 0.` })
    }
  }
  at('method', b, ['powerPointsBought', 'initiation', 'submersion', 'karmaToNuyen', 'karmaToDeck'])
  at('method', b.cp, CP_POOLS)
  for (const k of SR6_ATTRS) at(`attributes.${k}`, b.attributes[k], ['points', 'adjust', 'karma'])
  for (const s of b.skills) at(`skills.${s.id}`, s, ['points', 'karma'])
  for (const k of b.knowledge) at(`skills.${k.uid}`, k, ['points', 'karma'])
  for (const q of b.qualities) at(`qualities.${q.uid}`, q, ['level', 'karma'])
  for (const x of b.picks) at(`magic.${x.uid}`, x, ['level'])
  for (const { x, own, path } of lines(b)) at(path, own ?? x, ['cost', 'avail', 'essence', 'rating', 'qty', 'seatsRemoved'])
  for (const x of b.contacts) at(`contacts.${x.uid}`, x, ['connection', 'loyalty'])
  for (const s of b.sins) {
    at(`contacts.sin.${s.uid}`, s, ['rating'])
    for (const l of s.licences) at(`contacts.sin.${s.uid}`, l, ['rating'])
    for (const l of s.lifestyles ?? []) at(`contacts.sin.${s.uid}`, l, ['months'])
  }
  return hits
}

export const nameOf = (c: Ctx, x: Sr6Purchase) => {
  const e = entryOf(x, c.data)
  return e ? entryLabel(e) : (x.name ?? x.id ?? 'Custom item')
}

/** The kinds of weapon an ammunition line is for, from its name (`Heavy Pistol/SMG`: heavy pistol and submachine gun), or a
 *  weapon category's own (`Submachine gun`): singular, hold-outs and SMGs spelled one way. */
export function ammoKinds(name: string): string[] {
  return name
    .split('/')
    .map(p =>
      normName(p)
        .replace(/^hold ?out$/, 'holdout')
        .replace(/^smgs?$/, 'submachine gun')
        .replace(/s$/, ''),
    )
    .filter(Boolean)
}

/** The kinds of weapon the core rulebook's ammunition table names (CRB Hong Kong p. 262). ponytail: a fixed list; read
 *  it from the catalog's ammunition lines if a book adds a kind. */
export const AMMO_KINDS = new Set([
  'holdout',
  'light pistol',
  'machine pistol',
  'heavy pistol',
  'submachine gun',
  'rifle',
  'machine gun',
  'assault cannon',
  'taser',
])
