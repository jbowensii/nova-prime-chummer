// The Sixth World Companion's playable Infected (pp. 104–114) and the Awakened flag. An Infected type is a quality whose
// catalog entry carries <infected> (docs/sr6-data-format.md "Infected rules as data"); the runner is Infected while it has
// one (actions.ts infect takes, swaps and removes it). From the type: its attribute maxima (its `when="<base>"` attr-max
// effects, attributes.ts; the non-human vampire's <infectedalt> added to the runner's own), the free physical and mental
// points (budgets.ts), Essence (essence.ts), Magic and its highest (providers.ts, magic.ts), and which optional powers may
// be bought (<optionalpower>, one free pick). Awakened: a magician, adept, mystic adept or aspected magician, or Infected;
// a technomancer is Emerged, not Awakened (owner, 2026-10-16); the player may override it (a Review warning).
import { MAGIC_KIND_LABELS, type MagicKind, type Sr6Attr, type Sr6Build, type Sr6Quality } from '../model/character'
import type { Sr6Entry } from '../model/types'
import { flag, num, type CreationRules } from './creation'
import { awakenedKind, type Sr6Data } from './data'
import { normName } from './names'

export interface InfectedType {
  id: string
  name: string
  strain: string
  /** as the book prints it when the strain is read as another (Ia: I) */
  printed?: string
  base: string
  awakens?: 'adept' | 'magician'
  freePhysical: number
  freeMental: number
  essence?: number
  magic?: number
  magicLoss?: number
  magicMax?: string
  /** <infectedalt base="other">: its Karma and the maxima it adds to the runner's own metatype's (the non-human vampire) */
  alt?: { karma: number; adds: Partial<Record<Sr6Attr, number>>; note?: string; page?: number }
  /** <optionalpower>: the optional powers (quality ids) it may buy; free: one its free pick may take */
  powers: { ref: string; free: boolean }[]
}

const int = (s: string | undefined) => (s == null || s === '' || !Number.isFinite(Number(s)) ? undefined : Number(s))
const CORE: Sr6Attr[] = ['bod', 'agi', 'rea', 'str', 'wil', 'log', 'int', 'cha']

/** An entry's Infected type (its <infected>), or undefined for any other entry. */
export function infectedOf(e: Sr6Entry | undefined): InfectedType | undefined {
  const i = e?.parts.find(p => p.tag === 'infected')
  if (!e || !i) return undefined
  const a = i.attrs,
    alt = e.parts.find(p => p.tag === 'infectedalt' && p.attrs.base === 'other')
  return {
    id: e.id,
    name: e.name,
    strain: a.strain ?? '',
    ...(a.printed ? { printed: a.printed } : {}),
    base: a.base ?? '',
    ...(a.awakens === 'adept' || a.awakens === 'magician' ? { awakens: a.awakens } : {}),
    freePhysical: int(a.freePhysical) ?? 0,
    freeMental: int(a.freeMental) ?? 0,
    ...(int(a.essence) !== undefined ? { essence: int(a.essence) } : {}),
    ...(int(a.magic) !== undefined ? { magic: int(a.magic) } : {}),
    ...(int(a.magicLoss) !== undefined ? { magicLoss: int(a.magicLoss) } : {}),
    ...(a.magicMax ? { magicMax: a.magicMax } : {}),
    ...(alt && int(alt.attrs.karma) !== undefined
      ? {
          alt: {
            karma: int(alt.attrs.karma)!,
            adds: Object.fromEntries(CORE.filter(k => int(alt.attrs[k])).map(k => [k, int(alt.attrs[k])!])),
            ...(alt.attrs.note ? { note: alt.attrs.note } : {}),
            ...(int(alt.attrs.page) ? { page: int(alt.attrs.page) } : {}),
          },
        }
      : {}),
    powers: e.parts.filter(p => p.tag === 'optionalpower' && p.attrs.ref).map(p => ({ ref: p.attrs.ref, free: p.attrs.free === 'true' })),
  }
}

/** The metatype's name as the types' `base` and the maxima's `when` print it (Human, Dwarf). */
export const metatypeName = (data: Pick<Sr6Data, 'metatypes'>, metatype: string) => data.metatypes[metatype]?.name ?? ''

