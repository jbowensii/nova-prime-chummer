// Creation rules, Review's checks (a port of SR6 Forge's rules.mjs): a table of checks over the build and its budgets.
// Each violation cites the creation setting it rests on (its source and page) or the catalog entry it's about; its path's
// first segment is the editor tab (attributes.bod, skills.<id>, qualities.<uid>, gear.<uid>…). A rule whose setting is
// unset is skipped and Review warns once per setting (setting.unset). Errors block Finalize unless a GM approves them.
// A prerequisite the runner lacks is always an error, cited to the page that prints it (owner, 2026-10-09): the editor
// and the Ledger let it be taken, and the error stands until it's met or a GM approves it.
import { canFinalize } from '../../engine/validate'
import type { Severity, Violation } from '../../model/types'
import { CORE_ATTRS, LETTERS, MAGIC_KIND_LABELS, SR6_ATTRS, type Sr6Attr, type Sr6Build, type Sr6Character, type Sr6Purchase } from '../model/character'
import { allBudgets, attrMax, attrRating, augmentedRating, entryOf, extraMagic, fitted, priced, PURCHASE_TAB, qualityKarma, ratingOf, skillRank, type Sr6Budgets } from './budgets'
import { cite, expandKeys, flag, num, str, type CreationRules } from './creation'
import { MAGIC_KINDS, metamagicFits, picksFor, type Sr6Data } from './data'
import { deriveSr6 } from './derive'
import { makeProvider, uncovered, type Provider } from './providers'
import { ratingRange } from './values'
import { gradeFits, gradeKnown, gradeName } from './grades'
import { capacityOf, capacityUsed, entryLabel, hostsOf, fitsHost } from './categories'
import { MARTIAL_CITE, prerequisites, prerequisiteText, styleName, techniqueFits, techniqueName } from './martial'

interface Ctx { data: Sr6Data; cr: CreationRules; ch: Sr6Character; b: Sr6Build; p: Provider; budgets: Sr6Budgets }
/** A broken rule: where (default: the rule's tab), what, and its citation when it isn't the setting's. */
interface Hit { path?: string; message: string; source?: string; page?: number }
interface Rule {
  code: string; severity: Severity; tab: string
  /** the settings the rule needs; with one unset it's skipped. The first one's cite goes on the violation. */
  setting?: string[] | ((c: Ctx) => string[])
  check(c: Ctx): Hit | Hit[] | null
}

const A = (k: Sr6Attr) => k.toUpperCase()
const lowerFirst = (s: string) => s[0].toLowerCase() + s.slice(1)
const kindLabel = (b: Sr6Build) => lowerFirst(MAGIC_KIND_LABELS[b.magic])
const article = (w: string) => (/^[aeiou]/i.test(w) ? 'An' : 'A')
const usesLetters = (p: Provider) => p.id === 'priority' || p.id === 'sumtoten'
const fmt = (n: number) => n.toLocaleString('en-US')
const n0 = (cr: CreationRules, key: string) => num(cr, key) ?? 0
const over = (budget: { left: number }, what: string, unit = ''): Hit | null =>
  budget.left >= 0 ? null : { message: `${what} overspent by ${fmt(-budget.left)}${unit}.` }
const entryCite = (e?: { source: string; page: number }) => (e ? { source: e.source, page: e.page } : {})
const CRB = (page: number) => ({ source: 'CRB', page })
const metaName = (c: Ctx) => c.data.metatypes[c.b.metatype]?.name ?? c.b.metatype
/** every purchase and accessory, with the path of the line it sits on */
function* lines(b: Sr6Build): Generator<{ x: Sr6Purchase; path: string; host?: Sr6Purchase; own?: Sr6Purchase }> {
  for (const x of b.purchases) {
    const path = `${PURCHASE_TAB[x.kind]}.${x.uid}`
    yield { x, path }
    // (an implant's add-on has its grade, CRB p. 282; own: the accessory as the file has it)
    for (const a of x.accessories) yield { x: fitted(x, a), path, host: x, own: a }
  }
}
/** 1 when the runner has the quality a setting names (Many Talents, Many Skills: Sixth World Companion p. 134), else 0. */
const has = (c: Ctx, key: string) => { const id = str(c.cr, key); return id && c.b.qualities.some(q => q.id === id) ? 1 : 0 }
const pickName = (c: Ctx, x: Sr6Build['picks'][number]) => { const e = c.data.entry(x.kind, x.id); return e ? entryLabel(e) : x.name ?? x.id }

