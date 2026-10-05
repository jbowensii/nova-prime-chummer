// Build actions, the editor's mutators (a port of SR6 Forge's ChargenEngine setters and spend). Each one changes the
// build (or the runner) in place: the editor works on a copy. The character-level setters (method, letters, metatype,
// magic kind) take the runner so identity.metatype stays build.metatype; apply() takes the build and answers
// { ok: false, reason } without changing anything when the step isn't allowed. Rule numbers come from the catalog and
// the creation rules; a refusal here is only what can't be stored at all (Review's rules flag the rest).
import { newId } from '../../model/types'
import { GRADED_TYPES, type Sr6Entry } from '../model/types'
import { CONTACT_TYPES, CORE_ATTRS, type Bonus, type ContactType, type CpPool, type Letter, type MagicKind, type PickKind, type PriorityColumn, type PurchaseKind, type Sr6Attr,
  type Sr6Build, type Sr6Character, type Sr6Knowledge, type Sr6Method, type Sr6Purchase } from '../model/character'
import { num, type CreationRules } from './creation'
import { MAGIC_KINDS, picksFor, type Sr6Data } from './data'
import { makeProvider } from './providers'
import { ratingRange } from './values'

export type Op =
  | { op: 'attribute'; target: Sr6Attr; pool: 'points' | 'adjust' | 'karma'; delta: number }
  | { op: 'skill'; target: string; pool: 'points' | 'karma'; delta: number }
  | { op: 'spec'; target: string; spec: string | null }
  | { op: 'expertise'; target: string; expertise: string | null }
  /** add a quality, or set the level of one taken (leveled ones only) */
  | { op: 'quality'; id: string; level?: number } | { op: 'quality'; remove: string }
  /** add a spell, power, form…; a leveled power taken again goes up a level */
  | { op: 'pick'; kind: PickKind; id: string } | { op: 'pick'; remove: string }
  | { op: 'powerLevel'; uid: string; level: number }
  | { op: 'powerPoints'; delta: number }
  | { op: 'purchase'; kind: PurchaseKind; id?: string; rating?: number; qty?: number; grade?: string; custom?: { name: string; cost: number; avail: number; essence: number } }
  | { op: 'purchase'; remove: string }
  /** a stacking line's quantity */
  | { op: 'quantity'; uid: string; qty: number }
  | { op: 'accessory'; host: string; kind: PurchaseKind; id: string; rating?: number } | { op: 'accessory'; host: string; remove: string }
  | { op: 'wear'; uid: string; worn: boolean }
  /** a line's (or accessory's) rating or grade changed in place; grade null: none */
  | { op: 'rate'; uid: string; rating?: number; grade?: string | null }
  /** the bonuses on a purchase, accessory or pick */
  | { op: 'bonus'; uid: string; bonuses: Bonus[] }
  /** add a contact, or change one (uid) */
  | { op: 'contact'; uid?: string; name?: string; archetype?: string; connection?: number; loyalty?: number; types?: ContactType[] }
  | { op: 'contact'; remove: string }
  | { op: 'knowledge'; uid?: string; name?: string; kind?: Sr6Knowledge['kind']; native?: boolean } | { op: 'knowledge'; remove: string }
  | { op: 'knowledgeRank'; uid: string; pool: 'points' | 'karma'; delta: number }
  | { op: 'cp'; pool: CpPool; delta: number }
  /** take an adult module (a second time when the provider says again), drop one (at: its place in b.lifepath; default the
   *  last with that id), or pick where a taken one's choice goes (at: which of the two when it is taken twice) */
  | { op: 'lifemodule'; id: string; choice?: undefined } | { op: 'lifemodule'; remove: string; at?: number }
  | { op: 'lifemodule'; id: string; choice: number; pick: string; at?: number }
  /** lifepath's best attribute (null: none) and the one that takes what its maximum leaves over */
  | { op: 'bestAttr'; attr: Sr6Attr | null; extra?: Sr6Attr | null }
  | { op: 'lifestyle'; id: string | null; months?: number }
  /** add a SIN, or change one (uid) */
  | { op: 'sin'; uid?: string; name?: string; kind?: 'real' | 'fake'; rating?: number } | { op: 'sin'; remove: string }
  | { op: 'licence'; sin: string; name: string; rating: number } | { op: 'licence'; sin: string; remove: number }
  | { op: 'karmaToNuyen'; delta: number }
  | { op: 'initiation'; delta: number }
  | { op: 'submersion'; delta: number }
