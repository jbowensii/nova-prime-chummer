// Character prerequisites (Commlink6 `apply="CHARACTER"` requirements, behaviour-gaps Stage 3): what the RUNNER must have
// for an item to be taken (another quality, metamagic or echo, an adept power, a magic type, a metatype, a minimum
// attribute, Essence or skill rank, owned gear). The host-item requirements (apply DATA_ITEM) are catalog/structure.ts
// requirementsOf. A failure is a Review error (rules.ts prerequisite.character), never a refusal, and a picker note.
import { MAGIC_KINDS, type Sr6Data } from '../../../catalog/domain/data'
import { normName } from '../../../catalog/domain/names'
import { structureOf } from '../../../catalog/domain/structure'
import type { Sr6Attr, Sr6Build, Sr6Purchase } from '../../../formats/domain/character'
import type { Sr6Entry } from '../../../formats/domain/types'
import type { CreationRules } from '../../../table-setup/domain/creation'
import { augmentedRating } from './attributes'
import { essenceBudget } from './essence'
import { entryOf } from './purchases'
import type { Provider } from './providers'

export interface PrereqCtx {
  data: Sr6Data
  cr: CreationRules
  b: Sr6Build
  p: Provider
}
type P = Record<string, string>

const ATTRS: Record<string, Sr6Attr> = {
  BODY: 'bod',
  AGILITY: 'agi',
  REACTION: 'rea',
  STRENGTH: 'str',
  WILLPOWER: 'wil',
  LOGIC: 'log',
  INTUITION: 'int',
  CHARISMA: 'cha',
  EDGE: 'edg',
  MAGIC: 'mag',
  RESONANCE: 'res',
}
// Commlink6's magic/resonance type ids against ours (ids not listed here can't be told)
const KINDS: Record<string, Sr6Build['magic'][]> = {
  adept: ['adept'],
  mysticadept: ['mystic-adept'],
  technomancer: ['technomancer'],
  mundane: ['mundane'],
  magician: ['full', 'mystic-adept'],
  aspectedmagician: ['aspected'],
}
const key = (ref: string) => normName(ref.replace(/_/g, ' '))
/** a printed name is the reference, or the reference with a level/note after it */
const named = (name: string | undefined, ref: string) => {
  const n = normName(name ?? '')
  return n === key(ref) || n.startsWith(`${key(ref)} `)
}
const pretty = (ref: string) => ref.replace(/_/g, ' ')

/** The character prerequisites of `item` the runner fails, each in words, and the ones that can't be told (`unchecked`:
 *  a choice, a skill specialization, an item attribute). Semantics as Commlink6: ungrouped tests all hold; the tests of
 *  one `group` hold when any does; negate turns a test round. ponytail: several ungrouped METATYPE / MAGIC_RESO tests
 *  read as alternatives (a runner has one of each; Commlink6 prints them as a list), not as all-required. */