const RULES: Rule[] = [
  { code: 'prio.allAssigned', severity: 'error', tab: 'method',
    check: c => (!usesLetters(c.p) || Object.values(c.b.priorities).every(Boolean) ? null : { message: 'Give each of the five priorities a letter.' }) },
  { code: 'prio.lettersValid', severity: 'error', tab: 'method',
    setting: c => (c.p.id === 'sumtoten' ? ['sumToTenTarget', ...LETTERS.map(l => `letterValue:${l}`)] : []),
    check: c => (c.p.lettersValid(c.b.priorities) ? null : { message: c.p.id === 'sumtoten'
      ? `The priority letters’ values add up to more than ${n0(c.cr, 'sumToTenTarget')}, or a priority has no letter.`
      : 'Each letter A–E goes to exactly one priority.' }) },
  { code: 'prio.metatypeAllowed', severity: 'error', tab: 'method', check: c => {
    if (!c.b.metatype) return { message: 'Pick a metatype.' }
    if (c.p.legalMetatypes(c.b).some(m => m.id === c.b.metatype)) return null
    return { message: usesLetters(c.p) ? `${metaName(c)} isn’t available at metatype priority ${c.b.priorities.metatype ?? '(none)'}.`
      : `${metaName(c)} isn’t a metatype in the catalog.` }
  } },
  { code: 'prio.magicAllowed', severity: 'error', tab: 'method', check: c =>
    (c.p.legalMagic(c.b).some(m => m.kind === c.b.magic) ? null
      : { message: `${MAGIC_KIND_LABELS[c.b.magic]} isn’t available at magic priority ${c.b.priorities.magic ?? '(none)'}.` }) },

  { code: 'attr.overspent', severity: 'error', tab: 'attributes', check: c => over(c.budgets.attributePoints, 'Attribute points') },
  { code: 'adjust.overspent', severity: 'error', tab: 'attributes', check: c => over(c.budgets.adjustmentPoints, 'Adjustment points') },
  { code: 'attr.creationMax', severity: 'error', tab: 'attributes', check: c => {
    const m = c.data.metatypes[c.b.metatype]
    if (!m) return null
    return [...CORE_ATTRS, 'edg' as const].flatMap(k => {
      const r = attrRating(c.b, k, c.p), max = attrMax(c.data, c.cr, c.b, k)!
      return r > max ? [{ path: `attributes.${k}`, message: `${A(k)} ${r} is above ${m.name}’s maximum of ${max}.`, source: c.data.entry('metatypes', m.id)?.source, page: m.page }] : []
    })
  } },
  { code: 'attr.specialMax', severity: 'error', tab: 'attributes', setting: ['magicMax'], check: c =>
    (['mag', 'res'] as const).flatMap(k => {
      const r = attrRating(c.b, k, c.p), max = n0(c.cr, 'magicMax')
      return r > max ? [{ path: `attributes.${k}`, message: `${A(k)} ${r} is above the highest Magic or Resonance, ${max}.` }] : []
    }) },
  { code: 'attr.oneAtMax', severity: 'error', tab: 'attributes', setting: ['oneAttributeAtMax'], check: c => {
    const m = c.data.metatypes[c.b.metatype]
    if (!m || !flag(c.cr, 'oneAttributeAtMax')) return null
    const at = CORE_ATTRS.filter(k => attrRating(c.b, k, c.p) >= attrMax(c.data, c.cr, c.b, k)!), most = 1 + has(c, 'manyTalentsQuality')
    return at.length <= most ? null : { message: most > 1 ? `Only ${most} attributes may be at their maximum (${at.map(A).join(', ')} are).`
      : `Only one attribute may be at its maximum (${at.map(A).join(', ')} are).` }
  } },
  { code: 'attr.adjustTargets', severity: 'error', tab: 'attributes', setting: ['attributeBaseMax'], check: c => {
    // Edge, Magic and Resonance always take adjustment points; a core attribute only when the metatype raises its maximum
    const m = c.data.metatypes[c.b.metatype], base = n0(c.cr, 'attributeBaseMax')
    if (!m) return null
    return CORE_ATTRS.filter(k => c.b.attributes[k].adjust > 0 && m.ranges[k as keyof typeof m.ranges][1] <= base)
      .map(k => ({ path: `attributes.${k}`, message: `Adjustment points can’t go on ${A(k)}: ${m.name}’s ${A(k)} maximum isn’t raised.` }))
  } },

  { code: 'skill.overspent', severity: 'error', tab: 'skills', check: c => over(c.budgets.skillPoints, 'Skill points') },
  { code: 'skill.cap', severity: 'error', tab: 'skills', setting: ['skillCap'], check: c => {
    const capBase = n0(c.cr, 'skillCap'), apt = str(c.cr, 'aptitudeQuality'), aptCap = num(c.cr, 'skillCapAptitude')
    const aptitude = !!apt && aptCap !== undefined && c.b.qualities.some(q => q.id === apt)
    const cap = aptitude ? aptCap! : capBase
    const name = (id: string) => c.data.skills[id]?.name ?? id
    const hits: Hit[] = c.b.skills.filter(s => skillRank(s) > cap)
      .map(s => ({ path: `skills.${s.id}`, message: `${name(s.id)} rank ${skillRank(s)} is above the cap of ${cap}.` }))
    if (aptitude && c.b.skills.filter(s => skillRank(s) > capBase).length > 1) hits.push({ message: `Only one skill may be above ${capBase}.` })
    return hits
  } },
  { code: 'skill.oneAtMax', severity: 'error', tab: 'skills', check: c => {
    // CRB p. 65: only one skill at the highest rank (with the aptitude quality, that one may go one higher)
    const cap = num(c.cr, 'skillCap')
    if (!flag(c.cr, 'oneSkillAtMax') || cap === undefined) return null
    const at = c.b.skills.filter(s => skillRank(s) >= cap).map(s => c.data.skills[s.id]?.name ?? s.id), most = 1 + has(c, 'manySkillsQuality')
    return at.length <= most ? null : { message: `Only ${most > 1 ? most : 'one'} skill${most > 1 ? 's' : ''} may be at the highest rank, ${cap} (${at.join(', ')} are).`, ...cite(c.cr, 'oneSkillAtMax') }
  } },
  // (owner, 2026-10-09) an expertise may be bought at creation with the customization karma (CRB p. 66, step four, at
  // p. 68's price: budgets.ts skillSpend): no blanket error; its prerequisites are the two below
  // CRB p. 93: a specialization (or an expertise) is attached to a skill the runner has a rank in
  { code: 'skill.specUntrained', severity: 'error', tab: 'skills', check: c => c.b.skills.filter(s => skillRank(s) < 1 && (s.spec || s.expertise))
    .map(s => ({ path: `skills.${s.id}`, message: `${c.data.skills[s.id]?.name ?? s.id} has ${s.spec ? 'a specialization' : 'an expertise'} but no rank.`, ...CRB(93) })) },
  // CRB p. 68: an expertise needs a specialization in its area first (p. 92: the specialization is turned into it)
  { code: 'skill.expertiseSpec', severity: 'error', tab: 'skills', check: c => c.b.skills.filter(s => s.expertise && !s.spec)
    .map(s => ({ path: `skills.${s.id}`, message: `${c.data.skills[s.id]?.name ?? s.id} has an expertise but no specialization: an expertise needs one first.`, ...CRB(68) })) },
  // CRB p. 68: an expertise needs a skill rank of advance.expertiseRank (optional: unset, no minimum and no unset warning)
  { code: 'skill.expertiseRank', severity: 'error', tab: 'skills', check: c => {
    const need = num(c.cr, 'advance.expertiseRank')
    return need === undefined ? null : c.b.skills.filter(s => s.expertise && skillRank(s) < need).map(s => ({ path: `skills.${s.id}`,
      message: `${c.data.skills[s.id]?.name ?? s.id} has an expertise at rank ${skillRank(s)}: an expertise needs rank ${need}.`, ...cite(c.cr, 'advance.expertiseRank') }))
  } },
  { code: 'skill.restricted', severity: 'error', tab: 'skills', check: c => {
    // R: a skill on Magic needs an awakened kind (an aspected magician picks one); one on Resonance an emerged one
    const k = MAGIC_KINDS[c.b.magic]
    return c.b.skills.filter(s => skillRank(s) > 0).flatMap(s => {
      const v = c.data.skills[s.id]
      if (!v) return []
      const bad = v.attr === 'mag' ? !(k.spells || k.powers) || (c.b.magic === 'aspected' && s.id !== c.b.aspectedSkill)
        : v.attr === 'res' ? !k.resonance : false
      return bad ? [{ path: `skills.${s.id}`, message: c.b.magic === 'aspected' && v.attr === 'mag'
        ? `An aspected magician uses one Magic skill; ${v.name} isn’t the one picked.`
        : `${article(kindLabel(c.b))} ${kindLabel(c.b)} can’t use ${v.name}.` }] : []
    })
  } },

  { code: 'quality.netBonusCap', severity: 'error', tab: 'qualities', setting: ['qualityNetBonusCap'], check: c => {
    const { pos, neg } = qualityKarma(c.b, c.data, c.cr), cap = n0(c.cr, 'qualityNetBonusCap')
    return neg - pos <= cap ? null : { message: `Negative qualities give ${neg - pos} karma more than positive ones cost; the most is ${cap}.` }
  } },
  { code: 'quality.maxCount', severity: 'error', tab: 'qualities', setting: ['qualityMaxCount'], check: c => {
    // (a quality whose text says it doesn't count toward the six: Lofwyr's Legions p. 16's drake qualities)
    const count = c.b.qualities.filter(q => !q.free && !c.data.qualities[q.id]?.uncounted).length, cap = n0(c.cr, 'qualityMaxCount')
    return count <= cap ? null : { message: `${count} paid qualities; the most is ${cap}.` }
  } },
  { code: 'quality.level', severity: 'error', tab: 'qualities', check: c => c.b.qualities.flatMap(q => {
    const v = c.data.qualities[q.id], max = v?.perLevel ? v.maxLevel : 1
    return v && q.level > max ? [{ path: `qualities.${q.uid}`, message: `${v.name} level ${q.level} is above its highest level, ${max}.`,
      ...entryCite(c.data.entry('qualities', q.id)) }] : []
  }) },

  // a quality granted only (a Returned Soldier power): taken, a quality the runner has must offer its list (a
  // prerequisite: an error), and no more of the list than that quality's choices allow (the list's max, else the
  // choice's count: a warning)
  { code: 'quality.granted', severity: 'error', tab: 'qualities', check: c => granted(c).filter(h => h.none) },
  { code: 'quality.grantedCount', severity: 'warning', tab: 'qualities', check: c => granted(c).filter(h => !h.none) },

  // martial arts (FS p. 97): their prices (set when the runner has a style), a style once, a technique once under any
  // style, and only of the style's categories, General or its signature
  { code: 'martial.price', severity: 'warning', tab: 'martial', setting: c => (c.b.martialArts.length ? ['karmaMartialArt', 'karmaTechnique'] : []), check: () => null },
  { code: 'martial.duplicateStyle', severity: 'error', tab: 'martial', check: c => c.b.martialArts
    .filter((m, i, all) => all.findIndex(x => x.id === m.id) !== i)
    .map(m => ({ path: `martial.${m.uid}`, message: `${styleName(c.data, m)} is taken twice: a style is learned once.`, ...MARTIAL_CITE })) },
  { code: 'martial.duplicateTechnique', severity: 'error', tab: 'martial', check: c => {
    const seen = new Set<string>(), hits: Hit[] = []
    for (const m of c.b.martialArts) for (const t of m.techniques) {
      if (seen.has(t.id)) hits.push({ path: `martial.${m.uid}`, message: `${techniqueName(c.data, t)} is learned twice: a technique is learned once, under any style.`, ...MARTIAL_CITE })
      seen.add(t.id)
    }
    return hits
  } },
  { code: 'martial.category', severity: 'error', tab: 'martial', check: c => c.b.martialArts.flatMap(m => {
    const style = c.data.entry('martialarts', m.id)
    return m.techniques.flatMap(t => {
      const e = c.data.entry('martialtechniques', t.id)
      return techniqueFits(style, e) ? [] : [{ path: `martial.${m.uid}.${t.uid}`, ...MARTIAL_CITE,
        message: `${e!.name} is a ${e!.attrs.category.split(';')[0].trim()} technique; ${style!.name} teaches ${style!.attrs.categories} and General ones.` }]
    })
  }) },

  // a technique's printed prerequisite the runner lacks (FS p. 97: "certain techniques may have additional
  // restrictions"), an adept power, technique or quality; the augmentation one below. Errors (owner, 2026-10-09): taken
  // anyway, each stands until met or a GM approves it (one approval a technique: its path names it)
  { code: 'martial.requires', severity: 'error', tab: 'martial', check: c => c.b.martialArts.flatMap(m => m.techniques.flatMap(t =>
    prerequisites(c.data, c.b, c.data.entry('martialtechniques', t.id)).filter(p => p.met === false && p.kind !== 'augmentation').map(p => ({ path: `martial.${m.uid}.${t.uid}`, ...MARTIAL_CITE,
      message: `${techniqueName(c.data, t)} requires ${prerequisiteText(p)}, which the runner doesn’t have.` })))) },
  { code: 'martial.augmentation', severity: 'error', tab: 'martial', check: c => c.b.martialArts.flatMap(m => m.techniques.flatMap(t =>
    prerequisites(c.data, c.b, c.data.entry('martialtechniques', t.id)).filter(p => p.met === false && p.kind === 'augmentation').map(p => ({ path: `martial.${m.uid}.${t.uid}`, ...MARTIAL_CITE,
      message: `${techniqueName(c.data, t)} requires ${prerequisiteText(p)}, which the runner’s augmentations don’t include.` })))) },

  { code: 'karma.overspent', severity: 'error', tab: 'review', check: c => over(c.budgets.karma, 'Karma') },
  { code: 'nuyen.overspent', severity: 'error', tab: 'gear', check: c => over(c.budgets.nuyen, 'Nuyen', '¥') },
  { code: 'gear.availCap', severity: 'error', tab: 'gear', setting: ['maxAvailability'], check: c => {
    // CRB first printing p. 66 (optional, availabilityCapIllegalOnly): the cap holds only illegal gear (Availability `(I)`)
    const cap = n0(c.cr, 'maxAvailability'), hits: Hit[] = [], illegalOnly = flag(c.cr, 'availabilityCapIllegalOnly')
    for (const { x, path } of lines(c.b)) {
      const { avail } = priced({ ...x, accessories: [] }, c.data, c.cr)
      if (illegalOnly && !/\(?\s*I\s*\)?\s*$/.test(entryOf(x, c.data)?.attrs.avail ?? '')) continue
      if (avail > cap) hits.push({ path, message: `${nameOf(c, x)}’s Availability ${avail} is above ${cap}.` })
    }
    return hits
  } },
  { code: 'gear.ratingRange', severity: 'error', tab: 'gear', check: c => {
    const hits: Hit[] = []
    for (const { x, path } of lines(c.b)) {
      const e = entryOf(x, c.data), range = ratingRange(e?.attrs.rating), r = ratingOf(x, e)
      if (e && range.length && !range.includes(r))
        hits.push({ path, message: `${e.name} comes in ratings ${range[0]}–${range[range.length - 1]}, not ${r}.`, ...entryCite(e) })
    }
    return hits
  } },
  // CRB p. 283: grades are for cyberware and bioware (a catalog grade may name its own types: Body Shop's exoware)
  // CRB p. 282: "All accessories and add-ons must be of the same grade as the implant to which they are added": an
  // add-on the file gives another grade is read at its implant's, and noted
  { code: 'gear.accessoryGrade', severity: 'warning', tab: 'augmentations', check: c => {
    const hits: Hit[] = []
    for (const { x, path, host, own } of lines(c.b)) {
      if (!host || !own || own.grade === x.grade || host.kind !== 'augmentations') continue
      const g = (k?: string) => (k ? gradeName(c.data, k) : 'standard')
      hits.push({ path, message: `${nameOf(c, own)} on ${nameOf(c, host)}: an add-on has its implant’s grade, so it’s ${g(x.grade)}, not the file’s ${g(own.grade)}.`, ...CRB(282) })
    }
    return hits
  } },
  { code: 'gear.grade', severity: 'error', tab: 'augmentations', check: c => {
    const hits: Hit[] = []
    for (const { x, path, host } of lines(c.b)) {
      const e = entryOf(x, c.data), g = x.grade
      // (an add-on's grade is its implant's, whatever it is: gear.accessoryGrade)
      if (host || !g || !e || !gradeKnown(c.cr, c.data, g) || gradeFits(c.cr, c.data, e, g)) continue
      const ge = c.data.grades[g] && c.data.entry('grades', c.data.grades[g].id)
      hits.push({ path, message: `${nameOf(c, x)} (${e.attrs.type || e.kind}) doesn’t come in ${gradeName(c.data, g)}.`, ...(ge ? entryCite(ge) : CRB(283)) })
    }
    return hits
  } },
  { code: 'essence.positive', severity: 'error', tab: 'augmentations', setting: ['essence'], check: c =>
    (c.budgets.essence.left > 0 ? null : { message: `Essence must stay above 0 (it is ${c.budgets.essence.left}).` }) },

  // CRB p. 67: what each magic kind learns (spells and rituals a magician, adept powers an adept, both a mystic adept,
  // complex forms a technomancer)
  { code: 'magic.spellsAllowed', severity: 'error', tab: 'magic', check: c => {
    // adept powers are adept.ppBudget's
    const allowed = { ...picksFor(c.b.magic), adeptpowers: true }
    return c.b.picks.filter(x => !allowed[x.kind])
      .map(x => ({ path: `magic.${x.uid}`, message: `${article(kindLabel(c.b))} ${kindLabel(c.b)} can’t have ${pickName(c, x)}.`, ...CRB(67) }))
  } },
  // CRB p. 66: the customization Karma buys attributes, skills, qualities and nuyen; spells, rituals and complex forms
  // past the free ones only with the optional rule (karmaSpellsAtCreation, off as Commlink6 has it). Lifepath, point
  // buy and the Karma build buy them by their own rules (SWC pp. 30–32).
  { code: 'magic.karmaAtCreation', severity: 'error', tab: 'magic', check: c => {
    if (!usesLetters(c.p) || flag(c.cr, 'karmaSpellsAtCreation')) return null
    const { spells, forms } = extraMagic(c.b, c.data, c.cr, c.p), n = spells + forms
    return n ? { message: `${n} ${spells ? 'spell' : 'complex form'}${n === 1 ? '' : 's'} past the free ones: buying them with the customization Karma is an optional rule, off.`, ...CRB(66) } : null
  } },
  // CRB p. 167: some metamagics are for adepts only (the catalog's user: an adept or mystic adept; a magician's, a
  // magician or mystic adept)
  { code: 'magic.metamagicUser', severity: 'error', tab: 'magic', check: c =>
    c.b.picks.filter(x => x.kind === 'metamagics' && !metamagicFits(c.b.magic, c.data.metamagics[x.id]?.user)).map(x => ({
      path: `magic.${x.uid}`, message: `${pickName(c, x)} is for ${c.data.metamagics[x.id]!.user === 'adept' ? 'adepts' : 'magicians'} only, not ${article(kindLabel(c.b)).toLowerCase()} ${kindLabel(c.b)}.`,
      ...entryCite(c.data.entry('metamagics', x.id)) })) },
  // CRB p. 167: each initiation grade brings one metamagic (one taken again, a level each)
  { code: 'magic.metamagicCount', severity: 'error', tab: 'magic', check: c => {
    const n = c.b.picks.filter(x => x.kind === 'metamagics').reduce((t, x) => t + (x.level ?? 1), 0)
    return n > c.b.initiation ? { message: `${n} metamagic${n === 1 ? '' : 's'} at initiation grade ${c.b.initiation}: each grade brings one.` } : null
  } },
  { code: 'adept.ppBudget', severity: 'error', tab: 'magic', check: c => {
    if (!MAGIC_KINDS[c.b.magic].powers)
      return c.b.picks.some(x => x.kind === 'adeptpowers') ? { message: `${article(kindLabel(c.b))} ${kindLabel(c.b)} can’t have adept powers.`, ...CRB(67) } : null
    return over(c.budgets.powerPoints, 'Power points')
  } },
  { code: 'adept.ppCap', severity: 'error', tab: 'magic', check: c => {
    const cap = c.budgets.powerPoints.cap
    return !MAGIC_KINDS[c.b.magic].paysPowers || c.b.method === 'pointbuy' || c.b.powerPointsBought <= cap ? null
      : { message: `${c.b.powerPointsBought} power points bought; the most is the Magic rating, ${cap}.` }
  } },

  { code: 'contact.budget', severity: 'error', tab: 'contacts',
    setting: c => [c.p.contactPoints ? 'lifepath.contactRatingCap' : 'contactPointsPerCha'],
    check: c => over(c.budgets.contactPoints, 'Contact points') },
  { code: 'contact.ratingCap', severity: 'error', tab: 'contacts', check: c => {
    const cap = c.budgets.contactPoints.ratingCap
    return c.b.contacts.filter(x => x.connection > cap || x.loyalty > cap)
      .map(x => ({ path: `contacts.${x.uid}`, message: `${x.name || 'A contact'}’s connection or loyalty is above ${cap}.` }))
  } },
  // SWC p. 31: karma buys contact ratings only up to Charisma: what a contact has above it must come from the points
  { code: 'contact.karmaCap', severity: 'error', tab: 'contacts', setting: c => (c.p.contactPools ? ['lifepath.contactKarma'] : []), check: c => {
    if (!c.p.contactPools || num(c.cr, 'lifepath.contactKarma') === undefined) return null
    const cha = augmentedRating(c.b, c.data, 'cha', c.p)
    const above = c.b.contacts.map(x => ({ x, types: x.types ?? [], need: Math.max(0, x.connection - cha) + Math.max(0, x.loyalty - cha) }))
    if (!uncovered(c.p.contactPools(c.b), above)) return null
    const names = above.filter(a => a.need).map(a => a.x.name || 'a contact').join(', ')
    return { message: `Karma can’t raise a contact’s connection or loyalty above your Charisma (${cha}): the contact points don’t cover ${names} above it.` }
  } },
  { code: 'knowledge.budget', severity: 'error', tab: 'skills', setting: c => (c.p.knowledgePoints ? [] : ['knowledgePerLog']),
    check: c => over(c.budgets.knowledgePoints, 'Knowledge points') },

  { code: 'pointbuy.overspent', severity: 'error', tab: 'method', setting: c => (c.budgets.characterPoints ? ['pointBuy.total'] : []),
    check: c => (c.budgets.characterPoints ? over(c.budgets.characterPoints, 'Character points') : null) },
  { code: 'pointbuy.unspent', severity: 'error', tab: 'method', setting: c => (c.budgets.characterPoints ? ['pointBuy.total'] : []),
    check: c => {
      const left = c.budgets.characterPoints?.left ?? 0
      return left > 0 ? { message: `${left} character points left: spend them all.` } : null
    } },
  { code: 'pointbuy.poolCap', severity: 'error', tab: 'method',
    setting: c => (c.p.id === 'pointbuy' ? ['pointBuy.max.attribute', 'pointBuy.max.skill', 'pointBuy.max.adjustment', 'pointBuy.max.nuyen', 'pointBuy.nuyenPerCp'] : []),
    check: c => {
      if (c.p.id !== 'pointbuy') return null
      const hits: Hit[] = (['attribute', 'skill', 'adjustment'] as const).filter(k => c.b.cp[k] > n0(c.cr, `pointBuy.max.${k}`))
        .map(k => ({ message: `${c.b.cp[k]} character points in ${k} points; the most is ${n0(c.cr, `pointBuy.max.${k}`)}.` }))
      const nuyen = c.b.cp.resources * n0(c.cr, 'pointBuy.nuyenPerCp'), maxN = n0(c.cr, 'pointBuy.max.nuyen')
      if (nuyen > maxN) hits.push({ message: `${fmt(nuyen)}¥ bought with character points; the most is ${fmt(maxN)}¥.` })
      return hits
    } },
  { code: 'pointbuy.oneSpecialization', severity: 'error', tab: 'skills', setting: c => (c.p.id === 'pointbuy' ? ['pointBuy.oneSpecialization'] : []),
    check: c => {
      const count = c.b.skills.filter(s => s.spec).length
      return c.p.id !== 'pointbuy' || !flag(c.cr, 'pointBuy.oneSpecialization') || count <= 1 ? null
        : { message: `Only one specialization in point buy (${count} taken).` }
    } },

  { code: 'lifepath.moduleCount', severity: 'error', tab: 'method', setting: c => (c.p.id === 'lifepath' ? ['lifepath.moduleCount'] : []),
    check: c => {
      const need = n0(c.cr, 'lifepath.moduleCount'), have = c.b.lifepath.length
      return c.p.id !== 'lifepath' || have === need ? null : { message: `${have} adult life modules taken; take ${need}.` }
    } },
  // optional settings (unset: the rule is off, no unset warning)
  { code: 'lifepath.repeat', severity: 'error', tab: 'method', check: c => {
    if (c.p.id !== 'lifepath') return null
    const times = new Map<string, number>()
    for (const pk of c.b.lifepath) times.set(pk.id, (times.get(pk.id) ?? 0) + 1)
    const twice = [...times].filter(([, t]) => t > 1), most = num(c.cr, 'lifepath.repeatModules') ?? 0
    const name = (id: string) => c.data.lifemodules[id]?.name ?? id
    if (twice.some(([, t]) => t > 2) || twice.length > most)
      return { message: `${twice.map(([id, t]) => `${name(id)} (${t} times)`).join(', ')}: ${most === 0 ? 'no module may be taken twice'
        : `${most === 1 ? 'one module' : `${most} modules`} may be taken twice, none more`}.`, ...cite(c.cr, 'lifepath.repeatModules') }
    return null
  } },
  { code: 'lifepath.bestAttr', severity: 'error', tab: 'method', check: c => {
    const bonus = num(c.cr, 'lifepath.bestAttributeBonus')
    if (c.p.id !== 'lifepath' || !bonus) return null
    if (!c.b.bestAttr) return { message: `Pick the best attribute (it goes up by ${bonus}).`, ...cite(c.cr, 'lifepath.bestAttributeBonus') }
    const used = c.p.attributeBonus?.(c.b, c.b.bestAttr) ?? 0
    return used < bonus && (!c.b.bestExtra || c.b.bestExtra === c.b.bestAttr)
      ? { message: `${A(c.b.bestAttr)} reaches its maximum: pick the attribute that takes the other ${bonus - used}.`, ...cite(c.cr, 'lifepath.bestAttributeBonus') }
      : null
  } },
  { code: 'lifepath.mixedChoices', severity: 'error', tab: 'method', check: c => (c.p.id !== 'lifepath' ? null : c.b.lifepath.flatMap(pk => {
    const m = c.data.lifemodules[pk.id]
    return m && m.choices.some((_, i) => !pk.choices[i])
      ? [{ path: `method.${pk.id}`, message: `${m.name}: pick where its choice goes.`, ...entryCite(c.data.entry('lifemodules', pk.id)) }] : []
  })) },

  // an adult module printed for an awakened, emerged, adept or magician runner (`( Awakened only )`), taken by another
  { code: 'lifepath.requires', severity: 'error', tab: 'method', check: c => (c.p.available?.(c.b) ?? []).filter(m => m.taken && !m.fits).map(m => ({
    path: `method.${m.id}`, message: `${m.name} is for ${article(m.requires!).toLowerCase()} ${m.requires} runner, not ${article(kindLabel(c.b)).toLowerCase()} ${kindLabel(c.b)}.`,
    ...entryCite(c.data.entry('lifemodules', m.id)) })) },

  // optional: unset, no limit (and no unset warning)
  { code: 'leftover.karma', severity: 'warning', tab: 'review', check: c => {
    const most = num(c.cr, 'maxKarmaLeft')
    return most === undefined || c.budgets.karma.left <= most ? null
      : { message: `${c.budgets.karma.left} karma left; at most ${most} carries over.`, ...cite(c.cr, 'maxKarmaLeft') }
  } },
  { code: 'leftover.nuyen', severity: 'warning', tab: 'review', setting: ['maxNuyenLeft'], check: c =>
    (c.budgets.nuyen.left <= n0(c.cr, 'maxNuyenLeft') ? null
      : { message: `${fmt(c.budgets.nuyen.left)}¥ left; at most ${fmt(n0(c.cr, 'maxNuyenLeft'))}¥ carries over.` }) },

  // an older file's lifestyle on a runner with no SIN went on an unnamed placeholder (charxml.ts): a note, not a block
  { code: 'sin.placeholder', severity: 'warning', tab: 'contacts', check: c => c.b.sins.filter(s => s.placeholder).map(s => ({
    path: `contacts.sin.${s.uid}`, message: 'An unnamed SIN holds the lifestyle from an older file: give it a name, kind and rating '
      + '(once finalized: Ledger → Add or name a SIN), or move the lifestyle to a real or fake SIN and remove it.' })) },
  { code: 'catalog.missing', severity: 'error', tab: 'review', check: c => {
    const gone = (path: string, name: string): Hit => ({ path, message: `${name} is no longer in the catalog.` })
    const hits: Hit[] = []
    for (const s of c.b.skills) if (!c.data.skills[s.id]) hits.push(gone(`skills.${s.id}`, s.id))
    for (const q of c.b.qualities) if (!c.data.qualities[q.id]) hits.push(gone(`qualities.${q.uid}`, q.name ?? q.id))
    for (const x of c.b.picks) if (!c.data.entry(x.kind, x.id)) hits.push(gone(`magic.${x.uid}`, x.name ?? x.id))
    for (const m of c.b.martialArts) {
      if (!c.data.entry('martialarts', m.id)) hits.push(gone(`martial.${m.uid}`, m.name ?? m.id))
      for (const t of m.techniques) if (!c.data.entry('martialtechniques', t.id)) hits.push(gone(`martial.${m.uid}`, t.name ?? t.id))
    }
    for (const { x, path } of lines(c.b)) if (x.id && !c.data.entry(x.kind, x.id)) hits.push(gone(path, x.snapshot?.name ?? x.name ?? x.id))
    for (const s of c.b.sins) for (const l of s.lifestyles ?? [])
      if (!c.data.entry('lifestyles', l.id)) hits.push(gone(`contacts.lifestyle.${l.uid}`, l.id))
    for (const pk of c.b.lifepath) if (!c.data.lifemodules[pk.id]) hits.push(gone(`method.${pk.id}`, pk.id))
    return hits
  } },
  { code: 'catalog.bookValue', severity: 'warning', tab: 'gear', check: c => {
    const hits: Hit[] = []
    for (const { x, path } of lines(c.b)) {
      if (priced({ ...x, accessories: [] }, c.data, c.cr).ok) continue
      const e = entryOf(x, c.data)
      hits.push({ path, message: `${nameOf(c, x)}: a cost, Availability or Essence the app can’t read counts as 0.`, ...entryCite(e) })
    }
    return hits
  } },
  // what a formula had to assume (no rating given: worked out at rating 1…)
  { code: 'catalog.formula', severity: 'warning', tab: 'gear', check: c => {
    const hits: Hit[] = []
    for (const { x, path } of lines(c.b)) {
      const { notes } = priced({ ...x, accessories: [] }, c.data, c.cr)
      if (notes.length) hits.push({ path, message: `${nameOf(c, x)}: ${notes.join('; ')}.`, ...entryCite(entryOf(x, c.data)) })
    }
    return hits
  } },
  // an accessory whose category is for another kind of host (categories.ts: a cyberlimb's armor on a weapon): fitted
  // anyway, a prerequisite it lacks
  { code: 'catalog.accessoryHost', severity: 'error', tab: 'gear', check: c => c.b.purchases.flatMap(x => {
    const he = entryOf(x, c.data)
    return he ? x.accessories.flatMap(a => {
      const e = entryOf(a, c.data)
      return e && fitsHost(c.data.categories, e, he) === false ? [{ path: `${PURCHASE_TAB[x.kind]}.${x.uid}`,
        message: `${nameOf(c, a)} is for ${hostsOf(c.data.categories, e).join(' or ')}, not ${nameOf(c, x)}.`, ...entryCite(e) }] : []
    }) : []
  }) },
  // the accessories' bracketed capacity ([2], [Rating]) comes out of the host's capacity
  { code: 'catalog.capacity', severity: 'error', tab: 'gear', check: c => c.b.purchases.flatMap(x => {
    const he = entryOf(x, c.data), cap = capacityOf(he, ratingOf(x, he))
    if (cap === null || !x.accessories.length) return []
    const used = x.accessories.reduce((t, a) => { const e = entryOf(a, c.data); return t + capacityUsed(e, ratingOf(a, e)) }, 0)
    return used > cap ? [{ path: `${PURCHASE_TAB[x.kind]}.${x.uid}`,
      message: `${nameOf(c, x)}: its accessories take ${used} capacity; it has ${cap}.`, ...entryCite(he) }] : []
  }) },
  // a book sample keeps the numbers its stat block prints; where the rules give others, say so (the book isn't corrected)
  { code: 'sample.printed', severity: 'warning', tab: 'review', check: c => printedHits(c) },
]

