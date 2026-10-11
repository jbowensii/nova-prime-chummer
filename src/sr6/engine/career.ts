// Career play (S3): a TypeScript port of SR6 Forge's advancement engine (advancement-engine.mjs preview) and its
// append-only ledger (services/ledger.mjs). ch.build stays as finalized; the runner as it stands is that build with every
// live advance since the last Finalize replayed on it, so undo is a void entry that replay skips (only the newest live
// advance may be voided, so no later entry ever sits on something gone). Every price, cap and rate is a creation setting
// (the Karma prices group doubles as the career prices, plus the Advancement group); an unset price refuses its spend
// naming the setting (`unset:<key>`), an unset cap is no cap. No book numbers. A prerequisite the runner lacks never
// refuses a spend (owner, 2026-10-09): it is recorded, and Review's error stands until a GM approves it.
import { newId, type Violation } from '../../model/types'
import { sinName, type PickKind, type Sr6Advance, type Sr6Build, type Sr6Character, type Sr6LedgerEntry } from '../model/character'
import { aptitudeSkills, attrMax, manySpecs, powerCost, attrRating, magicLoss, priced, qualityCost, sinCost, skillRank } from './budgets'
import { flag, num, type CreationRules } from './creation'
import { MAGIC_KINDS, pickMaxLevel, type Sr6Data } from './data'
import { gradeProblem } from './grades'
import { makeProvider, type Provider } from './providers'
import { validateSr6 } from './rules'
import { bookValue, dataFind, ratingRange } from './values'
import { entryLabel } from './categories'
import { isSignature, learned } from './martial'

export type Preview = { ok: true; label: string; karma: number; nuyen: number } | { ok: false; reason: string }
/** Contact and Other: the amounts and label the player types. */
export interface Typed { karma?: number; nuyen?: number; label?: string }
export interface LedgerRow { e: Sr6LedgerEntry; karma: number; nuyen: number; voided: boolean; reason?: string }

/** The entries after the last Finalize (all of them for a runner finalized before S3). */
export function sinceFinalize(ch: Sr6Character): Sr6LedgerEntry[] {
  const i = ch.ledger.map(e => e.type).lastIndexOf('finalize')
  return ch.ledger.slice(i + 1)
}
export const voidedIds = (ch: Sr6Character) => new Set(ch.ledger.flatMap(e => (e.type === 'void' ? [e.eventId] : [])))
export function liveAdvances(ch: Sr6Character): Extract<Sr6LedgerEntry, { type: 'advance' }>[] {
  const voided = voidedIds(ch)
  return sinceFinalize(ch).filter((e): e is Extract<Sr6LedgerEntry, { type: 'advance' }> => e.type === 'advance' && !voided.has(e.id))
}

