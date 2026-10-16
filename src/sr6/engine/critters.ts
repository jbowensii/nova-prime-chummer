// Critters a runner owns (owner 2026-10-16, BUILDER Q9-Q10): bought at Wild Life's Purchasing a Critter prices (p. 180,
// the catalog's `Critter purchase` gear rows, read by their printed names: a pet's class the player picks, Awakened or
// Emerged from the critter's own Magic or Resonance), or tamed from the wild (no price; Wild Soul and a negative quality,
// p. 184); its companion qualities specified with the purchase (each ±1 Availability, only the net Karma moving the
// price; six at most, p. 184), from taming, or bought with the runner's own Karma through the Critter Bond path's
// Permanent Improvement (SWC p. 139: negatives' bonus Karma comes off before the doubling, WL p. 184); its named
// commands (up to Logic × 2) and special training (up to Intuition × 2), pp. 180-183, the book's lists in the catalog
// (owner 2026-10-16: bought with it, +1 Body in the price each; taught later, the OPTIONS row's +500¥/+750¥); its
// critter powers innate, never priced (owner rule);
// critterware on Body 2 or more, +10% a point of natural Body over 8, Essence loss taking Magic or Resonance (Body Shop
// pp. 135, 140). Past a limit is a Review warning, never refused.
import type { PetClass, Sr6CritterQuality, Sr6CritterTrained, Sr6Purchase } from '../model/character'
import type { Sr6Entry } from '../model/types'
import type { Sr6Data } from './data'
import type { Sr6QualityView } from './types'
import { entryLabel } from './categories'
import { normName } from './names'
import { legality, rated } from './values'

export type CritterClass = PetClass | 'awakened' | 'emerged'
/** Wild Life p. 180's CRITTER rows by their printed names; the OPTIONS rows. */
const ROW: Record<CritterClass, string> = { mundane: 'Pet (Mundane)', exotic: 'Pet (Exotic)', wild: 'Pet (Wild)', awakened: 'Awakened', emerged: 'Emerged' }
const OPTION = { positive: 'Positive Quality', negative: 'Negative Quality', command: 'Trained: Command', training: 'Trained: Special Training' }
export const CRITTER_CLASS_LABELS: Record<CritterClass, string> = {
  mundane: 'Mundane pet',
  exotic: 'Exotic pet',
  wild: 'Wild pet',
  awakened: 'Awakened',
  emerged: 'Emerged',
}

/** A critter companion quality (Wild Life pp. 184-186: class CRITTERWARE/QUALITY). */
export const isCritterQuality = (e?: Pick<Sr6Entry, 'attrs'>) => /^CRITTERWARE\/QUALITY$/i.test(e?.attrs.class ?? '')
/** A critter quality by its printed name (`Wild Soul`; a family's parent name: its lowest level). */
export const critterQualityNamed = (data: Sr6Data, name: string) => {
  const e = data.named?.(name, 'qualities')
  return isCritterQuality(e) ? e : undefined
}
/** A printed value's first number (`5(7)`: 5); 0 when none. */
export const firstNumber = (s?: string) => Number(/-?\d+(?:\.\d+)?/.exec(s ?? '')?.[0] ?? 0)
/** A stat as the stat block prints it, its first number; 0 when none. */
export const critterStat = (e: Sr6Entry | undefined, k: string) => firstNumber(e?.attrs[k])
/** Awakened or Emerged from its own Magic or Resonance, else the pet class the player chose (none: mundane). */
export const critterClass = (x: Pick<Sr6Purchase, 'pet'>, e?: Sr6Entry): CritterClass =>
  critterStat(e, 'mag') > 0 ? 'awakened' : critterStat(e, 'res') > 0 ? 'emerged' : (x.pet ?? 'mundane')

/** A Purchasing a Critter or critter gear value as printed (`(Body + Magic) x 2,000 nuyen`, `(Magic + 1)(L)`,
 *  `Critter's Body x 50¥`, `+500 nuyen`) at the critter's numbers; null: none printed (`--`) or not readable. */