/** Each metavariant's parent metatype (the Sixth World Companion's Metavariants tables, pp. 79–84, grouped by parent).
 *  ponytail: by name, as the catalog has no parent attribute (metatypeSize does the same); a metasapient has none. */
const PARENT: Record<string, string> = Object.fromEntries(
  Object.entries({
    Dwarf: ['Duende', 'Gnome', 'Hanuman', 'Koborokuru', 'Menehune'],
    Elf: ['Dalakitnon', 'Dryad', 'Nocturna', 'Wakyambi', 'Xapiri Thepe'],
    Human: ['Nartaki', 'Valkyrie'],
    Ork: ['Hobgoblin', 'Ogre', 'Oni', 'Satyr'],
    Troll: ['Cyclops', 'Fomorian', 'Giant', 'Minotaur'],
  }).flatMap(([parent, vs]) => vs.map(v => [normName(v), parent])),
)

/** The metatype Infected reads (owner, 2026-10-16): a metavariant's parent (Hobgoblin: Ork), else the metatype itself.
 *  '' for no metatype. */
export const baseMetatype = (data: Pick<Sr6Data, 'metatypes'>, metatype: string) => {
  const n = metatypeName(data, metatype)
  return PARENT[normName(n)] ?? n
}

/** How a metatype takes a type: 'own' its base metatype (a metavariant its parent); 'alt' any other through its
 *  <infectedalt base="other"> (the non-human vampire, p. 109); undefined: it can't. */
export function infectedFit(data: Pick<Sr6Data, 'metatypes'>, metatype: string, t: InfectedType): 'own' | 'alt' | undefined {
  const m = normName(baseMetatype(data, metatype))
  if (!m) return undefined
  return m === normName(t.base) ? 'own' : t.alt ? 'alt' : undefined
}

/** The Infected types the metatype may take (the selector's list), by name. */
export function infectedTypes(data: Sr6Data, metatype: string): (InfectedType & { fit: 'own' | 'alt' })[] {
  return Object.keys(data.qualities)
    .flatMap(id => {
      const t = infectedOf(data.entry('qualities', id)),
        fit = t && !data.qualities[id].parent ? infectedFit(data, metatype, t) : undefined
      return t && fit ? [{ ...t, fit }] : []
    })
    .sort((a, z) => a.name.localeCompare(z.name))
}

/** The runner's Infected type: its line, the type, and whether it is taken through <infectedalt>. */
export function runnerInfected(b: Sr6Build, data: Sr6Data): { line: Sr6Quality; t: InfectedType; alt: boolean } | undefined {
  for (const line of b.qualities) {
    const t = infectedOf(data.entry('qualities', line.id))
    if (t) return { line, t, alt: infectedFit(data, b.metatype, t) === 'alt' }
  }
  return undefined
}

/** The magic kind the method bought (before an Infected type changed it). */
export const boughtKind = (b: Pick<Sr6Build, 'magic' | 'infectedFrom'>): MagicKind => b.infectedFrom ?? b.magic

/** The kind a type leaves a runner of kind `from` (p. 105, the types' Notes): a technomancer loses Resonance; one not
 *  Awakened Awakens as the type's adept or magician; one Awakened as the other kind becomes a mystic adept. */
export function infectedKind(from: MagicKind, awakens?: 'adept' | 'magician'): MagicKind {
  const k = from === 'technomancer' ? 'mundane' : from
  if (!awakens) return k
  if (k === 'mundane') return awakens === 'adept' ? 'adept' : 'full'
  if (awakens === 'adept' && (k === 'full' || k === 'aspected')) return 'mystic-adept'
  if (awakens === 'magician' && k === 'adept') return 'mystic-adept'
  return k
}

/** The Awakened flag: derived from the magic kind (or an Infected type: every Infected is Awakened, p. 105), with why;
 *  value is the player's override when set. */