/** One advance onto the build, in place. Structural only (no catalog lookups), so it replays whatever the catalog holds. */
export function applyAdvance(b: Sr6Build, a: Sr6Advance): void {
  switch (a.op) {
    case 'attribute': b.attributes[a.target].karma += 1; return
    case 'skill': {
      const s = b.skills.find(x => x.id === a.target)
      if (s) s.karma += 1; else b.skills.push({ id: a.target, points: 0, karma: 1 })
      return
    }
    case 'spec': case 'expertise': {
      const s = b.skills.find(x => x.id === a.target)
      if (s && a.op === 'spec' && s.spec && s.spec !== a.name) s.specs = [...s.specs ?? [], a.name]
      else if (s) s[a.op] = a.name; else b.skills.push({ id: a.target, points: 0, karma: 0, [a.op]: a.name })
      return
    }
    case 'knowledge': b.knowledge.push(structuredClone(a.line)); return
    case 'quality': {
      const had = b.qualities.find(q => q.id === a.line.id && !q.free)
      if (had) had.level += a.line.level; else b.qualities.push(structuredClone(a.line))
      return
    }
    case 'buyoff': b.qualities = b.qualities.filter(q => q.uid !== a.target); return
    case 'pick': {
      // a leveled power taken again goes up a level
      const had = b.picks.find(x => x.kind === a.line.kind && x.id === a.line.id)
      if (had?.level !== undefined) had.level += 1; else if (!had) b.picks.push(structuredClone(a.line))
      return
    }
    case 'martialart': b.martialArts.push(structuredClone(a.line)); return
    case 'technique': b.martialArts.find(m => m.uid === a.target)?.techniques.push(structuredClone(a.line)); return
    case 'powerpoint': b.powerPointsBought += 1; return
    case 'initiate': {
      if (MAGIC_KINDS[b.magic].resonance) b.submersion += 1; else b.initiation += 1
      // a metamagic taken again goes up a level
      const had = a.line && b.picks.find(x => x.kind === a.line!.kind && x.id === a.line!.id)
      if (had) had.level = (had.level ?? 1) + 1; else if (a.line) b.picks.push(structuredClone(a.line))
      return
    }
    case 'purchase': b.purchases.push(structuredClone(a.line)); return
    case 'drop': b.purchases = b.purchases.filter(x => x.uid !== a.target); return
    case 'contact': {
      const i = b.contacts.findIndex(x => x.uid === a.line.uid)
      if (i >= 0) b.contacts[i] = structuredClone(a.line); else b.contacts.push(structuredClone(a.line))
      return
    }
    case 'sin': {
      // a placeholder named (line.uid its uid) keeps its lifestyles
      const i = b.sins.findIndex(x => x.uid === a.line.uid), line = structuredClone(a.line), had = b.sins[i]?.lifestyles
      if (i >= 0) b.sins[i] = had ? { ...line, lifestyles: had } : line; else b.sins.push(line)
      return
    }
    case 'lifestyle': {
      // more months of a lifestyle the SIN has add to it, another is added; an entry from before lifestyles belonged to
      // SINs (no sin) is the first SIN's one lifestyle: more months of it, or another replacing it
      const sin = a.sin ? b.sins.find(s => s.uid === a.sin) : b.sins[0]
      if (!sin) return  // charxml.ts gives an older runner with a lifestyle a SIN
      const ls = sin.lifestyles ??= [], had = a.sin ? ls.find(l => l.id === a.id) : ls[0]
      if (had?.id === a.id) had.months += a.months
      else if (had) Object.assign(had, { id: a.id, months: a.months })
      else ls.push({ uid: a.uid ?? `${sin.uid}-${a.id}`, id: a.id, months: a.months })
      return
    }
    case 'convert': case 'other': return
  }
}

/** The runner as it stands: a draft's build, or a clone of the finalized build with the live advances replayed in order. */
export function currentBuild(ch: Sr6Character): Sr6Build {
  if (!ch.finalizedAt) return ch.build
  const b = structuredClone(ch.build)
  for (const e of liveAdvances(ch)) applyAdvance(b, e.advance)
  return b
}

/** Every entry with the karma and nuyen after it: a finalize sets both, an earning adds, an advance takes its amounts off;
 *  voided entries and voids leave them. Without any finalize entry (a runner finalized before S3) they start at `final`. */
export function ledgerRows(ch: Sr6Character): LedgerRow[] {
  const voids = new Map(ch.ledger.flatMap(e => (e.type === 'void' ? [[e.eventId, e.reason] as const] : [])))
  let karma = 0, nuyen = 0
  if (!ch.ledger.some(e => e.type === 'finalize')) ({ karma, nuyen } = ch.final ?? { karma: 0, nuyen: 0 })
  return ch.ledger.map(e => {
    const voided = voids.has(e.id)
    if (!voided) {
      if (e.type === 'finalize') { karma = e.karma; nuyen = e.nuyen }
      else if (e.type === 'earn') { karma += e.karma; nuyen += e.nuyen }
      else if (e.type === 'advance') { karma -= e.karma; nuyen -= e.nuyen }
    }
    return { e, karma, nuyen, voided, ...(voided ? { reason: voids.get(e.id) } : {}) }
  })
}
/** An entry as the ledger shows it (and the SR6 export writes it). */
export const ledgerLabel = (e: Sr6LedgerEntry) => e.type === 'finalize' ? 'Creation finished' : e.type === 'earn' ? `Earned: ${e.run} (${e.date})`
  : e.type === 'advance' ? e.label : e.type === 'note' ? e.text : `Voided: ${e.reason}`
export function balances(ch: Sr6Character): { karma: number; nuyen: number } {
  const last = ledgerRows(ch).at(-1)
  return last ? { karma: last.karma, nuyen: last.nuyen } : ch.final ?? { karma: 0, nuyen: 0 }
}

/** Adept power points after creation: an adept's are its Magic (a point per point of Magic, CRB p. 156), a mystic
 *  adept's the ones bought (the core rulebook prints no price after creation: advance.powerPoint); less the powers taken. */