/** "Initiative: the book prints 9(11) + 3D6; the rules give 9(12) + 3D6.": a book sample's printed attributes (natural
 *  and augmented), Essence, initiative, condition monitors and Defense Rating where the rules give others, cited to its page. */
function printedHits(c: Ctx): Hit[] {
  const pr = c.ch.printed
  if (!pr) return []
  const d = deriveSr6(c.data, c.cr, c.ch), hits: Hit[] = []
  // spaces aside, and `6(6)` (augmented as natural) read as `6`
  const same = (book: string, rules: string) => book.replace(/\s/g, '').replace(/^(\d+)\(\1\)/, '$1') === rules.replace(/\s/g, '')
  const say = (path: string, what: string, book: string | undefined, rules: string) => {
    if (book && !same(book, rules))
      hits.push({ path, message: `${what}: the book prints ${book}; the rules give ${rules}.`, source: pr.source, page: pr.page })
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
  for (const [k, v] of Object.entries(pr.values)) if (k.startsWith('natural:')) {
    const key = k.slice(8), [printedAs, plus] = v.split('|')
    if (key.startsWith('skill:')) {
      const id = key.slice(6), s = c.b.skills.find(x => x.id === id), name = c.data.skills[id]?.name ?? id
      if (s) hits.push({ path: `skills.${id}`, source: pr.source, page: pr.page, message: `The book prints ${name} ${printedAs}, an always-on bonus included: ${name} ${skillRank(s)} + ${plus}.` })
    } else if ((SR6_ATTRS as string[]).includes(key)) {
      const a = key as Sr6Attr
      hits.push({ path: `attributes.${a}`, source: pr.source, page: pr.page, message: `The book prints ${a.toUpperCase()} ${printedAs}, an always-on bonus included: ${a.toUpperCase()} ${d.attrs[a].natural} + ${plus}.` })
    }
  }
  // a level printed on a quality that has none (`Magic Resistance 2`): taken without it (owner, 2026-10-09), noted here
  for (const [k, v] of Object.entries(pr.values)) if (k.startsWith('level:')) {
    const id = k.slice(6), e = c.data.entry('qualities', id), q = c.b.qualities.find(x => x.id === id)
    if (e) hits.push({ path: q ? `qualities.${q.uid}` : 'qualities', source: e.source, page: e.page,
      message: `The book prints ${v}; ${entryLabel(e)} has no levels (${e.source} p.${e.page}), so it’s taken once.` })
  }
  return hits
}

/** quality.granted's hits: a granted-only quality with no quality offering its list (none), or more of a list than its
 *  offers allow. */
function granted(c: Ctx): (Hit & { none: boolean })[] {
  const offers = c.b.qualities.flatMap(q => c.data.qualities[q.id]?.choices ?? [])
  const hits: (Hit & { none: boolean })[] = [], taken: Record<string, number> = {}
  for (const q of c.b.qualities) {
    const v = c.data.qualities[q.id]
    if (!v?.granted || !v.category) continue
    taken[v.category] = (taken[v.category] ?? 0) + 1
    const room = offers.filter(o => o.category === v.category).reduce((t, o) => t + (o.max ?? o.count), 0)
    if (!room) hits.push({ none: true, path: `qualities.${q.uid}`, message: `${v.name} is granted only, by a quality offering a ${v.category}; the runner has none.`, ...entryCite(c.data.entry('qualities', q.id)) })
    else if (taken[v.category] > room) hits.push({ none: false, path: `qualities.${q.uid}`, message: `More than ${room} ${v.category} qualities taken.`, ...entryCite(c.data.entry('qualities', q.id)) })
  }
  return hits
}

/** The kind of the purchase line `uid` (augmentations when it's gone). */
const PURCHASE_KIND_OF = (ch: Sr6Character, uid: string) => ch.build.purchases.find(x => x.uid === uid)?.kind ?? 'augmentations'
const nameOf = (c: Ctx, x: Sr6Purchase) => { const e = entryOf(x, c.data); return e ? entryLabel(e) : x.name ?? x.id ?? 'Custom item' }

/** Every broken creation rule on `ch`, the catalog's own problems, and a warning per unset setting a rule needed; approved
 *  from the GM's overrides (code and path). */
export function validateSr6(data: Sr6Data, cr: CreationRules, ch: Sr6Character): Violation[] {
  const b = ch.build, p = makeProvider(b.method, data, cr)
  const c: Ctx = { data, cr, ch, b, p, budgets: allBudgets(b, data, cr, p) }
  const labels = new Map(expandKeys(data).map(k => [k.key, k.label]))
  const out: Violation[] = [], unset = new Set<string>()
  // a setting the runner turned off itself (Creation method tab) is no table setting left unset
  const off = new Set((ch.rules ?? []).filter(r => !r.value.trim()).map(r => r.key))
  for (const r of RULES) {
    const keys = typeof r.setting === 'function' ? r.setting(c) : r.setting ?? []
    const missing = keys.filter(k => !cr.has(k) && !off.has(k))
    if (keys.some(k => off.has(k) && !cr.has(k))) continue
    if (missing.length) {
      for (const k of missing) if (!unset.has(k)) {
        unset.add(k)
        out.push({ code: 'setting.unset', severity: 'warning', path: r.tab, message: `${labels.get(k) ?? k} isn’t set: Table setup → Creation rules.` })
      }
      continue
    }
    const hits = r.check(c)
    for (const h of hits === null ? [] : Array.isArray(hits) ? hits : [hits]) {
      const at = h.page ? { source: h.source, page: h.page } : keys[0] ? cite(cr, keys[0]) : {}
      out.push({ code: r.code, severity: r.severity, path: h.path ?? r.tab, message: h.message, ...at })
    }
  }
  out.push(...runnerRuleNotes(cr, ch, labels))
  // a printed line the owner's override file corrects (engine/samplefix.ts): a note, not the error the book's value gave
  for (const k of ch.corrections ?? []) {
    const e = c.data.entry(PURCHASE_KIND_OF(ch, k.path), k.item)
    out.push({ code: 'sample.corrected', severity: 'warning', path: `${PURCHASE_TAB[PURCHASE_KIND_OF(ch, k.path)]}.${k.path}`, source: k.source, page: k.page,
      message: `${e ? entryLabel(e) : k.item}: the book prints ${k.field} ${k.from}; corrected to ${k.to} by an override${k.note ? ` (${k.note})` : ''}.` })
  }
  // the catalog's own problems (data.ts), only for entries this runner uses (and the priority table): not every book's
  const used = JSON.stringify(ch.build)
  out.push(...data.problems.filter(v => v.path.startsWith('priorities.') || used.includes(`"${v.path.slice(v.path.indexOf('.') + 1)}"`)))
  const approved = new Set(ch.overrides.map(o => `${o.code}|${o.path}`))
  return out.map(v => (approved.has(`${v.code}|${v.path}`) ? { ...v, approved: true } : v))
}

/** Notes on the runner's own rules (creation.ts runnerRules): one a book sample was given because its numbers need it
 *  (assumed: the book doesn't say), and one its campaign locked, so the runner's choice is set aside. Never errors. */
function runnerRuleNotes(cr: CreationRules, ch: Sr6Character, labels: Map<string, string>): Violation[] {
  const name = (k: string) => labels.get(k) ?? k, out: Violation[] = []
  for (const r of ch.rules ?? []) {
    const s = cr.get(r.key)
    if (s?.lockedBy) out.push({ code: 'rules.locked', severity: 'warning', path: 'method', message: `${name(r.key)}: your choice is set aside; the campaign’s GM ${s.lockedBy} locked it.` })
    else if (r.assumed) out.push({ code: 'rules.assumed', severity: 'warning', path: 'method', ...(r.source ? { source: r.source } : {}), ...(r.page ? { page: r.page } : {}),
      message: `${name(r.key)}: ${r.value.trim() === '' || r.value === 'false' ? 'off' : r.value === 'true' ? 'on' : r.value}; assumed from the book’s numbers (the book doesn’t say).` })
  }
  return out
}

/** No error left that a GM hasn't approved (Anarchy's rule). */
export const canFinalizeSr6 = canFinalize
