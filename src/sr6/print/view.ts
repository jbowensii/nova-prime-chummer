// What every SR6 printed sheet (Sheet.tsx: Printer-friendly and Full color; BookSheet.tsx; NeonSheet.tsx; HexSheet.tsx;
// DossierSheet.tsx) reads off the runner: its name, purchase lines by kind, names and ratings, weapons split ranged/melee
// (their DV with the statuses they apply), every skill, languages and knowledge, gear, each SIN's lifestyles and licences,
// the Awakened flag, the Social Rating, a quality's notes (an Infected type's gains, Stolen Gear's bounty) and the karma and
// nuyen left (career: the ledger's balances). The styles differ in look only: each shows all of these (owner 2026-10-16).
import { entryOf, priced, settingQuality, statusesOf, toNuyen } from '../engine/budgets'
import { balances, stolenLeft } from '../engine/career'
import { awakenedFlag, runnerInfected } from '../engine/infected'
import type { PickKind, PurchaseKind, Sr6Character, Sr6CritterQuality, Sr6Licence, Sr6Lifestyle, Sr6Purchase, Sr6Quality, Sr6Sin } from '../model/character'
import { CRITTER_CLASS_LABELS, critterView, isTaught, trainedName } from '../engine/critters'
import { NPC_STATS } from '../engine/npc'
import type { Sr6Entry } from '../model/types'
import type { Sr6Data } from '../engine/data'
import type { Sr6Derived, Sr6Pool } from '../engine/derive'
import type { Sr6Ctx } from '../ui/editor'
import { entryLabel } from '../engine/categories'
import { effectState, effectText } from '../engine/effects'
import { builtinText, modsOf } from '../engine/vehiclemods'

export const PICKS: [PickKind, string][] = [
  ['spells', 'Spells'],
  ['rituals', 'Rituals'],
  ['adeptpowers', 'Adept powers'],
  ['metamagics', 'Metamagics'],
  ['complexforms', 'Complex forms'],
  ['echoes', 'Echoes'],
  ['datastructures', 'Data structures'],
]
/** What a spell's or metamagic's catalog flags say, in words: `Opposed`, `Essence`, `Adepts only`, `Taken again`. */
export function pickFlags(e: Sr6Entry): string[] {
  const a = e.attrs
  return e.kind === 'spells'
    ? [a.opposed === 'true' && 'Opposed', a.essence === 'true' && 'Essence threshold'].filter((x): x is string => !!x)
    : e.kind === 'metamagics'
      ? [
          a.user && `${a.user === 'adept' ? 'Adepts' : 'Magicians'} only`,
          a.perLevel === 'true' && `Taken again${a.maxLevel ? ` (up to ${a.maxLevel})` : ''}`,
        ].filter((x): x is string => !!x)
      : []
}

export const band = (v: number | null) => (v === null ? '—' : String(v))
/** `6 (9)`: a derived value and, when the switchable and conditional effects change it, the bracketed total (derive.ts
 *  on; owner decision 2026-10-10, as a book's stat block prints it). */
export const br = <T extends string | number | null | undefined>(a: T, b?: T): T | string =>
  a === null || a === undefined || b === undefined || b === null || String(a) === String(b) ? a : `${a} (${b})`
/** A pool's bracketed counterpart (the same skill with the switchable effects on). */
export const poolOn = (d: Sr6Derived, skill: string) => d.on.pools.find(x => x.skill === skill)
/** An attribute as a book prints it: with its always-on effects, the switchable ones on in brackets (`5 (7)`). */
export const attrShown = (d: Sr6Derived, a: keyof Sr6Derived['attrs']) => br(d.attrs[a].augmented, d.on.attrs[a].augmented)
export const AR_BANDS = ['Close', 'Near', 'Medium', 'Far', 'Extreme']
/** every catalog skill by name: the runner's pools, the rest at rank 0 (no pool where it can't be rolled untrained) */
export const allSkills = (d: Sr6Derived, data: Sr6Data): (Omit<Sr6Pool, 'dp'> & { dp?: number })[] =>
  [
    ...d.pools,
    ...Object.values(data.skills)
      .filter(s => !d.pools.some(p => p.skill === s.id))
      .map(s => ({ skill: s.id, label: s.name, rank: 0, attr: s.attr })),
  ].sort((x, y) => x.label.localeCompare(y.label))

/** The item a licence is for, named as it now is; undefined: a fake licence typed in, or the item is gone (dropped after
 *  finalising, its licence kept). */