export function careerPowerPoints(b: Sr6Build, data: Sr6Data, cr: CreationRules, p: Provider): { max: number; spent: number; left: number } {
  const k = MAGIC_KINDS[b.magic]
  // (Magic as Essence leaves it, as at creation: budgets.ts powerPoints)
  // (the Sixth World Companion's Alternate Mystic Adept, p. 148: half a point for each point of Magic raised)
  const alt = k.paysPowers && !!flag(cr, 'alternateMysticAdept')
  const max = !k.powers ? 0 : alt ? (b.powerPointsBought + Math.max(0, attrRating(b, 'mag', p) - p.magicRating(b))) / 2
    : k.paysPowers ? b.powerPointsBought : Math.max(0, attrRating(b, 'mag', p) - magicLoss(b, data, cr))
  const spent = b.picks.filter(x => x.kind === 'adeptpowers').reduce((t, x) => t + powerCost(data, x), 0)
  return { max, spent, left: Math.round((max - spent) * 100) / 100 }
}

const PICK_LABEL: Partial<Record<PickKind, string>> = { spells: 'Spell', rituals: 'Ritual', complexforms: 'Complex form', adeptpowers: 'Adept power' }
const fmt = (x: number) => x.toLocaleString('en-US')
class Refused { reason: string; constructor(reason: string) { this.reason = reason } }
const no = (reason: string): never => { throw new Refused(reason) }

/** What a spend would cost (karma, nuyen; negative is gained) and its label, priced on the current build, or why not. */
export function preview(ch: Sr6Character, a: Sr6Advance, data: Sr6Data, cr: CreationRules, typed: Typed = {}): Preview {
  if (!ch.finalizedAt) return { ok: false, reason: 'not-finalized' }
  try {
    const { label, karma = 0, nuyen = 0 } = price(currentBuild(ch), a, data, cr, typed)
    if (!Number.isFinite(karma) || !Number.isFinite(nuyen)) return { ok: false, reason: 'not-a-number' }
    const bal = balances(ch)
    if (karma > 0 && bal.karma - karma < 0) return { ok: false, reason: 'not-enough-karma' }
    if (nuyen > 0 && bal.nuyen - nuyen < 0) return { ok: false, reason: 'not-enough-nuyen' }
    return { ok: true, label, karma, nuyen }
  } catch (e) {
    if (e instanceof Refused) return { ok: false, reason: e.reason }
    throw e
  }
}