export function awakenedFlag(b: Sr6Build, data: Sr6Data): { value: boolean; derived: boolean; why: string; override?: boolean } {
  const inf = runnerInfected(b, data),
    derived = awakenedKind(b.magic) || !!inf
  const why = awakenedKind(b.magic)
    ? MAGIC_KIND_LABELS[b.magic].toLowerCase()
    : inf
      ? `Infected: ${inf.t.name}`
      : b.magic === 'technomancer'
        ? 'technomancer: Emerged, not Awakened'
        : 'mundane'
  return { value: b.awakened ?? derived, derived, why, ...(b.awakened !== undefined ? { override: b.awakened } : {}) }
}

/** Whether a quality's Awakened price (<karmaif>) applies: the flag; for the Infected type itself, Awakened before it (an
 *  Infected type's "-10 Karma if character is already Awakened": the kind the method bought, or the override). */
export function priceAwakened(b: Sr6Build, data: Sr6Data, id: string): boolean {
  return infectedOf(data.entry('qualities', id)) ? (b.awakened ?? awakenedKind(boughtKind(b))) : awakenedFlag(b, data).value
}

/** The Magic a Strain II or III type gives (p. 106): `magic` to one without Magic, less `magicLoss` for one with it. */
export function infectedMagic(b: Sr6Build, data: Sr6Data): number {
  const t = runnerInfected(b, data)?.t
  if (!t) return 0
  return awakenedKind(boughtKind(b)) ? -(t.magicLoss ?? 0) : (t.magic ?? 0)
}

/** The Essence the type starts the runner at (Strain II and III: 5); undefined: the setting's (Strain I: the book gives
 *  no creation Essence, owner 2026-10-16). */
export const infectedEssence = (b: Sr6Build, data: Sr6Data) => runnerInfected(b, data)?.t.essence

/** The type's highest Magic before Essence's loss (`5+initiate-grade`; `ess+initiate-grade`, Strain I: Magic follows
 *  Essence, so the starting Essence here, its loss taken off as everyone's); undefined: none or unreadable. */
export function infectedMagicMax(b: Sr6Build, data: Sr6Data, cr: CreationRules): number | undefined {
  const t = runnerInfected(b, data)?.t,
    m = /^(\d+|ess)\+initiate-grade$/.exec((t?.magicMax ?? '').replace(/\s+/g, ''))
  if (!t || !m) return undefined
  const base = m[1] === 'ess' ? Math.floor(t.essence ?? num(cr, 'essence') ?? 0) : Number(m[1])
  return base + b.initiation
}

/** An Infected optional power (class INFECTED/OPTIONAL_POWER). */
export const optionalPower = (e: Pick<Sr6Entry, 'attrs'> | undefined) => /^INFECTED\/OPTIONAL_POWER$/i.test(e?.attrs.class ?? '')

/** The optional power line the type's free pick covers (p. 105: one, free): of the runner's lines its type lists as
 *  free, the dearest. */
export function freePick(b: Sr6Build, data: Sr6Data): Sr6Quality | undefined {
  const t = runnerInfected(b, data)?.t
  const unit = (q: Sr6Quality) => Math.abs(data.qualities[q.id]?.karma ?? 0)
  return b.qualities.filter(q => t?.powers.some(p => p.free && p.ref === q.id)).sort((x, y) => unit(y) - unit(x))[0]
}
/** Whether `id` is one the type's free pick may take. */
export const freeEligible = (b: Sr6Build, data: Sr6Data, id: string) => !!runnerInfected(b, data)?.t.powers.some(p => p.free && p.ref === id)

/** Why optional power `id` can't be bought (enforced, owner 2026-10-16): no Infected type, not on the type's list, or
 *  at creation past the free pick unless the table's infectedPowersAtCreation lets it (p. 105: "in general" after
 *  creation). undefined: it can. */
export function powerRefusal(b: Sr6Build, data: Sr6Data, cr: CreationRules, id: string, atCreation: boolean): string | undefined {
  const t = runnerInfected(b, data)?.t
  if (!t) return 'infected-no-type'
  if (!t.powers.some(p => p.ref === id)) return 'infected-not-listed'
  if (atCreation && !flag(cr, 'infectedPowersAtCreation') && !(freeEligible(b, data, id) && !freePick(b, data))) return 'infected-after-creation'
  return undefined
}