export type Result = { ok: true } | { ok: false; reason: string }

/** R: weapons, armor, augmentations and vehicles always get their own line (each can carry its own accessories). */
const OWN_LINE = new Set<PurchaseKind>(['weapons', 'armor', 'augmentations', 'vehicles'])
const LETTER_METHODS = new Set<Sr6Method>(['priority', 'sumtoten'])

/** Switch method. Spends that still mean something stay; point buy's character points, lifepath's modules and the
 *  priority letters go when their method is left; then reconcile. */
export function setMethod(ch: Sr6Character, method: Sr6Method, data: Sr6Data, cr: CreationRules): void {
  const b = ch.build
  if (b.method === 'pointbuy' && method !== 'pointbuy') for (const k of Object.keys(b.cp) as CpPool[]) b.cp[k] = 0
  if (b.method === 'lifepath' && method !== 'lifepath') b.lifepath = []
  if (LETTER_METHODS.has(b.method) && !LETTER_METHODS.has(method)) for (const k of Object.keys(b.priorities) as PriorityColumn[]) b.priorities[k] = null
  b.method = method
  reconcile(ch, data, cr)
}

export function setPriority(ch: Sr6Character, column: PriorityColumn, letter: Letter | null, data: Sr6Data, cr: CreationRules): void {
  ch.build.priorities[column] = letter
  reconcile(ch, data, cr)
}

/** Pick the metatype ('' for none): the old one's free traits go, the new one's resolved traits come as free qualities. */
export function setMetatype(ch: Sr6Character, id: string, data: Sr6Data): void {
  const b = ch.build, m = data.metatypes[id]
  b.metatype = id
  ch.identity.metatype = id
  b.qualities = b.qualities.filter(q => !q.free)
  for (const t of m?.traits ?? []) b.qualities.push({ uid: newId(), id: t, level: m?.traitLevels?.[t] ?? 1, free: true, name: data.qualities[t]?.name })
}

/** Pick the magic kind: picks it can't have go, as do bought power points (unless it buys them), an initiation or
 *  submersion it can't have, the aspected skill unless it's aspected, and the spends on Magic or Resonance when the
 *  kind has no such attribute (the Attributes tab no longer shows it, so they couldn't be taken back). */
export function setMagic(ch: Sr6Character, kind: MagicKind, _data: Sr6Data, _cr: CreationRules, aspectedSkill?: string): void {
  const b = ch.build, k = MAGIC_KINDS[kind], allowed = picksFor(kind)
  b.magic = kind
  if (kind === 'aspected' && aspectedSkill) b.aspectedSkill = aspectedSkill
  else if (kind !== 'aspected') delete b.aspectedSkill
  b.picks = b.picks.filter(x => allowed[x.kind])
  if (!k.paysPowers) b.powerPointsBought = 0
  if (!k.spells && !k.powers) b.initiation = 0
  if (!k.resonance) b.submersion = 0
  if (!k.spells && !k.powers) b.attributes.mag = { points: 0, adjust: 0, karma: 0 }
  if (!k.resonance) b.attributes.res = { points: 0, adjust: 0, karma: 0 }
}