function price(b: Sr6Build, a: Sr6Advance, data: Sr6Data, cr: CreationRules, typed: Typed): { label: string; karma?: number; nuyen?: number } {
  const p = makeProvider(b.method, data, cr), k = MAGIC_KINDS[b.magic]
  const need = (key: string) => num(cr, key) ?? no(`unset:${key}`)
  const skillName = (id: string) => data.skills[id]?.name ?? id
  switch (a.op) {
    case 'attribute': {
      const t = a.target
      if ((t === 'mag' && !k.spells && !k.powers) || (t === 'res' && !k.resonance)) no('unknown-attribute')
      const cur = attrRating(b, t, p)
      // CRB pp. 167, 195: Magic or Resonance tops out at magicMax plus the initiation (submersion) grade
      const cap = t === 'mag' ? need('magicMax') + b.initiation : t === 'res' ? need('magicMax') + b.submersion
        : attrMax(data, cr, b, t)
      if (cap !== undefined && cur >= cap) no('at-maximum')
      return { label: `${t.toUpperCase()} ${cur} → ${cur + 1}`, karma: (cur + 1) * need('karmaAttrPerRank') }
    }
    case 'skill': {
      const s = b.skills.find(x => x.id === a.target)
      if (!s && !data.skills[a.target]) no('unknown-entry')
      // (the Sixth World Companion's Unrestricted Skill Ranks, p. 153: no cap after creation)
      const cur = s ? skillRank(s) : 0, cap = flag(cr, 'unrestrictedSkillRanks') ? undefined : num(cr, 'advance.skillMax')
      // CRB Hong Kong p. 70: the aptitude quality lets the selected skill go as far above the cap as it does at creation
      // (10 instead of 9); one whose note names no skill, any one skill
      const up = (num(cr, 'skillCapAptitude') ?? 0) - (num(cr, 'skillCap') ?? 0), named = aptitudeSkills(data, cr, b)
      const aptitude = !!named && up > 0 && (named.length ? named.includes(a.target)
        : !b.skills.some(x => x.id !== a.target && skillRank(x) > cap!))
      if (cap !== undefined && cur >= cap + (aptitude ? up : 0)) no('at-maximum')
      return { label: `${skillName(a.target)} ${cur} → ${cur + 1}`, karma: (cur + 1) * need('karmaSkillPerRank') }
    }
    case 'spec': case 'expertise': {
      // on a skill without a rank, an expertise without a specialization or below advance.expertiseRank: recorded (Review's
      // skill.specUntrained, skill.expertiseSpec, skill.expertiseRank)
      const s = b.skills.find(x => x.id === a.target)
      if (!s && !data.skills[a.target]) no('unknown-entry')
      // (a further specialization: Exotic Weapons', CRB Hong Kong p. 95, or any with Expanded Specializations, SWC p. 153)
      if (s?.[a.op] && !(a.op === 'spec' && manySpecs(data, cr, a.target))) no('already-known')
      if (!a.name.trim()) no('needs-name')
      return a.op === 'spec' ? { label: `${skillName(a.target)}: ${a.name}`, karma: need('karmaSpec') }
        : { label: `${skillName(a.target)} expertise: ${a.name}`, karma: need('advance.expertise') }
    }
    case 'knowledge':
      if (!a.line.name.trim()) no('needs-name')
      return { label: `${a.line.kind === 'language' ? 'Language' : 'Knowledge'}: ${a.line.name}`, karma: need('karmaKnowledge') }
    case 'quality': {
      const v = data.qualities[a.line.id] ?? no('unknown-entry')
      if (!v.positive) no('not-positive')
      if (v.karma === null) no('book-value')
      const had = b.qualities.find(q => q.id === a.line.id && !q.free)
      if (had && !v.perLevel) no('already-known')
      if (!(a.line.level >= 1)) no('below-one')
      if ((had?.level ?? 0) + a.line.level > (v.perLevel ? v.maxLevel : 1)) no('at-maximum')
      const label = `Quality: ${v.name}${v.perLevel ? ` ${(had?.level ?? 0) + a.line.level}` : ''}`
      return { label, karma: qualityCost(a.line, v) * need('advance.qualityFactor') }
    }
    case 'buyoff': {
      const q = b.qualities.find(x => x.uid === a.target) ?? no('not-taken')
      if (q.free) no('free-trait')
      const v = data.qualities[q.id] ?? no('unknown-entry')
      if (v.positive) no('not-negative')
      if (v.karma === null) no('book-value')
      return { label: `Buy off: ${v.name}`, karma: qualityCost(q, v) * need('advance.buyOffFactor') }
    }
    case 'pick': {
      const { kind, id } = a.line
      // (one the runner's magic kind can't learn is recorded: Review's magic.spellsAllowed; an adept power needs power points)
      if (!PICK_LABEL[kind]) no('cannot-learn')
      const e = data.entry(kind, id) ?? no('unknown-entry')
      const had = b.picks.find(x => x.kind === kind && x.id === id)
      if (kind !== 'adeptpowers') {
        if (had) no('already-known')
        return { label: `${PICK_LABEL[kind]}: ${e.name}`, karma: need(kind === 'complexforms' ? 'karmaForm' : 'karmaSpell') }
      }
      const v = data.powers[id]
      if (had && !v?.perLevel) no('already-known')
      if (had && (had.level ?? 1) >= (v?.maxLevel ?? 1)) no('at-maximum')
      if (v?.cost == null) no('book-value')
      if (careerPowerPoints(b, data, cr, p).left < v!.cost!) no('no-power-points')
      return { label: `Adept power: ${e.name}${v!.perLevel ? ` ${had ? (had.level ?? 1) + 1 : 1}` : ''}`, karma: 0 }
    }
    case 'martialart': {
      // FS p. 97: a style comes with its signature technique, free; its other techniques are bought one by one
      const e = data.entry('martialarts', a.line.id) ?? no('unknown-entry')
      if (b.martialArts.some(m => m.id === e.id)) no('already-known')
      for (const t of a.line.techniques) {
        const te = data.entry('martialtechniques', t.id) ?? no('unknown-entry')
        if (!isSignature(e, te.name)) no('not-signature')
        if (learned(b).some(x => x.id === te.id)) no('already-known')
      }
      const sig = a.line.techniques.length ? ` with ${data.entry('martialtechniques', a.line.techniques[0].id)!.name}` : ''
      return { label: `Martial art: ${e.name}${sig}`, karma: need('karmaMartialArt') }
    }
    case 'technique': {
      const m = b.martialArts.find(x => x.uid === a.target) ?? no('not-taken'), style = data.entry('martialarts', m.id)
      const e = data.entry('martialtechniques', a.line.id) ?? no('unknown-entry')
      if (learned(b).some(x => x.id === e.id)) no('already-known')
      // (one the style doesn't teach is recorded: Review's martial.category)
      const karma = isSignature(style, e.name) ? 0 : need('karmaTechnique')
      return { label: `Technique: ${e.name} (${style?.name ?? m.name ?? m.id})`, karma }
    }
    case 'powerpoint':
      if (!k.paysPowers) no('cannot-learn')
      if (b.powerPointsBought >= attrRating(b, 'mag', p)) no('at-maximum')
      return { label: 'Power point', karma: need('advance.powerPoint') }
    case 'initiate': {
      const field = k.resonance ? 'submersion' : k.spells || k.powers ? 'initiation' : no('mundane-cannot-initiate')
      let what = ''
      if (a.line) {
        if (a.line.kind !== (k.resonance ? 'echoes' : 'metamagics')) no('cannot-learn')
        const e = data.entry(a.line.kind, a.line.id) ?? no('unknown-entry')
        // (an adept's metamagic on a magician, or a magician's on an adept, is recorded: Review's magic.metamagicUser)
        // one taken again (its text says it can be) is one more level, each with its own initiation
        const had = b.picks.find(x => x.kind === a.line!.kind && x.id === a.line!.id), max = pickMaxLevel(data, a.line.kind, a.line.id)
        if (had && max === null) no('already-known')
        if (had && (had.level ?? 1) >= max!) no('at-maximum')
        what = ` (${e.name}${had ? ` ${(had.level ?? 1) + 1}` : ''})`
      }
      const next = b[field] + 1
      // CRB pp. 167, 195: the grade never exceeds Magic (Resonance)
      if (next > attrRating(b, field === 'submersion' ? 'res' : 'mag', p)) no('at-maximum')
      return { label: `${field === 'submersion' ? 'Submersion' : 'Initiation'} grade ${next}${what}`,
        karma: need('karmaInitiationBase') + next * need('karmaInitiationPerGrade') }
    }
    case 'purchase': {
      const x = a.line
      if (!(x.qty >= 1)) no('below-one')
      const e = x.id ? data.entry(x.kind, x.id) ?? no('unknown-entry') : undefined
      const range = ratingRange(e?.attrs.rating)
      if (x.rating !== undefined && range.length && !range.includes(x.rating)) no('rating-range')
      // (a grade the augmentation's type doesn't take is recorded: Review's gear.grade)
      const gp = x.grade ? gradeProblem(cr, data, x.grade, e) : null
      if (gp) no(gp)
      // R: a cost the app can't read isn't guessed; the GM can buy it as a custom line
      const pr = priced(x, data, cr)
      if (!pr.ok) no('book-value')
      return { label: `${e ? entryLabel(e) : x.name ?? 'Custom item'}${x.rating ? ` (rating ${x.rating})` : ''}${x.qty > 1 ? ` × ${x.qty}` : ''}`, nuyen: pr.cost }
    }
    case 'drop': {
      // R: no refund; an earning records a sale
      const x = b.purchases.find(y => y.uid === a.target) ?? no('unknown-line')
      return { label: `Dropped: ${(x.id && (e => e && entryLabel(e))(data.entry(x.kind, x.id))) || x.name || 'Custom item'}` }
    }
    case 'contact':
      if (!(a.line.connection >= 1 && a.line.loyalty >= 1)) no('below-one')
      return { label: typed.label?.trim() || `Contact: ${a.line.name || 'unnamed'}`, karma: typed.karma, nuyen: typed.nuyen }
    case 'sin': {
      // priced as creation prices it (budgets.ts sinCost), with the settings it needs set
      const x = a.line
      if (x.uid && !b.sins.find(s => s.uid === x.uid)?.placeholder) no('unknown-line')
      if (!x.name.trim()) no('needs-name')
      if (x.kind === 'fake' && !((x.rating ?? 1) >= 1)) no('below-one')
      if (x.licences.some(l => !l.name.trim())) no('needs-name')
      if (x.licences.some(l => !(l.rating >= 1))) no('below-one')
      if (x.kind === 'fake' && x.licences.some(l => l.rating > (x.rating ?? 1))) no('licence-above-sin')
      const what = [x.kind === 'real' ? 'real' : `fake, rating ${x.rating ?? 1}`, ...x.licences.map(l => `${l.name} ${l.rating}`)].join(', ')
      return { label: `SIN: ${x.name.trim()} (${what})${x.uid ? ', was the unnamed SIN' : ''}`, nuyen: sinCost(x, need) }
    }
    case 'lifestyle': {
      const sin = a.sin ? b.sins.find(s => s.uid === a.sin) ?? no('unknown-line') : undefined
      const e = data.entry('lifestyles', a.id) ?? no('unknown-entry')
      if (!(a.months >= 1)) no('below-one')
      const v = bookValue(e, 'cost', undefined, dataFind(data))
      if (!v.ok || v.n === null) no('book-value')
      return { label: `Lifestyle: ${e.name} × ${a.months} month${a.months === 1 ? '' : 's'}${sin ? ` (${sinName(sin)})` : ''}`, nuyen: v.n! * a.months }
    }
    case 'convert': {
      if (!Number.isInteger(a.karma) || a.karma === 0) no('below-one')
      // the Sixth World Companion's Working for the Man and for the People (p. 153): optional, each its own switch
      if (a.karma > 0) {
        if (!flag(cr, 'workingForTheMan')) no('optional-rule-off')
        const n = a.karma * need('advance.karmaToNuyenRate'); return { label: `${a.karma} karma to ${fmt(n)}¥`, karma: a.karma, nuyen: -n }
      }
      if (!flag(cr, 'workingForThePeople')) no('optional-rule-off')
      const rate = num(cr, 'advance.nuyenToKarmaRate') ?? no('optional-rule-off'), n = -a.karma * rate
      return { label: `${fmt(n)}¥ to ${-a.karma} karma`, karma: a.karma, nuyen: n }
    }
    case 'other': return { label: typed.label?.trim() || 'Other', karma: typed.karma, nuyen: typed.nuyen }
  }
}