export function licenceItem(b: Sr6Character['build'], data: Sr6Data, l: Sr6Licence): string | undefined {
  const x = l.item === undefined ? undefined : b.purchases.flatMap(y => [y, ...y.accessories]).find(y => y.uid === l.item),
    e = x && entryOf(x, data)
  return x && (e ? entryLabel(e) : (x.name ?? 'Custom item'))
}
/** A licence's rating as shown: none for an item's on a real SIN (priced at its fee), else ` 3`. */
export const licenceRatingText = (s: Sr6Sin, l: Sr6Licence) => (l.item !== undefined && s.kind === 'real' ? '' : ` ${l.rating}`)
/** One of a SIN's licences in words (the sheets): a fake licence `Zap License 2`; an item's, `Firearm license 2 (Zap Gun)`,
 *  on a real SIN (at its fee) `Firearm license (Zap Gun)`. */
export function licenceText(b: Sr6Character['build'], data: Sr6Data, s: Sr6Sin, l: Sr6Licence): string {
  const item = licenceItem(b, data, l)
  return `${l.name}${licenceRatingText(s, l)}${item ? ` (${item})` : ''}`
}

export function runnerView({ ch, data, cr, d, career }: Pick<Sr6Ctx, 'ch' | 'data' | 'cr' | 'd' | 'career'>) {
  const b = ch.build
  const lines = (kind: PurchaseKind) => b.purchases.filter(x => x.kind === kind)
  const nameOf = (x: Sr6Purchase) => {
    const e = entryOf(x, data)
    return e ? entryLabel(e) : (x.name ?? 'Custom item')
  }
  const attrsOf = (x: Sr6Purchase) => entryOf(x, data)?.attrs ?? {}
  // a weapon with modes or ammo shoots; the rest (blades, clubs, unarmed extras) are melee
  const ranged = (x: Sr6Purchase) => {
    const a = attrsOf(x)
    return !!(a.modes || a.ammo)
  }
  const { karma, nuyen } = career ? balances(ch) : { karma: d.karmaLeft, nuyen: d.nuyenLeft }
  const life = (l: Sr6Lifestyle) => `${data.entry('lifestyles', l.id)?.name ?? l.id} × ${l.months} month${l.months === 1 ? '' : 's'}`
  const first = b.sins.flatMap(s => s.lifestyles ?? [])[0]
  const aw = awakenedFlag(b, data),
    yes = (x: boolean) => (x ? 'yes' : 'no'),
    inf = runnerInfected(b, data),
    stolen = settingQuality(b, cr, 'stolenGearQuality', data)
  return {
    name: ch.identity.streetName || ch.identity.name || (ch.npc ? 'Unnamed NPC' : 'Unnamed runner'),
    lines,
    nameOf,
    attrsOf,
    /** a vehicle's or drone's lines under it, the same on every sheet (vehicleNotes) */
    vehicleNotes: (x: Sr6Purchase) => vehicleNotes(x, data),
    /** an owned critter's lines under it, the same on every sheet (critterNotes) */
    critterNotes: (x: Sr6Purchase) => critterNotes(x, data, cr),
    /** a host's own values from its accessories (`STR 5, Armor +2`), for its line on the sheet */
    host: (x: Sr6Purchase) => d.hosts.find(h => h.uid === x.uid)?.text,
    rated: (x: Sr6Purchase) => [x.rating && `rating ${x.rating}`, x.grade].filter(Boolean).join(', '),
    bands: (x: Sr6Purchase) => d.attackRatings.weapons.find(a => a.uid === x.uid)?.bands ?? [null, null, null, null, null],
    rangedWeapons: lines('weapons').filter(ranged),
    meleeWeapons: lines('weapons').filter(x => !ranged(x)),
    know: b.knowledge.filter(x => x.kind === 'knowledge'),
    langs: b.knowledge.filter(x => x.kind === 'language'),
    gear: [...lines('electronics'), ...lines('programs'), ...lines('gear'), ...lines('ammotypes')],
    /** a SIN's lifestyles, `Cozy × 2 months, Squat × 1 month` ('' when none) */
    lifeOf: (s: Sr6Sin) => (s.lifestyles ?? []).map(life).join(', '),
    /** the primary lifestyle: the first SIN's first one (of the SINs that have any) */
    lifestyle: first && life(first),
    /** a SIN's licences in words (licenceText) */
    licencesOf: (s: Sr6Sin) => s.licences.map(l => licenceText(b, data, s, l)),
    /** a weapon's DV, its bonus damage when it has one (high Strength on a melee weapon: `3P (+1)`), and the statuses it
     *  applies (`4P, Burning 4`: the No Future errata's Molotov) */
    dv: (x: Sr6Purchase) => {
      const plus = d.attackRatings.weapons.find(a => a.uid === x.uid)?.dvBonus
      return [`${attrsOf(x).dv ?? ''}${plus ? ` (+${plus})` : ''}`, ...statusesOf(entryOf(x, data))].filter(Boolean).join(', ')
    },
    /** an armor line's Social Rating as printed (clothing, Smooth Operations), '' when none */
    social: (x: Sr6Purchase) => attrsOf(x).social ?? '',
    /** the Awakened flag (infected.ts awakenedFlag): `yes (adept)`, `no (mundane)`; an override names what it overrides */
    awakened: aw.override === undefined ? `${yes(aw.value)} (${aw.why})` : `${yes(aw.value)}, overridden (derived: ${yes(aw.derived)}, ${aw.why})`,
    /** a quality's lines below it: an Infected type's gained powers and weaknesses (SWC pp. 110–114), Stolen Gear's bounty */
    qualityNotes: (q: Sr6Quality): string[] => [
      ...(inf?.line === q
        ? (['power', 'weakness'] as const).flatMap(tag => {
            const gs = inf.t.gains.filter(g => g.tag === tag)
            return gs.length ? [`${tag === 'power' ? 'Powers' : 'Weaknesses'}: ${gs.map(g => `${g.name}${g.rating ? ` ${g.rating}` : ''}`).join(', ')}`] : []
          })
        : []),
      ...(stolen === q ? [`Bounty: ${stolenLeft(b, cr, data, q)} of ${toNuyen(b, cr, data)} karma turned into nuyen not bought off`] : []),
    ],
    karma,
    nuyen,
    /** what the runner's things do that the numbers above don't hold: switchable, conditional and low-confidence effects,
     *  the rule kinds (Edge on tests, Edge costs, no Edge, wild dice, extra actions, Hardened Armor, Overwatch …) and links,
     *  `Name: text` each (owner decision 2026-10-10: the sheet shows them) */
    effectNotes: effectNotes(ch.build, data),
  }
}

