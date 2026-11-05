// Career pricing: what a spend costs on the current build (preview and its price table), and career adept power points. Part of career.ts (the barrel).
import {
  licenceRating,
  rateLicences,
  sinName,
  type PickKind,
  type Sr6Advance,
  type Sr6Build,
  type Sr6Character,
  type Sr6CritterQuality,
  type Sr6Purchase,
  type Sr6Quality,
} from '../../../formats/domain/character'
import {
  aptitudeSkills,
  attrMax,
  manySpecs,
  powerCost,
  attrRating,
  diyAllowed,
  entryOf,
  fitted,
  licenceFee,
  magicLoss,
  priced,
  qualityCost,
  qualityPrice,
  settingQuality,
  sinCost,
  skillRank,
  toNuyen,
  withPriceMods,
} from '../creation/budgets'
import { flag, num, type CreationRules } from '../../../table-setup/domain/creation'
import { MAGIC_KINDS, pickMaxLevel, type Sr6Data } from '../../../catalog/domain/data'
import { languageKarma } from '../creation/skills'
import { gradeName, gradeProblem } from '../creation/grades'
import { makeProvider, type Provider } from '../creation/providers'
import { bookValue, dataFind, ratingRange } from '../../../catalog/domain/values'
import { entryLabel, stacks } from '../../../catalog/domain/categories'
import { critterOnly, infectedOff, infectedQuality } from '../assets/critterware'
import { critterQualityKarma, isCritterQuality, taughtPrice, TRAINED_LABELS, trainedWhat } from '../assets/critters'
import type { Sr6QualityView } from '../../../catalog/domain/types'
import {
  awakenedFlag,
  freeEligible,
  freePick,
  infectedFit,
  infectedMagicMax,
  infectedOf,
  optionalPower,
  powerRefusal,
  runnerInfected,
} from '../creation/infected'
import { accessoryProblem, deep, sameChoice, setPart } from '../creation/actions'
import { limbSnapshot } from '../assets/limbs'
import { mountsOf, partsOf, shiftProblem, type Mount } from '../assets/vehiclemods'
import { isSignature, learned } from '../creation/martial'
import { addonUpgradeProblem, currentBuild } from './career-replay'
import { balances } from './career-balance'

export type Preview = { ok: true; label: string; karma: number; nuyen: number } | { ok: false; reason: string }
/** Contact and Other: the amounts and label the player types. */
export interface Typed {
  karma?: number
  nuyen?: number
  label?: string
}

/** Stolen Gear's converted karma not yet bought off (No Future errata, NF p. 162): the karma turned into nuyen at
 *  creation (karma.ts toNuyen) less what was bought off since (Sr6Quality.boughtOff). */
export const stolenLeft = (b: Sr6Build, cr: CreationRules, data: Sr6Data, q: Sr6Quality) => Math.max(0, toNuyen(b, cr, data) - (q.boughtOff ?? 0))

/** Adept power points after creation: an adept's are its Magic (a point per point of Magic, CRB p. 156), a mystic
 *  adept's the ones bought (the core rulebook prints no price after creation: advance.powerPoint); less the powers taken. */
export function careerPowerPoints(b: Sr6Build, data: Sr6Data, cr: CreationRules, p: Provider): { max: number; spent: number; left: number } {
  const k = MAGIC_KINDS[b.magic]
  // (Magic as Essence leaves it, as at creation: budgets.ts powerPoints)
  // (the Sixth World Companion's Alternate Mystic Adept, p. 148: half a point for each point of Magic raised)
  const alt = k.paysPowers && !!flag(cr, 'alternateMysticAdept')
  const max = !k.powers
    ? 0
    : alt
      ? (b.powerPointsBought + Math.max(0, attrRating(b, 'mag', p) - p.magicRating(b))) / 2
      : k.paysPowers
        ? b.powerPointsBought
        : Math.max(0, attrRating(b, 'mag', p) - magicLoss(b, data, cr))
  const spent = b.picks.filter(x => x.kind === 'adeptpowers').reduce((t, x) => t + powerCost(data, x), 0)
  return { max, spent, left: Math.round((max - spent) * 100) / 100 }
}