/** The runner with the spend appended (new lines get their uid and catalog name here; a buy off or drop keeps the line it
 *  removes, for the history), or why not. */
export function record(ch: Sr6Character, a: Sr6Advance, data: Sr6Data, cr: CreationRules, typed?: Typed, now = new Date().toISOString()):
  { ok: true; ch: Sr6Character } | { ok: false; reason: string } {
  const pv = preview(ch, a, data, cr, typed)
  if (!pv.ok) return pv
  const b = currentBuild(ch), adv = structuredClone(a)
  const named = <T extends { uid: string; name?: string }>(line: T, name?: string): T => ({ ...line, uid: line.uid || newId(), ...(name && !line.name ? { name } : {}) })
  switch (adv.op) {
    case 'knowledge': adv.line = { ...named(adv.line), points: 0, karma: 1 }; break
    case 'quality': adv.line = named(adv.line, data.qualities[adv.line.id]?.name); break
    case 'pick': adv.line = named({ ...adv.line, ...(data.powers[adv.line.id]?.perLevel && adv.line.kind === 'adeptpowers' ? { level: 1 } : {}) },
      data.entry(adv.line.kind, adv.line.id)?.name); break
    case 'martialart': adv.line = { ...named(adv.line, data.entry('martialarts', adv.line.id)?.name),
      techniques: adv.line.techniques.map(t => named(t, data.entry('martialtechniques', t.id)?.name)) }; break
    case 'technique': adv.line = named(adv.line, data.entry('martialtechniques', adv.line.id)?.name); break
    case 'initiate': if (adv.line) adv.line = named({ ...adv.line, ...(pickMaxLevel(data, adv.line.kind, adv.line.id) !== null ? { level: 1 } : {}) },
      data.entry(adv.line.kind, adv.line.id)?.name); break
    case 'purchase': adv.line = named(adv.line, adv.line.id ? data.entry(adv.line.kind, adv.line.id)?.name : undefined); break
    case 'contact': adv.line = named(adv.line); break
    case 'buyoff': adv.line = b.qualities.find(q => q.uid === adv.target); break
    case 'drop': adv.line = b.purchases.find(x => x.uid === adv.target); break
    case 'sin': {
      // stored as it'll stand: no lifestyles (a placeholder's stay on it) nor placeholder flag; a fake SIN's rating set
      const { uid, name, kind, rating, gender, licences } = adv.line
      adv.line = { uid: uid || newId(), name: name.trim(), kind, ...(kind === 'fake' ? { rating: rating ?? 1 } : {}), ...(gender?.trim() ? { gender } : {}), licences }
      break
    }
    case 'lifestyle': if (adv.sin && !adv.uid) adv.uid = newId(); break
  }
  const entry: Sr6LedgerEntry = { id: newId(), at: now, type: 'advance', advance: adv, label: pv.label, karma: pv.karma, nuyen: pv.nuyen }
  return { ok: true, ch: { ...ch, ledger: [...ch.ledger, entry] } }
}