export function characterRequirements(item: Sr6Entry, c: PrereqCtx, rating = 1): { failed: string[]; unchecked: string[] } {
  const failed: string[] = [],
    unchecked: string[] = []
  const tests = structureOf(item).prerequisites.filter(t => t.apply === 'CHARACTER' && t.remove !== 'true')
  if (!tests.length) return { failed, unchecked }
  const { data, b } = c
  const nameOf = (kind: string, id: string, fallback?: string) => data.entry(kind as never, id)?.name ?? fallback
  const held = (kinds: string[], ref: string) =>
    b.picks.some(x => kinds.includes(x.kind) && named(nameOf(x.kind, x.id, x.name), ref)) ||
    (kinds.includes('qualities') && b.qualities.some(q => named(nameOf('qualities', q.id, q.name), ref)))
  const level = (ref: string) => Math.max(0, ...b.qualities.filter(q => named(nameOf('qualities', q.id, q.name), ref)).map(q => q.level))
  const owned = (ref: string) => {
    const walk = (x: Sr6Purchase): boolean => named(x.name ?? entryOf(x, data)?.name, ref) || x.accessories.some(walk)
    return b.purchases.some(walk)
  }
  const skillRank = (ref: string) => {
    const s = b.skills.find(x => normName(x.id.split('.').pop() ?? x.id) === key(ref) || named(data.skills[x.id]?.name, ref))
    return s ? s.points + s.karma : 0
  }
  const want = (t: P) => (t.value.trim() === '$RATING' ? rating : Number(t.value))
  /** whether one test holds; undefined: can't be told */
  const holds = (t: P): boolean | undefined => {
    if (t.choice || t.ref === 'CHOICE') return undefined
    let r: boolean | undefined
    const ref = t.ref ?? ''
    if (t.type === 'METATYPE') r = named(data.metatypes[b.metatype]?.name, ref)
    else if (t.type === 'QUALITY') r = t.kind === 'valuereq' && t.value ? level(ref) >= want(t) : held(['qualities'], ref)
    else if (t.type === 'METAECHO') r = held(['metamagics', 'echoes'], ref)
    else if (t.type === 'ADEPT_POWER') r = held(['adeptpowers'], ref)
    else if (t.type === 'COMPLEX_FORM') r = held(['complexforms'], ref)
    else if (t.type === 'GEAR') r = owned(ref)
    else if (t.type === 'MAGIC_RESO') r = KINDS[key(ref).replace(/ /g, '')]?.includes(b.magic) ?? undefined
    else if (t.type === 'SKILL' && !t.what) r = t.kind === 'valuereq' && t.value ? skillRank(ref) >= want(t) : skillRank(ref) > 0
    else if (t.type === 'ATTRIBUTE' && !t.what) {
      const up = ref.toUpperCase()
      let have: number | undefined
      if (up === 'ESSENCE') have = essenceBudget(b, data, c.cr).left
      else if (ATTRS[up]) {
        const k = ATTRS[up]
        have = augmentedRating(b, data, k, c.p)
        // Essence spent takes off Magic or Resonance (CRB p. 38)
        if (k === 'mag' || k === 'res')
          have = Math.max(0, have - (MAGIC_KINDS[b.magic].resonance === (k === 'res') ? essenceBudget(b, data, c.cr).magicLoss : 0))
      }
      const min = t.value ? want(t) : undefined,
        max = t.max ? Number(t.max) / (up === 'ESSENCE' ? 1000 : 1) : undefined
      if (have !== undefined && !Number.isNaN(min ?? 0) && !Number.isNaN(max ?? 0)) r = (min === undefined || have >= min) && (max === undefined || have <= max)
    }
    return r === undefined ? undefined : t.negate === 'true' ? !r : r
  }
  const words = (t: P) => {
    const ref = t.ref ?? '',
      neg = t.negate === 'true' ? 'no ' : ''
    if (t.type === 'ATTRIBUTE')
      return `${ref.toLowerCase()} ${t.max ? `at most ${ref.toUpperCase() === 'ESSENCE' ? Number(t.max) / 1000 : t.max}` : `at least ${t.value === '$RATING' ? rating : t.value}`}`
    if (t.type === 'SKILL') return `${pretty(ref)} ${t.value ? `rank ${t.value}` : 'skill'}`
    if (t.type === 'MAGIC_RESO') return `${neg}${pretty(ref)} magic type`
    return `${neg}${t.type.toLowerCase().replace('metaecho', 'metamagic or echo').replace('_', ' ')} ${pretty(ref)}`
  }
  // exclusive-state types: ungrouped tests of one are alternatives
  const groupOf = (t: P) =>
    t.group && t.group !== '0' ? t.group : t.negate !== 'true' && (t.type === 'METATYPE' || t.type === 'MAGIC_RESO') ? `~${t.type}` : '0'
  const groups = new Map<string, P[]>()
  for (const t of tests) groups.set(groupOf(t), [...(groups.get(groupOf(t)) ?? []), t])
  for (const [g, ts] of groups) {
    const got = ts.map(holds)
    ts.forEach((t, i) => got[i] === undefined && unchecked.push(words(t)))
    if (g === '0') ts.forEach((t, i) => got[i] === false && failed.push(words(t)))
    else if (got.every(r => r === false)) failed.push(ts.map(words).join(' or '))
  }
  return { failed, unchecked }
}

/** the line's missing prerequisites as a phrase (picker note), or undefined when it has none */
export const prereqNote = (item: Sr6Entry, c: PrereqCtx, rating = 1) => {
  const { failed } = characterRequirements(item, c, rating)
  return failed.length ? `needs ${failed.join('; ')}` : undefined
}