/** A vehicle's or drone's fitted lines in words: its mods (`Improved Handling 1 (do it yourself)`), each weapon with its
 *  mount, its autosofts and programs, anything else on it, the mods built in, the mod slots shifted (vehiclemods.ts). */
export function vehicleNotes(x: Sr6Purchase, data: Sr6Data): string[] {
  const name = (a: Sr6Purchase) => (e => `${e ? entryLabel(e) : (a.name ?? 'Custom item')}${a.rating ? ` ${a.rating}` : ''}`)(entryOf(a, data))
  const m = modsOf(x, data),
    kind = (a: Sr6Purchase) => m.fitted.find(f => f.uid === a.uid)?.kind
  const group = (label: string, xs: Sr6Purchase[], each: (a: Sr6Purchase) => string = name) => (xs.length ? [`${label}: ${xs.map(each).join(', ')}`] : [])
  const mount = (a: Sr6Purchase) => x.accessories.find(y => y.uid === a.mount)
  return [
    ...group(
      'Mods',
      x.accessories.filter(a => !['weapon', 'program', 'other'].includes(kind(a) ?? 'other')),
      a => `${name(a)}${a.diy ? ' (do it yourself)' : ''}`,
    ),
    ...group(
      'Weapons',
      x.accessories.filter(a => kind(a) === 'weapon'),
      a => `${name(a)} (${mount(a) ? `in ${name(mount(a)!)}` : 'in no mount'})`,
    ),
    ...group(
      'Autosofts and programs',
      x.accessories.filter(a => kind(a) === 'program'),
    ),
    ...group(
      'With',
      x.accessories.filter(a => kind(a) === 'other'),
    ),
    ...(m.builtin.length ? [`Built in: ${m.builtin.map(builtinText).join(', ')}`] : []),
    ...(m.shifts?.length ? [`Mod slots shifted: ${m.shifts.map(t => `2 ${t.from} → 1 ${t.to}`).join(', ')}`] : []),
  ]
}