export const earn = (ch: Sr6Character, karma: number, nuyen: number, run: string, date: string, now = new Date().toISOString()): Sr6Character =>
  ({ ...ch, ledger: [...ch.ledger, { id: newId(), at: now, type: 'earn', karma, nuyen, run, date }] })
export const note = (ch: Sr6Character, text: string, now = new Date().toISOString()): Sr6Character =>
  ({ ...ch, ledger: [...ch.ledger, { id: newId(), at: now, type: 'note', text }] })

/** Void an entry since the last Finalize: an earning or note any time, an advance only when it's the newest live one. */
export function voidEntry(ch: Sr6Character, id: string, reason: string, now = new Date().toISOString()):
  { ok: true; ch: Sr6Character } | { ok: false; reason: string } {
  const e = sinceFinalize(ch).find(x => x.id === id)
  if (!e || e.type === 'void' || e.type === 'finalize') return { ok: false, reason: 'not-voidable' }
  if (voidedIds(ch).has(id)) return { ok: false, reason: 'already-voided' }
  if (e.type === 'advance' && liveAdvances(ch).at(-1)?.id !== id) return { ok: false, reason: 'not-latest' }
  return { ok: true, ch: { ...ch, ledger: [...ch.ledger, { id: newId(), at: now, type: 'void', eventId: id, reason }] } }
}