/** A metatype or magic kind the method (and letters) no longer allow is cleared ('' / mundane). */
export function reconcile(ch: Sr6Character, data: Sr6Data, cr: CreationRules): void {
  const b = ch.build, p = makeProvider(b.method, data, cr)
  if (b.metatype && !p.legalMetatypes(b).some(m => m.id === b.metatype)) setMetatype(ch, '', data)
  if (!p.legalMagic(b).some(m => m.kind === b.magic)) setMagic(ch, 'mundane', data, cr)
}

const OK: Result = { ok: true }
const no = (reason: string): Result => ({ ok: false, reason })
/** a counter moved by delta, refused below zero */
function step(get: () => number, set: (v: number) => void, delta: number): Result {
  const v = get() + delta
  if (v < 0) return no('below-zero')
  set(v)
  return OK
}

/** Grades are for cyberware and bioware (a custom line may take one). */
export const gradable = (e?: Sr6Entry) => !e || GRADED_TYPES.includes(e.attrs.type ?? '')

/** Every purchase, and every accessory on one. */
const allLines = (b: Sr6Build) => b.purchases.flatMap(x => [x, ...x.accessories])

/** Apply one editor step to the build. */
export function apply(b: Sr6Build, op: Op, data: Sr6Data, cr: CreationRules): Result {
  switch (op.op) {
    case 'attribute': {
      const a = b.attributes[op.target]
      return a ? step(() => a[op.pool], v => { a[op.pool] = v }, op.delta) : no('unknown-attribute')
    }
    case 'skill': {
      let s = b.skills.find(x => x.id === op.target)
      if (!s) {
        if (!data.skills[op.target]) return no('unknown-entry')
        s = { id: op.target, points: 0, karma: 0 }
      }
      const v = s[op.pool] + op.delta
      if (v < 0) return no('below-zero')
      s[op.pool] = v
      if (!b.skills.includes(s)) b.skills.push(s)
      // no rank left: the skill goes, its spec and expertise with it
      if (!s.points && !s.karma) b.skills = b.skills.filter(x => x !== s)
      return OK
    }
    case 'spec': case 'expertise': {
      const s = b.skills.find(x => x.id === op.target)
      if (!s || s.points + s.karma < 1) return no('skill-untrained')
      const v = op.op === 'spec' ? op.spec : op.expertise
      if (v) s[op.op] = v; else delete s[op.op]
      return OK
    }
    case 'quality': {
      if ('remove' in op) {
        const q = b.qualities.find(x => x.uid === op.remove)
        if (!q) return no('not-taken')
        if (q.free) return no('free-trait')
        b.qualities = b.qualities.filter(x => x !== q)
        return OK
      }
      const v = data.qualities[op.id]
      if (!v) return no('unknown-entry')
      const taken = b.qualities.find(x => x.id === op.id && !x.free)
      if (taken && op.level === undefined) return no('already-taken')
      const level = op.level ?? 1
      if (level !== 1 && !v.perLevel) return no('no-levels')
      if (level < 1) return no('below-one')
      if (level > v.maxLevel && v.perLevel) return no('max-level')
      if (taken) taken.level = level
      else b.qualities.push({ uid: newId(), id: op.id, level, name: v.name })
      return OK
    }
    case 'pick': {
      if ('remove' in op) {
        if (!b.picks.some(x => x.uid === op.remove)) return no('not-taken')
        b.picks = b.picks.filter(x => x.uid !== op.remove)
        return OK
      }
      const e = data.entry(op.kind, op.id)
      if (!e) return no('unknown-entry')
      const power = op.kind === 'adeptpowers' ? data.powers[op.id] : undefined
      const had = b.picks.find(x => x.kind === op.kind && x.id === op.id)
      if (had) {
        // a leveled power is bought per level: taking it again raises the level
        if (!power?.perLevel) return no('duplicate')
        if ((had.level ?? 1) >= power.maxLevel) return no('max-level')
        had.level = (had.level ?? 1) + 1
        return OK
      }
      b.picks.push({ uid: newId(), kind: op.kind, id: op.id, name: e.name, ...(power?.perLevel ? { level: 1 } : {}) })
      return OK
    }
    case 'powerLevel': {
      const x = b.picks.find(p => p.uid === op.uid)
      if (!x) return no('not-taken')
      const v = x.kind === 'adeptpowers' ? data.powers[x.id] : undefined
      if (!v?.perLevel) return no('no-levels')
      if (op.level < 1) return no('below-one')
      if (op.level > v.maxLevel) return no('max-level')
      x.level = op.level
      return OK
    }
    case 'powerPoints': return step(() => b.powerPointsBought, v => { b.powerPointsBought = v }, op.delta)
    case 'purchase': {
      if ('remove' in op) {
        if (!b.purchases.some(x => x.uid === op.remove)) return no('unknown-line')
        b.purchases = b.purchases.filter(x => x.uid !== op.remove)
        return OK
      }
      const line = newLine(op, data, cr)
      if ('reason' in line) return line
      const same = !OWN_LINE.has(op.kind) && !line.grade && b.purchases.find(x => x.id && x.id === line.id && x.kind === line.kind
        && x.rating === line.rating && !x.grade && !x.accessories.length)
      if (same) same.qty += line.qty
      else b.purchases.push(line)
      return OK
    }
    case 'quantity': {
      const x = b.purchases.find(p => p.uid === op.uid)
      if (!x) return no('unknown-line')
      if (OWN_LINE.has(x.kind)) return no('own-line')
      if (op.qty < 1) return no('below-one')
      x.qty = op.qty
      return OK
    }
    case 'accessory': {
      const host = b.purchases.find(x => x.uid === op.host)
      if (!host) return no('unknown-host')
      if ('remove' in op) {
        if (!host.accessories.some(a => a.uid === op.remove)) return no('not-fitted')
        host.accessories = host.accessories.filter(a => a.uid !== op.remove)
        return OK
      }
      // R: no mount data, so any accessory fits (the picker offers the accessory categories)
      const line = newLine({ kind: op.kind, id: op.id, rating: op.rating }, data, cr)
      if ('reason' in line) return line
      host.accessories.push(line)
      return OK
    }
    case 'wear': {
      const x = b.purchases.find(p => p.uid === op.uid)
      if (!x) return no('unknown-line')
      if (op.worn) x.worn = true; else delete x.worn
      return OK
    }
    case 'rate': {
      const x = allLines(b).find(p => p.uid === op.uid)
      if (!x) return no('unknown-line')
      if (op.rating !== undefined) {
        const e = x.id ? data.entry(x.kind, x.id) : undefined
        if (!e || !ratingRange(e.attrs.rating).includes(op.rating)) return no('rating-range')
      }
      if (op.grade && num(cr, `grade:${op.grade}:essence`) === undefined) return no('unknown-grade')
      if (op.grade && !gradable(x.id ? data.entry(x.kind, x.id) : undefined)) return no('no-grade')
      if (op.rating !== undefined) x.rating = op.rating
      if (op.grade) x.grade = op.grade; else if (op.grade === null) delete x.grade
      return OK
    }
    case 'bonus': {
      const x: { bonuses?: Bonus[] } | undefined = allLines(b).find(p => p.uid === op.uid) ?? b.picks.find(p => p.uid === op.uid)
      if (!x) return no('unknown-line')
      if (op.bonuses.length) x.bonuses = op.bonuses; else delete x.bonuses
      return OK
    }
    case 'contact': {
      if ('remove' in op) return removeBy(b.contacts, op.remove, l => { b.contacts = l })
      const { op: _, uid, ...patch } = op
      if ((patch.connection ?? 1) < 1 || (patch.loyalty ?? 1) < 1) return no('below-one')
      if (patch.types) {
        // one or two types, each once (a contact gains its second from a module of another type)
        const types = [...new Set(patch.types)]
        if (types.length > 2 || types.some(t => !CONTACT_TYPES.includes(t))) return no('bad-types')
        if (types.length) patch.types = types; else delete patch.types
        if (!types.length && uid) delete b.contacts.find(x => x.uid === uid)?.types
      }
      if (!uid) { b.contacts.push({ uid: newId(), name: '', archetype: '', connection: 1, loyalty: 1, ...patch }); return OK }
      const c = b.contacts.find(x => x.uid === uid)
      if (!c) return no('unknown-line')
      Object.assign(c, patch)
      return OK
    }
    case 'knowledge': {
      if ('remove' in op) return removeBy(b.knowledge, op.remove, l => { b.knowledge = l })
      if (!op.uid) {
        // a native language is free; anything else starts with one point
        b.knowledge.push({ uid: newId(), name: op.name ?? '', kind: op.kind ?? 'knowledge', ...(op.native ? { native: true as const, points: 0 } : { points: 1 }), karma: 0 })
        return OK
      }
      const k = b.knowledge.find(x => x.uid === op.uid)
      if (!k) return no('unknown-line')
      if (op.name !== undefined) k.name = op.name
      if (op.kind) k.kind = op.kind
      if (op.native) { k.native = true; k.points = 0 } else if (op.native === false) delete k.native
      return OK
    }
    case 'knowledgeRank': {
      const k = b.knowledge.find(x => x.uid === op.uid)
      if (!k) return no('unknown-line')
      if (k.native) return no('native')
      return step(() => k[op.pool], v => { k[op.pool] = v }, op.delta)
    }
    case 'cp':
      if (b.method !== 'pointbuy') return no('not-point-buy')
      return step(() => b.cp[op.pool], v => { b.cp[op.pool] = v }, op.delta)
    case 'lifemodule': {
      if (b.method !== 'lifepath') return no('not-lifepath')
      if ('remove' in op) {
        const i = op.at ?? b.lifepath.map(m => m.id).lastIndexOf(op.remove)
        if (b.lifepath[i]?.id !== op.remove) return no('not-taken')
        b.lifepath.splice(i, 1)
        return OK
      }
      if (op.choice !== undefined) {
        const pk = op.at !== undefined ? (b.lifepath[op.at]?.id === op.id ? b.lifepath[op.at] : undefined) : b.lifepath.find(m => m.id === op.id)
        const c = data.lifemodules[op.id]?.choices[op.choice]
        if (!pk) return no('not-taken')
        if (!c) return no('unknown-choice')
        if (!c.options.includes(op.pick)) return no('unknown-option')
        pk.choices[op.choice] = op.pick
        return OK
      }
      const avail = (makeProvider(b.method, data, cr).available?.(b) ?? []).find(m => m.id === op.id)
      if (!avail) return no('not-available')
      if (avail.taken && !avail.again) return no('already-taken')
      const cap = num(cr, 'lifepath.moduleCount')
      if (cap !== undefined && b.lifepath.length >= cap) return no('module-count')
      b.lifepath.push({ id: op.id, choices: {} })
      return OK
    }
    case 'bestAttr': {
      if (b.method !== 'lifepath') return no('not-lifepath')
      const special = (a?: Sr6Attr | null) => !!a && !CORE_ATTRS.includes(a)
      if (special(op.attr) || special(op.extra)) return no('not-core')  // never Edge, Magic or Resonance
      if (op.attr) b.bestAttr = op.attr; else { delete b.bestAttr; delete b.bestExtra }
      if (op.extra !== undefined) { if (op.extra && op.attr) b.bestExtra = op.extra; else delete b.bestExtra }
      return OK
    }
    case 'lifestyle': {
      if (op.id === null) { delete b.lifestyle; return OK }
      if (!data.entry('lifestyles', op.id)) return no('unknown-entry')
      const months = op.months ?? 1
      if (months < 1) return no('below-one')
      b.lifestyle = { id: op.id, months }
      return OK
    }
    case 'sin': {
      if ('remove' in op) return removeBy(b.sins, op.remove, l => { b.sins = l })
      if (op.rating !== undefined && op.rating < 1) return no('below-one')
      if (!op.uid) {
        const kind = op.kind ?? 'fake'
        b.sins.push({ uid: newId(), name: op.name ?? '', kind, ...(kind === 'fake' ? { rating: op.rating ?? 1 } : {}), licences: [] })
        return OK
      }
      const s = b.sins.find(x => x.uid === op.uid)
      if (!s) return no('unknown-line')
      if (op.rating !== undefined && s.kind === 'fake') {
        if (s.licences.some(l => l.rating > op.rating!)) return no('licence-above-sin')
        s.rating = op.rating
      }
      if (op.name !== undefined) s.name = op.name
      return OK
    }
    case 'licence': {
      const s = b.sins.find(x => x.uid === op.sin)
      if (!s) return no('unknown-line')
      if ('remove' in op) {
        if (!s.licences[op.remove]) return no('unknown-line')
        s.licences.splice(op.remove, 1)
        return OK
      }
      if (op.rating < 1) return no('below-one')
      // a licence can't out-rate the fake SIN it's on
      if (s.kind === 'fake' && op.rating > (s.rating ?? 1)) return no('licence-above-sin')
      s.licences.push({ name: op.name, rating: op.rating })
      return OK
    }
    case 'karmaToNuyen': {
      const v = b.karmaToNuyen + op.delta, max = num(cr, 'karmaToNuyenMax')
      if (v < 0) return no('below-zero')
      if (max !== undefined && v > max) return no('conversion-cap')
      b.karmaToNuyen = v
      return OK
    }
    case 'initiation': case 'submersion': {
      const k = MAGIC_KINDS[b.magic], v = b[op.op] + op.delta
      if (v < 0) return no('below-zero')
      if (op.op === 'initiation' ? !k.spells && !k.powers : !k.resonance) return no(op.op === 'initiation' ? 'not-awakened' : 'not-emerged')
      b[op.op] = v
      return OK
    }
  }
}

