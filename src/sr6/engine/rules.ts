// Creation rules, Review's checks (a port of SR6 Forge's rules.mjs): a table of checks over the build and its budgets.
// Each violation cites the creation setting it rests on (its source and page) or the catalog entry it's about; its path's
// first segment is the editor tab (attributes.bod, skills.<id>, qualities.<uid>, gear.<uid>…). A rule whose setting is
// unset is skipped and Review warns once per setting (setting.unset). Errors block Finalize unless a GM approves them.
import { canFinalize } from '../../engine/validate'
import type { Severity, Violation } from '../../model/types'
import { CORE_ATTRS, LETTERS, MAGIC_KIND_LABELS, SR6_ATTRS, type Sr6Attr, type Sr6Build, type Sr6Character, type Sr6Purchase } from '../model/character'
import { allBudgets, attrRating, entryOf, priced, PURCHASE_TAB, qualityKarma, ratingOf, skillRank, type Sr6Budgets } from './budgets'
import { cite, expandKeys, flag, num, str, type CreationRules } from './creation'
import { MAGIC_KINDS, picksFor, type Sr6Data } from './data'
import { deriveSr6 } from './derive'
import { makeProvider, uncovered, type Provider } from './providers'
import { ratingRange } from './values'
import { capacityOf, capacityUsed, entryLabel, hostsOf, fitsHost } from './categories'

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
const metaName = (c: Ctx) => c.data.metatypes[c.b.metatype]?.name ?? c.b.metatype
/** every purchase and accessory, with the path of the line it sits on */
function* lines(b: Sr6Build): Generator<{ x: Sr6Purchase; path: string }> {
  for (const x of b.purchases) {
    const path = `${PURCHASE_TAB[x.kind]}.${x.uid}`
    yield { x, path }
    for (const a of x.accessories) yield { x: a, path }
  }
}
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
      const r = attrRating(c.b, k, c.p), max = m.ranges[k as keyof typeof m.ranges][1]
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
    const at = CORE_ATTRS.filter(k => attrRating(c.b, k, c.p) >= m.ranges[k as keyof typeof m.ranges][1])
    return at.length <= 1 ? null : { message: `Only one attribute may be at its maximum (${at.map(A).join(', ')} are).` }
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
    const at = c.b.skills.filter(s => skillRank(s) >= cap).map(s => c.data.skills[s.id]?.name ?? s.id)
    return at.length <= 1 ? null : { message: `Only one skill may be at the highest rank, ${cap} (${at.join(', ')} are).`, ...cite(c.cr, 'oneSkillAtMax') }
  } },
  { code: 'skill.expertise', severity: 'error', tab: 'skills', check: c =>
    // CRB p. 65: no expertise at creation, unless the table gives an expertise its skill points
    (num(c.cr, 'skillPointsExpertise') !== undefined ? null : c.b.skills.filter(s => s.expertise)
      .map(s => ({ path: `skills.${s.id}`, message: `${c.data.skills[s.id]?.name ?? s.id} has an expertise: none can be taken at creation.` }))) },
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
    const count = c.b.qualities.filter(q => !q.free).length, cap = n0(c.cr, 'qualityMaxCount')
    return count <= cap ? null : { message: `${count} paid qualities; the most is ${cap}.` }
  } },
  { code: 'quality.level', severity: 'error', tab: 'qualities', check: c => c.b.qualities.flatMap(q => {
    const v = c.data.qualities[q.id], max = v?.perLevel ? v.maxLevel : 1
    return v && q.level > max ? [{ path: `qualities.${q.uid}`, message: `${v.name} level ${q.level} is above its highest level, ${max}.`,
      ...entryCite(c.data.entry('qualities', q.id)) }] : []
  }) },

  // a quality granted only (a Returned Soldier power): taken, a quality the runner has must offer its list, and no more
  // of the list than that quality's choices allow (the list's max, else the choice's count)
  { code: 'quality.granted', severity: 'warning', tab: 'qualities', check: c => {
    const offers = c.b.qualities.flatMap(q => c.data.qualities[q.id]?.choices ?? [])
    const hits: Hit[] = [], taken: Record<string, number> = {}
    for (const q of c.b.qualities) {
      const v = c.data.qualities[q.id]
      if (!v?.granted || !v.category) continue
      taken[v.category] = (taken[v.category] ?? 0) + 1
      const room = offers.filter(o => o.category === v.category).reduce((t, o) => t + (o.max ?? o.count), 0)
      if (!room) hits.push({ path: `qualities.${q.uid}`, message: `${v.name} is granted only, by a quality offering a ${v.category}; the runner has none.`, ...entryCite(c.data.entry('qualities', q.id)) })
      else if (taken[v.category] > room) hits.push({ path: `qualities.${q.uid}`, message: `More than ${room} ${v.category} qualities taken.`, ...entryCite(c.data.entry('qualities', q.id)) })
    }
    return hits
  } },

  { code: 'karma.overspent', severity: 'error', tab: 'review', check: c => over(c.budgets.karma, 'Karma') },
  { code: 'nuyen.overspent', severity: 'error', tab: 'gear', check: c => over(c.budgets.nuyen, 'Nuyen', '¥') },
  { code: 'gear.availCap', severity: 'error', tab: 'gear', setting: ['maxAvailability'], check: c => {
    const cap = n0(c.cr, 'maxAvailability'), hits: Hit[] = []
    for (const { x, path } of lines(c.b)) {
      const { avail } = priced({ ...x, accessories: [] }, c.data, c.cr)
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
  { code: 'essence.positive', severity: 'error', tab: 'augmentations', setting: ['essence'], check: c =>
    (c.budgets.essence.left > 0 ? null : { message: `Essence must stay above 0 (it is ${c.budgets.essence.left}).` }) },

  { code: 'magic.spellsAllowed', severity: 'error', tab: 'magic', check: c => {
    // adept powers are adept.ppBudget's
    const allowed = { ...picksFor(c.b.magic), adeptpowers: true }
    return c.b.picks.filter(x => !allowed[x.kind])
      .map(x => ({ path: `magic.${x.uid}`, message: `${article(kindLabel(c.b))} ${kindLabel(c.b)} can’t have ${pickName(c, x)}.` }))
  } },
  { code: 'adept.ppBudget', severity: 'error', tab: 'magic', check: c => {
    if (!MAGIC_KINDS[c.b.magic].powers)
      return c.b.picks.some(x => x.kind === 'adeptpowers') ? { message: `${article(kindLabel(c.b))} ${kindLabel(c.b)} can’t have adept powers.` } : null
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
    const cha = attrRating(c.b, 'cha', c.p)
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

  // optional: unset, no limit (and no unset warning)
  { code: 'leftover.karma', severity: 'warning', tab: 'review', check: c => {
    const most = num(c.cr, 'maxKarmaLeft')
    return most === undefined || c.budgets.karma.left <= most ? null
      : { message: `${c.budgets.karma.left} karma left; at most ${most} carries over.`, ...cite(c.cr, 'maxKarmaLeft') }
  } },
  { code: 'leftover.nuyen', severity: 'warning', tab: 'review', setting: ['maxNuyenLeft'], check: c =>
    (c.budgets.nuyen.left <= n0(c.cr, 'maxNuyenLeft') ? null
      : { message: `${fmt(c.budgets.nuyen.left)}¥ left; at most ${fmt(n0(c.cr, 'maxNuyenLeft'))}¥ carries over.` }) },

  { code: 'catalog.missing', severity: 'error', tab: 'review', check: c => {
    const gone = (path: string, name: string): Hit => ({ path, message: `${name} is no longer in the catalog.` })
    const hits: Hit[] = []
    for (const s of c.b.skills) if (!c.data.skills[s.id]) hits.push(gone(`skills.${s.id}`, s.id))
    for (const q of c.b.qualities) if (!c.data.qualities[q.id]) hits.push(gone(`qualities.${q.uid}`, q.name ?? q.id))
    for (const x of c.b.picks) if (!c.data.entry(x.kind, x.id)) hits.push(gone(`magic.${x.uid}`, x.name ?? x.id))
    for (const { x, path } of lines(c.b)) if (x.id && !c.data.entry(x.kind, x.id)) hits.push(gone(path, x.snapshot?.name ?? x.name ?? x.id))
    if (c.b.lifestyle && !c.data.entry('lifestyles', c.b.lifestyle.id)) hits.push(gone('contacts.lifestyle', c.b.lifestyle.id))
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
  // an accessory whose category is for another kind of host (categories.ts: a cyberlimb's armor on a weapon)
  { code: 'catalog.accessoryHost', severity: 'warning', tab: 'gear', check: c => c.b.purchases.flatMap(x => {
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
  for (const k of SR6_ATTRS) say(`attributes.${k}`, A(k), pr.values[k], pair(d.attrs[k].natural, d.attrs[k].augmented))
  if (Number(pr.values.ess) !== d.essence) say('augmentations', 'Essence', pr.values.ess, String(d.essence))
  // (a book printing one initiative number, `11 + 1D6`, prints the augmented one)
  const init = pr.values.init?.includes('(') ? pair(d.attrs.rea.natural + d.attrs.int.natural, d.initiative.base) : `${d.initiative.base}`
  if (d.initiative.dice !== null) say('review', 'Initiative', pr.values.init, `${init} + ${d.initiative.dice}D6`)
  if (d.monitors.physical !== null && d.monitors.stun !== null) say('review', 'Condition monitors', pr.values.cm, `${d.monitors.physical}/${d.monitors.stun}`)
  say('gear', 'Defense Rating', pr.values.dr, String(d.defenseRating))
  return hits
}

const nameOf = (c: Ctx, x: Sr6Purchase) => { const e = entryOf(x, c.data); return e ? entryLabel(e) : x.name ?? x.id ?? 'Custom item' }

/** Every broken creation rule on `ch`, the catalog's own problems, and a warning per unset setting a rule needed; approved
 *  from the GM's overrides (code and path). */
export function validateSr6(data: Sr6Data, cr: CreationRules, ch: Sr6Character): Violation[] {
  const b = ch.build, p = makeProvider(b.method, data, cr)
  const c: Ctx = { data, cr, ch, b, p, budgets: allBudgets(b, data, cr, p) }
  const labels = new Map(expandKeys(data).map(k => [k.key, k.label]))
  const out: Violation[] = [], unset = new Set<string>()
  for (const r of RULES) {
    const keys = typeof r.setting === 'function' ? r.setting(c) : r.setting ?? []
    const missing = keys.filter(k => !cr.has(k))
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
  // the catalog's own problems (data.ts), only for entries this runner uses (and the priority table): not every book's
  const used = JSON.stringify(ch.build)
  out.push(...data.problems.filter(v => v.path.startsWith('priorities.') || used.includes(`"${v.path.slice(v.path.indexOf('.') + 1)}"`)))
  const approved = new Set(ch.overrides.map(o => `${o.code}|${o.path}`))
  return out.map(v => (approved.has(`${v.code}|${v.path}`) ? { ...v, approved: true } : v))
}

/** No error left that a GM hasn't approved (Anarchy's rule). */
export const canFinalizeSr6 = canFinalize