/** The ids voidEntry would allow, worked out once for the whole history (the Ledger tab's Void buttons: calling voidEntry
 *  per row is quadratic in the ledger's length). */
export function voidableIds(ch: Sr6Character): Set<string> {
  const voided = voidedIds(ch), newest = liveAdvances(ch).at(-1)?.id
  return new Set(sinceFinalize(ch).filter(e => !voided.has(e.id) && (e.type === 'earn' || e.type === 'note' || e.id === newest)).map(e => e.id))
}

/** Back to draft is allowed only with no live earning or spend since the last Finalize. */
export function canDraft(ch: Sr6Character): boolean {
  const voided = voidedIds(ch)
  return !sinceFinalize(ch).some(e => (e.type === 'earn' || e.type === 'advance') && !voided.has(e.id))
}

/** Review in career: a balance below 0 (after a void), and S2's catalog, Essence and prerequisite checks on the current
 *  build (what a spend may record though the runner lacks it). */
export function validateCareer(data: Sr6Data, cr: CreationRules, ch: Sr6Character): Violation[] {
  const bal = balances(ch), out: Violation[] = []
  if (bal.karma < 0) out.push({ code: 'career.karma', severity: 'warning', path: 'ledger', message: `The karma balance is below zero (${fmt(bal.karma)}).` })
  if (bal.nuyen < 0) out.push({ code: 'career.nuyen', severity: 'warning', path: 'ledger', message: `The nuyen balance is below zero (${fmt(bal.nuyen)}¥).` })
  const keep = new Set(['catalog.missing', 'essence.positive', 'sin.placeholder', 'skill.specUntrained', 'skill.expertiseSpec', 'skill.expertiseRank', 'skill.restricted',
    'magic.spellsAllowed', 'magic.metamagicUser', 'martial.category', 'martial.requires', 'martial.augmentation', 'gear.grade', 'catalog.accessoryHost'])
  return [...out, ...validateSr6(data, cr, { ...ch, build: currentBuild(ch) }).filter(v => keep.has(v.code))]
}