function removeBy<T extends { uid: string }>(list: T[], uid: string, set: (l: T[]) => void): Result {
  if (!list.some(x => x.uid === uid)) return no('unknown-line')
  set(list.filter(x => x.uid !== uid))
  return OK
}

/** A new purchase line from the catalog (or the player's custom numbers), checked: entry known, rating in its range,
 *  a grade whose Essence factor is set, a quantity of at least 1. */
function newLine(op: { kind: PurchaseKind; id?: string; rating?: number; qty?: number; grade?: string; custom?: { name: string; cost: number; avail: number; essence: number } },
  data: Sr6Data, cr: CreationRules): Sr6Purchase | { ok: false; reason: string } {
  const qty = op.qty ?? 1
  if (qty < 1) return { ok: false, reason: 'below-one' }
  if (op.grade && num(cr, `grade:${op.grade}:essence`) === undefined) return { ok: false, reason: 'unknown-grade' }
  const base = { uid: newId(), kind: op.kind, qty, accessories: [], ...(op.grade ? { grade: op.grade } : {}) }
  if (!op.id) {
    const c = op.custom ?? { name: '', cost: 0, avail: 0, essence: 0 }
    return { ...base, name: c.name, cost: c.cost, avail: c.avail, essence: c.essence }
  }
  const e = data.entry(op.kind, op.id)
  if (!e) return { ok: false, reason: 'unknown-entry' }
  const range = ratingRange(e.attrs.rating)
  if (op.rating !== undefined && range.length && !range.includes(op.rating)) return { ok: false, reason: 'rating-range' }
  if (op.grade && !gradable(e)) return { ok: false, reason: 'no-grade' }
  return { ...base, id: op.id, name: e.name, ...(op.rating !== undefined ? { rating: op.rating } : {}) }
}