const CRITTER_STATS = new Set(['bod', 'agi', 'rea', 'str', 'wil', 'log', 'int', 'cha', 'edg', 'ess', 'mag', 'res'])
/** An owned critter's lines in words, the same on every sheet (critters.ts critterView): its class (tamed), its stat
 *  block's attributes, its powers (innate, 0 Karma) and weaknesses, its companion qualities (how they came), its named
 *  commands and special training against their limits (those taught after it was bought marked), its critterware and
 *  other fitted gear, and its Essence and Magic or Resonance after its augmentations. */
export function critterNotes(x: Sr6Purchase, data: Sr6Data, cr: Sr6Ctx['cr']): string[] {
  const v = critterView(x, data, priced(x, data, cr).essence),
    a = v.e?.attrs ?? {}
  const name = (y: Sr6Purchase) => (e => `${e ? entryLabel(e) : (y.name ?? 'Custom item')}${y.rating ? ` ${y.rating}` : ''}`)(entryOf(y, data))
  const quality = (q: Sr6CritterQuality) => {
    const w = data.qualities[q.id]
    return `${w?.name ?? q.name ?? q.id}${w?.perLevel ? ` ${q.level}` : ''}${q.how ? ` (${q.how})` : ''}`
  }
  const group = (label: string, xs: Sr6Purchase[]) => (xs.length ? [`${label}: ${xs.map(name).join(', ')}`] : [])
  const stats = NPC_STATS.filter(([k]) => CRITTER_STATS.has(k) && a[k]).map(([k, l]) => `${l} ${a[k]}`)
  const after = [v.magic && `Magic ${v.magic.now}`, v.resonance && `Resonance ${v.resonance.now}`].filter(Boolean)
  return [
    `${CRITTER_CLASS_LABELS[v.price.cls]}${x.tamed ? ', tamed' : ''}`,
    ...(stats.length ? [stats.join(', ')] : []),
    ...(v.powers ? [`Powers (innate, 0 Karma): ${v.powers}`] : []),
    ...(v.weaknesses ? [`Weaknesses: ${v.weaknesses}`] : []),
    ...(x.critterQualities?.length ? [`Qualities: ${x.critterQualities.map(quality).join(', ')}`] : []),
    ...(['command', 'training'] as const).map(w => {
      const ts = (x.trained ?? []).filter(t => t.what === w),
        c = w === 'command' ? v.commands : v.training
      return `${w === 'command' ? 'Commands' : 'Special training'} ${c.n} of ${c.max}${ts.length ? `: ${ts.map(t => `${trainedName(t, data)}${isTaught(x, t) ? ' (taught)' : ''}`).join(', ')}` : ''}`
    }),
    ...group(
      'Critterware',
      x.accessories.filter(y => y.kind === 'augmentations'),
    ),
    ...group(
      'With',
      x.accessories.filter(y => y.kind !== 'augmentations'),
    ),
    ...(v.essence.left !== v.essence.base ? [[`Essence ${v.essence.left} after its augmentations`, ...after].join(', ')] : []),
  ]
}

const COUNTED = /^(attr:|derived:(defense|initiative-dice|physical-monitor|stun-monitor|overflow)$|skill:|test:)/
/** The effect lines the sheet lists (runnerView.effectNotes): every effect of the runner's qualities, picks and lines but
 *  an always-on `add` the derived numbers already count. */
export function effectNotes(b: Sr6Character['build'], data: Sr6Data): { from: string; text: string }[] {
  const out: { from: string; text: string }[] = []
  const take = (e: Sr6Entry | undefined) => {
    for (const p of e?.parts ?? []) {
      if (p.tag !== 'effect' && p.tag !== 'link') continue
      if (p.tag === 'effect' && p.attrs.op === 'add' && effectState(p) === 'applied' && COUNTED.test(p.attrs.target ?? '')) continue
      // (owner 2026-10-11: a conditional or switchable effect gets a tick box on the sheet, a reminder to count it when it holds)
      out.push({ from: entryLabel(e!), text: `${effectState(p) === 'conditional' ? '☐ ' : ''}${effectText(p)}` })
    }
  }
  for (const q of b.qualities) take(data.entry('qualities', q.id))
  for (const x of b.picks) take(data.entry(x.kind, x.id))
  // (an owned critter's and its augmentations' effects are its own, not the runner's)
  for (const x of b.purchases.filter(y => y.kind !== 'critters')) {
    take(entryOf(x, data))
    for (const a of x.accessories) take(entryOf(a, data))
  }
  return out
}