export function critterValue(s: string | undefined, v: { Body: number; Magic?: number; Resonance?: number }): number | null {
  if (!s || /^[\s—–-]*$/.test(s)) return null
  const src = s
    .replace(/nuyen|¥/gi, '')
    .replace(/critter['’]s\s*/gi, '')
    .replace(/(\d),(?=\d{3}\b)/g, '$1')
    .replace(/\bbody\b/gi, ` ${v.Body} `)
    .replace(/\bmagic\b/gi, ` ${v.Magic ?? 0} `)
    .replace(/\bresonance\b/gi, ` ${v.Resonance ?? 0} `)
  const r = rated(src)
  return r.ok ? r.n : null
}
/** The first amount an OPTIONS row prints (`+1,000 nuyen per net Karma cost`: 1000, `-5% nuyen cost…`: 5). */
const amount = (s?: string) => Number(/\d[\d,]*(?:\.\d+)?/.exec(s ?? '')?.[0].replace(/,/g, '') ?? 0)
const row = (data: Sr6Data, name: string) => {
  const e = data.named?.(name, 'gear')
  return e && /^critter purchase/i.test(e.attrs.category ?? '') ? e : undefined
}
/** A companion quality's Karma: its catalog Karma, by level when taken by level. */
export const critterQualityKarma = (v: Sr6QualityView, q: Pick<Sr6CritterQuality, 'level'>) => Math.abs(v.karma ?? 0) * (v.perLevel ? q.level : 1)
const fmt = (x: number) => x.toLocaleString('en-US')
/** The critter's catalog entry, else its snapshot (purchases.ts entryOf, which imports this file). */
const entryOf = (x: Sr6Purchase, data: Sr6Data) => (x.id ? (data.entry(x.kind, x.id) ?? x.snapshot) : undefined)

export interface CritterPrice {
  cls: CritterClass
  cost: number
  avail: number
  legal?: 'L' | 'I' | 'F'
  /** false: a row or value the app can't find or read (counted 0; notes say which) */
  ok: boolean
  notes: string[]
  /** how the price was worked out, step by step (shown on the Critters tab) */
  parts: string[]
}
/** A Critter Command Action or Critter Special Training (Wild Life pp. 181-183): a catalog action of that category. */
export const TRAINED: Record<Sr6CritterTrained['what'], RegExp> = { command: /^critter command actions$/i, training: /^critter special training$/i }
export const trainedWhat = (e?: Pick<Sr6Entry, 'kind' | 'attrs'>) =>
  e?.kind === 'actions' ? (Object.keys(TRAINED) as Sr6CritterTrained['what'][]).find(k => TRAINED[k].test(e.attrs.category ?? '')) : undefined
export const TRAINED_LABELS = { command: 'command', training: 'special training' } as const
/** A trained command's or special training's name: its catalog entry's, else as saved, else an older file's unnamed one. */
export const trainedName = (t: Sr6CritterTrained, data: Sr6Data) => (t.id && data.entry('actions', t.id)?.name) || t.name || `Unnamed ${TRAINED_LABELS[t.what]}`
/** Taught after the critter was bought (a tamed critter's always are, owner 2026-10-16 Q3). */
export const isTaught = (x: Pick<Sr6Purchase, 'tamed'>, t: Sr6CritterTrained) => !!(x.tamed || t.taught)
/** A command or special training taught after the critter was bought: the OPTIONS row's price (Wild Life p. 180:
 *  +500¥, +750¥); null: the row isn't in the catalog. */
export const taughtPrice = (data: Sr6Data, what: Sr6CritterTrained['what']) => (o => (o ? amount(o.attrs.cost) : null))(row(data, OPTION[what]))
const plural = (n: number, what: Sr6CritterTrained['what']) => `${n} ${TRAINED_LABELS[what]}${n === 1 || what === 'training' ? '' : 's'}`

/** A critter's price and Availability (Wild Life p. 180): its class's row at its Body, Magic or Resonance, each command
 *  and special training it is bought with adding 1 to the Body in that price only and 1 to its Availability (p. 183,
 *  owner 2026-10-16 reading B); the qualities specified with it (each ±1 Availability; the net Karma: +N¥ per point of
 *  cost, -N% of the whole price per point of bonus, never below 0, owner Q2). A tamed critter has no price or
 *  Availability. Each command or special training taught after it was bought: the OPTIONS row's price (+500¥, +750¥), no
 *  Availability. Powers are never priced. */
export function critterPrice(x: Sr6Purchase, data: Sr6Data): CritterPrice {
  const e = entryOf(x, data),
    cls = critterClass(x, e)
  const out: CritterPrice = { cls, cost: 0, avail: 0, ok: true, notes: [], parts: [] }
  const missing = (name: string) => {
    out.ok = false
    out.notes.push(`Wild Life’s Purchasing a Critter row “${name}” (p. 180) isn’t in the catalog`)
  }
  const option = (k: keyof typeof OPTION) => {
    const o = row(data, OPTION[k])
    if (!o) missing(OPTION[k])
    return { cost: amount(o?.attrs.cost), avail: amount(o?.attrs.avail) }
  }
  const trained = x.trained ?? [],
    count = (ts: Sr6CritterTrained[], w: Sr6CritterTrained['what']) => ts.filter(t => t.what === w).length
  const withIt = trained.filter(t => !isTaught(x, t)),
    taught = trained.filter(t => isTaught(x, t))
  if (x.tamed) out.parts.push('tamed from the wild: no price (Wild Life p. 184)')
  else {
    const r = row(data, ROW[cls])
    if (!r) {
      missing(ROW[cls])
      return out
    }
    const body = critterStat(e, 'bod'),
      at = { Magic: critterStat(e, 'mag'), Resonance: critterStat(e, 'res') }
    const base = critterValue(r.attrs.cost, { Body: body + withIt.length, ...at })
    if (base === null) {
      out.ok = false
      out.notes.push(`${r.name}’s price “${r.attrs.cost ?? ''}” isn’t a number the app can read`)
    }
    out.cost = base ?? 0
    out.avail = critterValue(r.attrs.avail, { Body: body, ...at }) ?? 0
    out.legal = legality(r.attrs.avail)
    out.parts.push(`${r.name} ${r.attrs.cost ?? ''}${withIt.length ? ` at Body ${body} + ${withIt.length} trained (p. 183)` : ''}: ${fmt(out.cost)}¥`)
    if (withIt.length) {
      const nc = count(withIt, 'command'),
        nt = count(withIt, 'training'),
        av = nc * option('command').avail + nt * option('training').avail
      out.avail += av
      out.parts.push(`${[nc && plural(nc, 'command'), nt && plural(nt, 'training')].filter(Boolean).join(', ')} with the purchase: Availability +${av}`)
    }
    let pos = 0,
      neg = 0,
      npos = 0,
      nneg = 0
    for (const q of x.critterQualities ?? []) {
      const v = data.qualities[q.id]
      if (q.how || !v) continue
      if (v.positive) {
        pos += critterQualityKarma(v, q)
        npos++
      } else {
        neg += critterQualityKarma(v, q)
        nneg++
      }
    }
    if (npos || nneg) {
      const p = option('positive'),
        n = option('negative'),
        net = pos - neg
      out.avail += npos * p.avail - nneg * n.avail
      // (the bonus off the whole price, training included, owner Q2)
      if (net > 0) out.cost += net * p.cost
      else out.cost -= Math.min(out.cost, Math.round((out.cost * n.cost * -net) / 100))
      out.parts.push(
        `qualities: ${npos} positive, ${nneg} negative (Availability ${npos * p.avail - nneg * n.avail >= 0 ? '+' : ''}${npos * p.avail - nneg * n.avail}); net ${
          net > 0
            ? `${net} Karma cost: +${fmt(net * p.cost)}¥`
            : net < 0
              ? `${-net} Karma bonus: −${Math.min(100, n.cost * -net)}% of the whole price`
              : '0 Karma'
        }`,
      )
    }
  }
  for (const k of ['command', 'training'] as const) {
    const c = count(taught, k)
    if (!c) continue
    const o = option(k)
    out.cost += c * o.cost
    out.parts.push(`${plural(c, k)} taught later: +${fmt(c * o.cost)}¥`)
  }
  return out
}

/** The Karma the runner pays at creation for an owned critter's bonded qualities (the Critter Bond path's Permanent
 *  Improvement, SWC p. 139): its bonded positives less its bonded negatives' bonus (Wild Life p. 184), never below 0.
 *  After creation each bond is a Ledger spend at the career quality factor (career.ts). */
export function bondKarma(x: Sr6Purchase, data: Sr6Data): number {
  let pos = 0,
    neg = 0
  for (const q of x.critterQualities ?? []) {
    const v = data.qualities[q.id]
    if (q.how !== 'bonded' || !v) continue
    if (v.positive) pos += critterQualityKarma(v, q)
    else neg += critterQualityKarma(v, q)
  }
  return Math.max(0, pos - neg)
}

/** A companion quality's levels (a level of a family: its own, `Untrainable 2`; else the line's) when its name starts so. */
const levelsNamed = (x: Sr6Purchase, data: Sr6Data, re: RegExp) =>
  (x.critterQualities ?? [])
    .filter(q => re.test(normName(data.qualities[q.id]?.name ?? q.name ?? '')))
    .reduce((t, q) => t + (data.levelOf(data.entry('qualities', q.id)) ?? q.level), 0)

export interface CritterView {
  e?: Sr6Entry
  name: string
  price: CritterPrice
  /** its Essence as printed (none: 6) and after its augmentations; Magic or Resonance before and after the loss */
  essence: { base: number; left: number }
  magic?: { base: number; now: number }
  resonance?: { base: number; now: number }
  commands: { n: number; max: number }
  training: { n: number; max: number }
  /** its stat block's powers and weaknesses lines, as printed: innate, never priced */
  powers?: string
  weaknesses?: string
  warnings: { message: string; source: string; page: number }[]
}
/** Everything the Critters tab, Review and the sheets say about an owned critter; lost: the Essence its augmentations
 *  take (purchases.ts priced's essence of the line). */
export function critterView(x: Sr6Purchase, data: Sr6Data, lost: number): CritterView {
  const e = entryOf(x, data),
    name = e ? entryLabel(e) : (x.name ?? 'Custom critter')
  const warnings: CritterView['warnings'] = []
  const warn = (message: string, source: string, page: number) => warnings.push({ message, source, page })
  // commands up to Logic × 2, special training up to Intuition × 2 (WL p. 180), a level of Receptive to Training one more
  // of each, a level of Untrainable one less (pp. 184, 186)
  const more = levelsNamed(x, data, /^receptive to training/) - levelsNamed(x, data, /^untrainable/)
  const n = (w: Sr6CritterTrained['what']) => (x.trained ?? []).filter(t => t.what === w).length
  const commands = { n: n('command'), max: Math.max(0, critterStat(e, 'log') * 2 + more) },
    training = { n: n('training'), max: Math.max(0, critterStat(e, 'int') * 2 + more) }
  if (commands.n > commands.max) warn(`${name}: ${commands.n} commands; it can learn ${commands.max} (Logic × 2).`, 'WL', 180)
  if (training.n > training.max) warn(`${name}: ${training.n} special training; it can learn ${training.max} (Intuition × 2).`, 'WL', 180)
  const qs = x.critterQualities ?? [],
    v = (q: Sr6CritterQuality) => data.qualities[q.id]
  const bought = qs.filter(q => !q.how)
  if (bought.length > 6) warn(`${name}: ${bought.length} qualities specified with its purchase; the book allows six.`, 'WL', 184)
  if (x.tamed && (!qs.some(q => /^wild soul/.test(normName(v(q)?.name ?? q.name ?? ''))) || !qs.some(q => q.how === 'tamed' && v(q)?.positive === false)))
    warn(`${name}: a tamed critter has Wild Soul, balanced by a negative quality (High Maintenance 1 unless another).`, 'WL', 184)
  const bonded = qs.filter(q => q.how === 'bonded')
  if (bonded.filter(q => v(q)?.positive === false).length > bonded.filter(q => v(q)?.positive).length)
    warn(`${name}: more bonded negative qualities than positive ones; one negative goes with each positive bought.`, 'WL', 184)
  // Body Shop p. 135: cyberware and bioware on a natural Body of 2 or more; p. 140: Essence loss lowers Magic or Resonance
  if (critterStat(e, 'bod') < 2 && x.accessories.some(a => a.kind === 'augmentations'))
    warn(`${name}: Body ${critterStat(e, 'bod')}; only a critter of Body 2 or more takes cyberware and bioware.`, 'BS', 135)
  const base = e?.attrs.ess ? critterStat(e, 'ess') : 6,
    loss = Math.ceil(lost - 1e-9)
  if (base - lost < 0) warn(`${name}: its augmentations take ${lost} Essence; it has ${base}.`, 'BS', 140)
  const attr = (k: 'mag' | 'res') => (critterStat(e, k) > 0 ? { base: critterStat(e, k), now: Math.max(0, critterStat(e, k) - loss) } : undefined)
  const text = (tag: string) => e?.parts.find(p => p.tag === tag)?.text || undefined
  return {
    e,
    name,
    price: critterPrice(x, data),
    essence: { base, left: Math.round((base - lost) * 100) / 100 },
    magic: attr('mag'),
    resonance: attr('res'),
    commands,
    training,
    powers: text('powers'),
    weaknesses: text('weaknesses'),
    warnings,
  }
}