export const PICK_LABEL: Partial<Record<PickKind, string>> = { spells: 'Spell', rituals: 'Ritual', complexforms: 'Complex form', adeptpowers: 'Adept power' }
export const fmt = (x: number) => x.toLocaleString('en-US')
export class Refused {
  reason: string
  constructor(reason: string) {
    this.reason = reason
  }
}
export const no = (reason: string): never => {
  throw new Refused(reason)
}

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

export function price(b: Sr6Build, a: Sr6Advance, data: Sr6Data, cr: CreationRules, typed: Typed): { label: string; karma?: number; nuyen?: number } {
  const p = makeProvider(b.method, data, cr),
    k = MAGIC_KINDS[b.magic]
  const need = (key: string) => num(cr, key) ?? no(`unset:${key}`)
  const skillName = (id: string) => data.skills[id]?.name ?? id
  const lineLabel = (x: Sr6Purchase) => (e => (e ? entryLabel(e) : (x.name ?? 'Custom item')))(x.id ? data.entry(x.kind, x.id) : undefined)
  switch (a.op) {
    case 'attribute': {
      const t = a.target
      if ((t === 'mag' && !k.spells && !k.powers) || (t === 'res' && !k.resonance)) no('unknown-attribute')
      const cur = attrRating(b, t, p)
      // CRB pp. 167, 195: Magic or Resonance tops out at magicMax plus the initiation (submersion) grade
      const cap =
        t === 'mag'
          ? (infectedMagicMax(b, data, cr) ?? need('magicMax') + b.initiation)
          : t === 'res'
            ? need('magicMax') + b.submersion
            : attrMax(data, cr, b, t)
      if (cap !== undefined && cur >= cap) no('at-maximum')
      return { label: `${t.toUpperCase()} ${cur} → ${cur + 1}`, karma: (cur + 1) * need('karmaAttrPerRank') }
    }
    case 'skill': {
      const s = b.skills.find(x => x.id === a.target)
      if (!s && !data.skills[a.target]) no('unknown-entry')
      // (the Sixth World Companion's Unrestricted Skill Ranks, p. 153: no cap after creation)
      const cur = s ? skillRank(s) : 0,
        cap = flag(cr, 'unrestrictedSkillRanks') ? undefined : num(cr, 'advance.skillMax')
      // CRB Hong Kong p. 70: the aptitude quality lets the selected skill go as far above the cap as it does at creation
      // (10 instead of 9); one whose note names no skill, any one skill
      const up = (num(cr, 'skillCapAptitude') ?? 0) - (num(cr, 'skillCap') ?? 0),
        named = aptitudeSkills(data, cr, b)
      const aptitude = !!named && up > 0 && (named.length ? named.includes(a.target) : !b.skills.some(x => x.id !== a.target && skillRank(x) > cap!))
      if (cap !== undefined && cur >= cap + (aptitude ? up : 0)) no('at-maximum')
      return { label: `${skillName(a.target)} ${cur} → ${cur + 1}`, karma: (cur + 1) * need('karmaSkillPerRank') }
    }
    case 'spec':
    case 'expertise': {
      // on a skill without a rank, an expertise without a specialization or below advance.expertiseRank: recorded (Review's
      // skill.specUntrained, skill.expertiseSpec, skill.expertiseRank)
      const s = b.skills.find(x => x.id === a.target)
      if (!s && !data.skills[a.target]) no('unknown-entry')
      // (a further specialization: Exotic Weapons', CRB Hong Kong p. 95, or any with Expanded Specializations, SWC p. 153)
      if (s?.[a.op] && !(a.op === 'spec' && manySpecs(data, cr, a.target))) no('already-known')
      if (!a.name.trim()) no('needs-name')
      return a.op === 'spec'
        ? { label: `${skillName(a.target)}: ${a.name}`, karma: need('karmaSpec') }
        : { label: `${skillName(a.target)} expertise: ${a.name}`, karma: need('advance.expertise') }
    }
    case 'knowledge':
      if (!a.line.name.trim()) no('needs-name')
      return {
        label: `${a.line.kind === 'language' ? 'Language' : 'Knowledge'}: ${a.line.name}`,
        karma: a.line.kind === 'language' ? languageKarma(b, data, need('karmaKnowledge')) : need('karmaKnowledge'),
      }
    case 'quality': {
      // an Infected quality or optional power only while the table allows Infected characters, at its own Karma: Infected
      // qualities "do not have their cost doubled when purchased during gameplay" (SWC p. 106; the optional powers, bought
      // after creation, at the table's price too)
      const e0 = data.entry('qualities', a.line.id)
      if (infectedOff(e0, cr)) no('optional-rule-off')
      // (an optional power only from the runner's Infected type's list: infected.ts powerRefusal)
      const why = optionalPower(e0) ? powerRefusal(b, data, cr, a.line.id, false) : undefined
      if (why) no(why)
      const t0 = infectedOf(e0)
      if (t0 && !infectedFit(data, b.metatype, t0)) no('not-for-metatype')
      if (t0 && runnerInfected(b, data)) no('already-infected')
      const factor = () => (infectedQuality(e0) ? 1 : need('advance.qualityFactor'))
      // a family of levels (levels.ts): the level named (or the lower one the runner has plus the levels asked), replacing
      // the lower level, at the difference in Karma
      const fam = data.family('qualities', a.line.id)
      if (fam) {
        const multi = !!data.qualities[a.line.id]?.multi
        if (multi && !a.target && sameChoice(b, data, a.line.id, a.line.note)) no('already-known')
        const cur = multi ? b.qualities.find(q => q.uid === a.target && !q.free) : b.qualities.find(q => !q.free && data.family('qualities', q.id) === fam)
        const curLevel = cur ? (data.levelOf(data.entry('qualities', cur.id)) ?? 1) : 0
        const e = data.atLevel('qualities', a.line.id, data.levelOf(data.entry('qualities', a.line.id)) ?? curLevel + (a.line.level || 1)) ?? no('at-maximum')
        const v = data.qualities[e.id],
          was = cur && data.qualities[cur.id]
        if (!v.positive) no('not-positive')
        if (v.karma === null || (was && was.karma === null)) no('book-value')
        if (cur && (data.levelOf(e) ?? 1) <= curLevel) no('already-known')
        const karma = qualityCost({ ...a.line, level: 1 }, v) - (cur && was ? qualityCost(cur, was) : 0)
        return { label: `Quality: ${v.name}`, karma: karma * factor() }
      }
      const v = data.qualities[a.line.id] ?? no('unknown-entry')
      if (v.karma === null) no('book-value')
      const had = b.qualities.find(
        q => q.id === a.line.id && !q.free && (!v.multi || (q.note ?? '').trim().toLowerCase() === (a.line.note ?? '').trim().toLowerCase()),
      )
      if (had && !v.perLevel) no('already-known')
      if (!(a.line.level >= 1)) no('below-one')
      if ((had?.level ?? 0) + a.line.level > (v.perLevel ? (v.maxLevel ?? Infinity) : 1)) no('at-maximum')
      const label = `Quality: ${v.name}${v.perLevel ? ` ${(had?.level ?? 0) + a.line.level}` : ''}`
      // a negative quality (GM-assigned) gives its Karma back, undoubled by the advance factor
      if (!v.positive) return { label, karma: -qualityCost(a.line, v) }
      // (its Awakened price, <karmaif>; the Infected free pick, p. 105, when the runner has not used it: one level free)
      const free = !freePick(b, data) && freeEligible(b, data, a.line.id) ? qualityCost({ ...a.line, level: 1 }, v) : 0
      return { label, karma: (qualityPrice(b, data, a.line, v) - free) * factor() }
    }
    case 'buyoff': {
      const q = b.qualities.find(x => x.uid === a.target) ?? no('not-taken')
      if (q.free) no('free-trait')
      const v = data.qualities[q.id] ?? no('unknown-entry')
      if (v.positive) no('not-negative')
      // No Future's errata (NF p. 162): Stolen Gear is bought off by the converted karma left, stolenGearBuyOff a karma,
      // all or a part at a time
      if (settingQuality(b, cr, 'stolenGearQuality', data) === q) {
        const left = stolenLeft(b, cr, data, q),
          part = a.part ?? left
        if (!left && a.part === undefined) return { label: `Buy off: ${v.name}, nothing converted`, karma: 0 }
        if (!Number.isInteger(part) || part < 1) no('below-one')
        if (part > left) no('more-than-left')
        return { label: `Buy off: ${v.name}, ${part} of ${left} converted karma`, karma: part * need('stolenGearBuyOff') }
      }
      if (a.part !== undefined) no('not-a-part')
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
      // a family of levels (levels.ts): the next level (or the one named) replaces the lower one, for the difference
      const fam = data.family(kind, id)
      if (fam) {
        const cur = b.picks.find(x => x.kind === kind && data.family(kind, x.id) === fam)
        const curLevel = cur ? (data.levelOf(data.entry(kind, cur.id)) ?? 1) : 0
        const lv = data.atLevel(kind, id, data.levelOf(e) ?? curLevel + 1) ?? no('at-maximum')
        const v = data.powers[lv.id],
          was = cur && data.powers[cur.id]
        if (cur && (data.levelOf(lv) ?? 1) <= curLevel) no('already-known')
        if (v?.cost == null || (was && was.cost == null)) no('book-value')
        // (at its price for the skill its note names: Improved Ability for a combat skill costs more; a raised line keeps its note)
        const note = cur?.note ?? a.line.note
        if (careerPowerPoints(b, data, cr, p).left < powerCost(data, { id: lv.id, note }) - (cur ? powerCost(data, { id: cur.id, note }) : 0))
          no('no-power-points')
        return { label: `Adept power: ${lv.name}`, karma: 0 }
      }
      const v = data.powers[id]
      if (had && !v?.perLevel) no('already-known')
      if (had && (had.level ?? 1) >= (v?.maxLevel ?? Infinity)) no('at-maximum')
      if (v?.cost == null) no('book-value')
      if (careerPowerPoints(b, data, cr, p).left < powerCost(data, { id, note: had?.note ?? a.line.note })) no('no-power-points') // (one level)
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
      const m = b.martialArts.find(x => x.uid === a.target) ?? no('not-taken'),
        style = data.entry('martialarts', m.id)
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
        // one taken again (its text says it can be) is one more level, each with its own initiation (a family of
        // levels, levels.ts: the next level's entry)
        const fam = data.family(a.line.kind, a.line.id)
        if (fam) {
          const cur = b.picks.find(x => x.kind === a.line!.kind && data.family(a.line!.kind, x.id) === fam)
          const curLevel = cur ? (data.levelOf(data.entry(a.line.kind, cur.id)) ?? 1) : 0
          const lv = data.atLevel(a.line.kind, a.line.id, data.levelOf(e) ?? curLevel + 1) ?? no('at-maximum')
          if (cur && (data.levelOf(lv) ?? 1) <= curLevel) no('already-known')
          what = ` (${lv.name})`
        } else {
          const had = b.picks.find(x => x.kind === a.line!.kind && x.id === a.line!.id),
            max = pickMaxLevel(data, a.line.kind, a.line.id)
          if (had && max === null) no('already-known')
          if (had && (had.level ?? 1) >= max!) no('at-maximum')
          what = ` (${e.name}${had ? ` ${(had.level ?? 1) + 1}` : ''})`
        }
      }
      const next = b[field] + 1
      // CRB pp. 167, 195: the grade never exceeds Magic (Resonance)
      if (next > attrRating(b, field === 'submersion' ? 'res' : 'mag', p)) no('at-maximum')
      return {
        label: `${field === 'submersion' ? 'Submersion' : 'Initiation'} grade ${next}${what}`,
        karma: need('karmaInitiationBase') + next * need('karmaInitiationPerGrade'),
      }
    }
    case 'purchase': {
      const x = a.line
      if (!(x.qty >= 1)) no('below-one')
      if (x.qty > 1 && !stacks(x.kind, data.entry(x.kind, x.id ?? ''))) no('own-line') // (only stackable items take a count)
      // (a design's line: its snapshot, the vehicle the design worked out to; a builders' custom limb: its own)
      const e = x.id
        ? (data.entry(x.kind, x.id) ?? limbSnapshot(x) ?? (x.design || x.id.startsWith('custom.') ? x.snapshot : undefined) ?? no('unknown-entry'))
        : undefined
      const range = ratingRange(e?.attrs.rating)
      if (x.rating !== undefined && range.length && !range.includes(x.rating)) no('rating-range')
      // (a grade the augmentation's type doesn't take is recorded: Review's gear.grade)
      const gp = x.grade ? gradeProblem(cr, data, x.grade, e) : null
      if (gp) no(gp)
      // R: a cost the app can't read isn't guessed; the GM can buy it as a custom line
      const pr = priced(x, data, cr)
      if (!pr.ok) no('book-value')
      return {
        label: `${e ? entryLabel(e) : (x.name ?? 'Custom item')}${x.rating ? ` (rating ${x.rating})` : ''}${x.qty > 1 ? ` × ${x.qty}` : ''}`,
        nuyen:
          x.gmPrice !== undefined && x.kind === 'vehicles' && Number.isFinite(x.gmPrice) && x.gmPrice >= 0 ? x.gmPrice : withPriceMods(pr.cost, x, b, data, cr),
      }
    }
    case 'pack': {
      // a starter pack: its lines free, the pack's price the entry's nuyen (packs.ts)
      if (!(a.cost >= 0) || !Number.isFinite(a.cost)) no('book-value')
      return { label: `Pack: ${a.name}`, nuyen: a.cost }
    }
    case 'quantity': {
      // a stacking line bought again or sold down: the price difference (more costs, fewer credits it back at full price)
      const x = b.purchases.find(y => y.uid === a.target) ?? no('unknown-line')
      if (!stacks(x.kind, data.entry(x.kind, x.id ?? ''))) no('own-line')
      if (!Number.isInteger(a.qty) || a.qty < 1) no('below-one')
      if (a.qty === x.qty) no('unchanged')
      const now = priced({ ...x, qty: a.qty }, data, cr),
        was = priced(x, data, cr)
      if (!now.ok || !was.ok) no('book-value')
      return { label: `Quantity: ${lineLabel(x)} × ${x.qty} → × ${a.qty}`, nuyen: now.cost - was.cost }
    }
    case 'drop': {
      // selling credits an adjustable nuyen sellback (SR Missions: 30% of value by default, the owner sets it); a plain
      // drop with no refund credits nothing. A negative nuyen cost is a credit (ledgerRows/balances add it back).
      const x = b.purchases.find(y => y.uid === a.target) ?? no('unknown-line')
      const name = (x.id && (e => e && entryLabel(e))(data.entry(x.kind, x.id))) || x.name || 'Custom item'
      return a.refund ? { label: `Sold: ${name} for ${a.refund.toLocaleString('en-US')}¥`, nuyen: -a.refund } : { label: `Dropped: ${name}` }
    }
    case 'upgrade': {
      // an add-on changed in place (a cyberlimb's Attribute increase to another rating, owner ruling 2026-10-30): one step,
      // the difference between the new and old price (a lower rating is a credit of the difference)
      const accHost = b.purchases.find(y => y.accessories.some(z => z.uid === a.target))
      if (accHost) {
        const was = accHost.accessories.find(z => z.uid === a.target)!
        const problem = addonUpgradeProblem(was, a.line, data)
        if (problem) no(problem)
        const hostPr = priced({ ...accHost, accessories: [] }, data, cr)
        const now = priced(fitted(accHost, a.line), data, cr, hostPr),
          before = priced(fitted(accHost, was), data, cr, hostPr)
        if (!now.ok || !before.ok) no('book-value')
        return {
          label: `Changed: ${lineLabel(was)} → ${lineLabel(a.line)} on ${lineLabel(accHost)}`,
          nuyen: withPriceMods(now.cost - before.cost, accHost, b, data, cr),
        }
      }
      // upgrade a line in place to a higher level in its family (levels.ts) and/or a different grade, paying the DIFFERENCE
      // in cost (SR Missions FAQ v2.4 p.21: same-type upgrade credits the old piece at full value). The line keeps its
      // accessories (applyAdvance), which is why cyberware/bioware is upgraded here rather than sold and re-bought.
      const old = b.purchases.find(y => y.uid === a.target) ?? no('unknown-line')
      const oldE = old.id ? (data.entry(old.kind, old.id) ?? no('unknown-entry')) : no('unknown-entry')
      const x = a.line,
        e = x.id ? (data.entry(x.kind, x.id) ?? no('unknown-entry')) : no('unknown-entry')
      const sameItem = x.kind === old.kind && x.id === old.id
      const fam = old.id && data.family(old.kind, old.id)
      const higherLevel = !!fam && data.family(x.kind, x.id) === fam && (data.levelOf(e) ?? 0) > (data.levelOf(oldE) ?? 0)
      const gradeChange = sameItem && (x.grade ?? '') !== (old.grade ?? '')
      // same family but not a higher level (and no grade change) reads as already-known; an unrelated target is not-a-level
      if (!higherLevel && !gradeChange) no(!!fam && data.family(x.kind, x.id) === fam ? 'already-known' : 'not-a-level')
      const gp = x.grade ? gradeProblem(cr, data, x.grade, e) : null
      if (gp) no(gp)
      // price the whole implant WITH its accessories on both sides: the add-ons take the implant's grade (CRB p. 282,
      // budgets.ts fitted), so upgrading the grade bumps their cost too and the difference must include it
      const pr = priced({ ...x, accessories: old.accessories }, data, cr),
        oldPr = priced(old, data, cr)
      if (!pr.ok || !oldPr.ok) no('book-value')
      const label =
        gradeChange && !higherLevel
          ? `Upgrade: ${entryLabel(e)} to ${gradeName(data, x.grade!)}`
          : `Upgrade: ${entryLabel(oldE)} → ${entryLabel(e)}${x.grade && x.grade !== old.grade ? `, ${gradeName(data, x.grade)}` : ''}`
      return { label, nuyen: withPriceMods(pr.cost - oldPr.cost, x, b, data, cr) }
    }
    case 'fit': {
      // an accessory (a vehicle mod, a weapon in one of its mounts, an autosoft) on an owned line, at its price (do it
      // yourself: half, a mod only, Double Clutch p. 120); what goes past the vehicle's limits is recorded (Review warns)
      const host = deep(b.purchases).find(y => y.uid === a.target) ?? no('unknown-host')
      const x = a.line,
        e = x.id ? (data.entry(x.kind, x.id) ?? limbSnapshot(x) ?? x.snapshot ?? no('unknown-entry')) : undefined
      const range = ratingRange(e?.attrs.rating)
      if (x.rating !== undefined && range.length && !range.includes(x.rating)) no('rating-range')
      if (x.mount !== undefined) {
        if (x.kind !== 'weapons') no('not-a-weapon')
        if (!mountsOf(host, data).some(m => m.uid === x.mount)) no('not-a-mount')
      }
      if (x.diy && !diyAllowed(e)) no('no-diy')
      if (x.derived) {
        // (a GM-derived mod: the same room test as at creation, on the freed hook)
        const why = accessoryProblem(host, x, data)
        if (why) no(why)
      }
      // (critter equipment on an owned critter only; on a critter what is printed in its Body reads at it: priced)
      if (critterOnly(e) && host.kind !== 'critters') no('critters-only')
      const pr = priced(fitted(host, x), data, cr, priced({ ...host, accessories: [] }, data, cr))
      if (!pr.ok) no('book-value')
      return {
        label: `Fit: ${lineLabel(x)}${x.rating ? ` (rating ${x.rating})` : ''}${x.diy ? ', do it yourself' : ''} on ${lineLabel(host)}`,
        nuyen: withPriceMods(pr.cost, host, b, data, cr),
      }
    }
    case 'unfit': {
      // take an accessory off; selling it back credits an adjustable nuyen sellback (SR Missions: 30% of value by
      // default, the owner sets it), else it is just removed with no refund
      const host = deep(b.purchases).find(y => y.accessories.some(z => z.uid === a.target)) ?? no('not-fitted')
      const acc = host.accessories.find(z => z.uid === a.target)!
      return a.refund
        ? { label: `Sold: ${lineLabel(acc)} off ${lineLabel(host)} for ${a.refund.toLocaleString('en-US')}¥`, nuyen: -a.refund }
        : { label: `Removed: ${lineLabel(acc)} from ${lineLabel(host)}` }
    }
    case 'shift': {
      // free: the book prints no cost (Double Clutch p. 120); a void shifts the slots back
      const host = b.purchases.find(y => y.uid === a.target) ?? no('unknown-host')
      const why = shiftProblem(host, a.from, a.to, data)
      if (why) no(why)
      return { label: `Shift mod slots: 2 ${a.from} → 1 ${a.to} on ${lineLabel(host)}` }
    }
    case 'part': {
      // a factory part off or back (decomposition plan D1/D4): free, no refund; checked on a copy, as creation's op does
      const host = b.purchases.find(y => y.uid === a.target && (y.kind === 'vehicles' || y.kind === 'weapons')) ?? no('unknown-host')
      const r = setPart(structuredClone(host), a.part, !!a.restore, data)
      if (!r.ok) no(r.reason)
      const p = partsOf(host, data).find(y => y.id === a.part)
      return { label: `${a.restore ? 'Restored' : 'Removed'} factory part: ${p?.name ?? a.part} ${a.restore ? 'on' : 'from'} ${lineLabel(host)}` }
    }
    case 'move': {
      // no new charge; the weapon's size is checked only by Review's warning (vehiclemods.ts); a void puts it back
      const host = b.purchases.find(y => y.accessories.some(z => z.uid === a.target)) ?? no('not-fitted')
      const mounts = mountsOf(host, data),
        w = host.accessories.find(z => z.uid === a.target)!,
        to = mounts.find(z => z.uid === a.mount),
        from = mounts.find(z => z.uid === w.mount)
      if (w.kind !== 'weapons') no('not-a-weapon')
      if (!to) no('not-a-mount')
      if (to!.uid === w.mount) no('same-mount')
      const said = (m: Mount) => `${m.name}${m.builtin ? ' (built in)' : ''}`
      return { label: `Moved: ${lineLabel(w)} from ${from ? said(from) : 'no mount'} to ${said(to!)} on ${lineLabel(host)}` }
    }
    case 'bond': {
      // the Critter Bond path's Permanent Improvement (SWC p. 139: a new or upgraded quality at 2 × its Karma, the
      // career quality factor), with a negative taken alongside whose bonus comes off first (Wild Life p. 184); the
      // runner's Critter Bond itself is Review's warning (critter.rules), not a refusal
      const host = b.purchases.find(y => y.uid === a.target && y.kind === 'critters') ?? no('unknown-host')
      const qs = host.critterQualities ?? []
      const view = (q: Sr6CritterQuality) => {
        const e = data.entry('qualities', q.id) ?? no('unknown-entry')
        if (!isCritterQuality(e)) no('not-a-critter-quality')
        return data.qualities[q.id] ?? no('unknown-entry')
      }
      const v = view(a.line)
      if (!v.positive) no('not-positive')
      if (!(a.line.level >= 1)) no('below-one')
      const had = qs.find(q => q.uid === a.line.uid),
        was = had && data.qualities[had.id]
      if (!had && qs.some(q => q.id === a.line.id)) no('already-taken')
      const up = critterQualityKarma(v, a.line) - (had && was ? critterQualityKarma(was, had) : 0)
      if (up <= 0) no('already-known')
      let bonus = 0
      if (a.with) {
        const n = view(a.with)
        if (n.positive) no('not-negative')
        if (qs.some(q => q.id === a.with!.id)) no('already-taken')
        bonus = critterQualityKarma(n, a.with)
      }
      const nm = (q: Sr6CritterQuality, w: Sr6QualityView) => `${w.name}${w.perLevel ? ` ${q.level}` : ''}`
      return {
        label: `Critter bond: ${nm(a.line, v)}${a.with ? ` with ${nm(a.with, data.qualities[a.with.id])}` : ''} on ${lineLabel(host)}`,
        karma: Math.max(0, up - bonus) * need('advance.qualityFactor'),
      }
    }
    case 'teach': {
      // a command or special training taught to a critter the runner owns, at the OPTIONS row's price (Wild Life p.
      // 180: +500¥, +750¥; owner 2026-10-16), no Availability; past its limit is Review's warning, not a refusal
      const host = b.purchases.find(y => y.uid === a.target && y.kind === 'critters') ?? no('unknown-host')
      const e = data.entry('actions', a.line.id ?? '') ?? no('unknown-entry')
      if (trainedWhat(e) !== a.line.what) no('not-critter-training')
      const nuyen = taughtPrice(data, a.line.what) ?? no('book-value')
      return { label: `Taught: ${e.name} (${TRAINED_LABELS[a.line.what]}) to ${lineLabel(host)}`, nuyen }
    }
    case 'contact':
      if (!(a.line.connection >= 1 && a.line.loyalty >= 1)) no('below-one')
      return { label: typed.label?.trim() || `Contact: ${a.line.name || 'unnamed'}`, karma: typed.karma, nuyen: typed.nuyen }
    case 'sin': {
      // priced as creation prices it (budgets.ts sinCost), with the settings it needs set; its licences rated as it
      const x = rateLicences(structuredClone(a.line))
      if (x.uid && !b.sins.find(s => s.uid === x.uid)?.placeholder) no('unknown-line')
      if (!x.name.trim()) no('needs-name')
      if (x.kind === 'fake' && !((x.rating ?? 1) >= 1)) no('below-one')
      if (x.licences.some(l => !l.name.trim())) no('needs-name')
      const what = [x.kind === 'real' ? 'real' : `fake, rating ${x.rating ?? 1}`, ...x.licences.map(l => `${l.name} ${l.rating}`)].join(', ')
      return { label: `SIN: ${x.name.trim()} (${what})${x.uid ? ', was the unnamed SIN' : ''}`, nuyen: sinCost(x, need) }
    }
    case 'lifestyle': {
      const sin = a.sin ? (b.sins.find(s => s.uid === a.sin) ?? no('unknown-line')) : undefined
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
        const n = a.karma * need('advance.karmaToNuyenRate')
        return { label: `${a.karma} karma to ${fmt(n)}¥`, karma: a.karma, nuyen: -n }
      }
      if (!flag(cr, 'workingForThePeople')) no('optional-rule-off')
      const rate = num(cr, 'advance.nuyenToKarmaRate') ?? no('optional-rule-off'),
        n = -a.karma * rate
      return { label: `${fmt(n)}¥ to ${-a.karma} karma`, karma: a.karma, nuyen: n }
    }
    case 'awakened': {
      // (owner 2026-10-16: overridable after creation too, free; Review warns while it differs: awakened.override)
      if (a.value === b.awakened) no('already-known')
      const f = awakenedFlag({ ...b, awakened: a.value }, data),
        yes = (v: boolean) => (v ? 'Awakened' : 'not Awakened')
      return {
        label:
          a.value === undefined ? `Awakened: derived again (${yes(f.derived)}, ${f.why})` : `Awakened override: ${yes(a.value)} (derived: ${yes(f.derived)})`,
      }
    }
    case 'licensed': {
      // a licence on one more of the runner's SINs for a line it owns (owner 2026-10-16): on a real SIN at the fee its
      // Availability prints, on a fake one a fake licence rated as the SIN, priced as creation prices it (budgets.ts sinCost)
      const x = b.purchases.flatMap(y => [y, ...y.accessories]).find(y => y.uid === a.target) ?? no('unknown-line')
      const sin = b.sins.find(s => s.uid === a.sin) ?? no('unknown-line')
      const fee = licenceFee(x, data) ?? no('no-licence')
      if (sin.licences.some(l => l.item === x.uid)) no('already-known')
      const e = entryOf(x, data),
        what = `Licence: ${e ? entryLabel(e) : (x.name ?? 'Custom item')} on ${sinName(sin)}`
      if (sin.kind === 'real') return { label: what, nuyen: fee }
      const r = licenceRating(sin)
      return { label: `${what} (fake licence, rating ${r})`, nuyen: r * need('licencePerRating') }
    }
    case 'assign': {
      // free, always allowed (owner 2026-10-31): which SIN an owned line is registered to costs nothing
      const x = b.purchases.flatMap(y => [y, ...y.accessories]).find(y => y.uid === a.target) ?? no('unknown-line')
      const sin = a.sin ? (b.sins.find(s => s.uid === a.sin) ?? no('unknown-line')) : undefined
      if (x.sin === sin?.uid) no('unchanged')
      const e = entryOf(x, data)
      return { label: `Identity: ${e ? entryLabel(e) : (x.name ?? 'Custom item')} ${sin ? `registered to ${sinName(sin)}` : 'unassigned'}` }
    }
    case 'other':
      return { label: typed.label?.trim() || 'Other', karma: typed.karma, nuyen: typed.nuyen }
  }
}
