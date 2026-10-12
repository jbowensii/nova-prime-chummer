// Creation rules, Review's checks (a port of SR6 Forge's rules.mjs): a table of checks over the build and its budgets.
// Each violation cites the creation setting it rests on (its source and page) or the catalog entry it's about; its path's
// first segment is the editor tab (attributes.bod, skills.<id>, qualities.<uid>, gear.<uid>…). A rule whose setting is
// unset is skipped and Review warns once per setting (setting.unset). Errors block Finalize unless a GM approves them.
// A prerequisite the runner lacks is always an error, cited to the page that prints it (owner, 2026-10-09): the editor
// and the Ledger let it be taken, and the error stands until it's met or a GM approves it.
import { canFinalize } from '../../shared/rules'
import type { Severity, Violation } from '../../model/types'
import {
  CORE_ATTRS,
  CP_POOLS,
  LETTERS,
  MAGIC_KIND_LABELS,
  PICK_KINDS,
  PURCHASE_KINDS,
  SR6_ATTRS,
  type Sr6Attr,
  type Sr6Build,
  type Sr6Character,
  type Sr6Purchase,
} from '../model/character'
import {
  allBudgets,
  aptitudeSkills,
  augmentationSlot,
  dataStructureLevels,
  isFocus,
  magicCap,
  manySpecs,
  attrMax,
  attrRating,
  augmentedRating,
  entryOf,
  extraMagic,
  fitted,
  noteAttr,
  noteSkill,
  priced,
  PURCHASE_TAB,
  qualityChoice,
  qualityKarma,
  ratingOf,
  skillRank,
  type Sr6Budgets,
} from './budgets'
import { blockedBy, cite, conflictsOf, expandKeys, flag, isOn, isRunnerRuleKey, num, str, type CreationRules } from './creation'
import { MAGIC_KINDS, metamagicFits, picksFor, qualityFitsMetatype, type Sr6Data } from './data'
import { normName } from './names'
import { adeptBars, opposite } from './actions'
import type { Sr6Entry } from '../model/types'
import { deriveSr6 } from './derive'
import { makeProvider, uncovered, type Provider } from './providers'
import { ratingRange } from './values'
import { gradeFits, gradeKnown, gradeName } from './grades'
import { capacityOf, capacityUsed, entryLabel, hostsOf, fitsHost } from './categories'
import { MARTIAL_CITE, prerequisites, prerequisiteText, styleName, techniqueFits, techniqueName } from './martial'

interface Ctx {
  data: Sr6Data
  cr: CreationRules
  ch: Sr6Character
  b: Sr6Build
  p: Provider
  budgets: Sr6Budgets
}
/** A broken rule: where (default: the rule's tab), what, and its citation when it isn't the setting's. */
interface Hit {
  path?: string
  message: string
  source?: string
  page?: number
}
interface Rule {
  /** hard: no GM approval (owner's decision 19, 2026-10-11: negative Karma or nuyen blocks Finalize) */
  code: string
  severity: Severity
  tab: string
  hard?: true
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
const CRB_HK = (page: number) => ({ source: 'CRB-HK', page })
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
const has = (c: Ctx, key: string) => {
  const id = str(c.cr, key)
  return id && c.b.qualities.some(q => c.data.sameFamily('qualities', q.id, id)) ? 1 : 0
}
const pickName = (c: Ctx, x: Sr6Build['picks'][number]) => {
  const e = c.data.entry(x.kind, x.id)
  return e ? entryLabel(e) : (x.name ?? x.id)
}

const RULES: Rule[] = [
  {
    code: 'prio.allAssigned',
    severity: 'error',
    tab: 'method',
    check: c => (!usesLetters(c.p) || Object.values(c.b.priorities).every(Boolean) ? null : { message: 'Give each of the five priorities a letter.' }),
  },
  {
    code: 'prio.lettersValid',
    severity: 'error',
    tab: 'method',
    setting: c => (c.p.id === 'sumtoten' ? ['sumToTenTarget', ...LETTERS.map(l => `letterValue:${l}`)] : []),
    check: c => {
      if (c.p.lettersValid(c.b.priorities)) return null
      // (a level of play's letters: the Sixth World Companion's street-level B C C D E, elite A B B C D, pp. 14–15)
      const want = str(c.cr, 'priorityLetters'),
        at = want ? cite(c.cr, 'priorityLetters') : {}
      return {
        ...at,
        message:
          c.p.id === 'sumtoten'
            ? `The priority letters’ values add up to more than ${n0(c.cr, 'sumToTenTarget')}, or a priority has no letter${want ? ` or one of ${[...new Set(want)].join(', ')}` : ''}.`
            : want
              ? `The five priorities take the letters ${want.split('').join(', ')}, one each.`
              : 'Each letter A–E goes to exactly one priority.',
      }
    },
  },
  {
    code: 'prio.metatypeAllowed',
    severity: 'error',
    tab: 'method',
    check: c => {
      if (!c.b.metatype) return { message: 'Pick a metatype.' }
      if (c.p.legalMetatypes(c.b).some(m => m.id === c.b.metatype)) return null
      return {
        message: usesLetters(c.p)
          ? `${metaName(c)} isn’t available at metatype priority ${c.b.priorities.metatype ?? '(none)'}.`
          : `${metaName(c)} isn’t a metatype in the catalog.`,
      }
    },
  },
  {
    code: 'prio.magicAllowed',
    severity: 'error',
    tab: 'method',
    check: c =>
      c.p.legalMagic(c.b).some(m => m.kind === c.b.magic)
        ? null
        : { message: `${MAGIC_KIND_LABELS[c.b.magic]} isn’t available at magic priority ${c.b.priorities.magic ?? '(none)'}.` },
  },

  { code: 'attr.overspent', severity: 'error', tab: 'attributes', check: c => over(c.budgets.attributePoints, 'Attribute points') },
  { code: 'adjust.overspent', severity: 'error', tab: 'attributes', check: c => over(c.budgets.adjustmentPoints, 'Adjustment points') },
  {
    code: 'attr.creationMax',
    severity: 'error',
    tab: 'attributes',
    check: c => {
      const m = c.data.metatypes[c.b.metatype]
      if (!m) return null
      return [...CORE_ATTRS, 'edg' as const].flatMap(k => {
        const r = attrRating(c.b, k, c.p),
          max = attrMax(c.data, c.cr, c.b, k)!
        return r > max
          ? [
              {
                path: `attributes.${k}`,
                message: `${A(k)} ${r} is above ${m.name}’s maximum of ${max}.`,
                source: c.data.entry('metatypes', m.id)?.source,
                page: m.page,
              },
            ]
          : []
      })
    },
  },
  // CRB Hong Kong p. 65: 6 at creation; with the option magicAboveSixByGrade, plus the grade (p. 167)
  {
    code: 'attr.specialMax',
    severity: 'error',
    tab: 'attributes',
    setting: ['magicMax'],
    check: c =>
      (['mag', 'res'] as const).flatMap(k => {
        const r = attrRating(c.b, k, c.p),
          max = magicCap(c.b, c.cr, k) ?? 0
        return r > max
          ? [
              {
                path: `attributes.${k}`,
                message: `${A(k)} ${r} is above the highest Magic or Resonance, ${max}.`,
                ...(max > n0(c.cr, 'magicMax') ? cite(c.cr, 'magicAboveSixByGrade') : {}),
              },
            ]
          : []
      }),
  },
  {
    code: 'attr.oneAtMax',
    severity: 'error',
    tab: 'attributes',
    setting: ['oneAttributeAtMax'],
    check: c => {
      const m = c.data.metatypes[c.b.metatype]
      if (!m || !flag(c.cr, 'oneAttributeAtMax')) return null
      const at = CORE_ATTRS.filter(k => attrRating(c.b, k, c.p) >= attrMax(c.data, c.cr, c.b, k)!),
        most = 1 + has(c, 'manyTalentsQuality')
      return at.length <= most
        ? null
        : {
            message:
              most > 1
                ? `Only ${most} attributes may be at their maximum (${at.map(A).join(', ')} are).`
                : `Only one attribute may be at its maximum (${at.map(A).join(', ')} are).`,
          }
    },
  },
  {
    code: 'attr.adjustTargets',
    severity: 'error',
    tab: 'attributes',
    setting: ['attributeBaseMax'],
    check: c => {
      // Edge, Magic and Resonance always take adjustment points; a core attribute only when the metatype raises its maximum
      // (the house rule adjustOnLoweredMax, owner's decision 16: on a lowered maximum too)
      const m = c.data.metatypes[c.b.metatype],
        base = n0(c.cr, 'attributeBaseMax'),
        lowered = !!flag(c.cr, 'adjustOnLoweredMax')
      if (!m) return null
      const max = (k: Sr6Attr) => m.ranges[k as keyof typeof m.ranges][1]
      return CORE_ATTRS.filter(k => c.b.attributes[k].adjust > 0 && max(k) <= base && !(lowered && max(k) < base)).map(k => ({
        path: `attributes.${k}`,
        message: `Adjustment points can’t go on ${A(k)}: ${m.name}’s ${A(k)} maximum isn’t ${lowered ? 'raised or lowered' : 'raised'}.`,
      }))
    },
  },

  { code: 'skill.overspent', severity: 'error', tab: 'skills', check: c => over(c.budgets.skillPoints, 'Skill points') },
  {
    code: 'skill.cap',
    severity: 'error',
    tab: 'skills',
    setting: ['skillCap'],
    check: c => {
      // CRB Hong Kong p. 70: Aptitude raises the starting maximum of the selected skill (the one its note names); one
      // whose note names none lets any one skill go higher (quality.choice asks for the skill)
      const capBase = n0(c.cr, 'skillCap'),
        aptCap = num(c.cr, 'skillCapAptitude'),
        named = aptitudeSkills(c.data, c.cr, c.b)
      const aptitude = !!named && aptCap !== undefined,
        anyOne = aptitude && named!.length < c.b.qualities.filter(q => q.id === str(c.cr, 'aptitudeQuality')).length
      const cap = (id: string) => (aptitude && (anyOne || named!.includes(id)) ? aptCap! : capBase)
      const name = (id: string) => c.data.skills[id]?.name ?? id
      const hits: Hit[] = c.b.skills
        .filter(s => skillRank(s) > cap(s.id))
        .map(s => ({ path: `skills.${s.id}`, message: `${name(s.id)} rank ${skillRank(s)} is above the cap of ${cap(s.id)}.` }))
      const above = c.b.skills.filter(s => skillRank(s) > capBase && !named?.includes(s.id))
      if (aptitude && anyOne && above.length > 1) hits.push({ message: `Only one skill may be above ${capBase}.` })
      return hits
    },
  },
  // CRB Hong Kong p. 65: one specialization a skill, but Exotic Weapons (p. 95) or with the Sixth World Companion's
  // Expanded Specializations (p. 153, expandedSpecializations)
  {
    code: 'skill.oneSpec',
    severity: 'error',
    tab: 'skills',
    check: c =>
      c.b.skills
        .filter(s => s.specs?.length && !manySpecs(c.data, c.cr, s.id))
        .map(s => ({
          path: `skills.${s.id}`,
          message: `${c.data.skills[s.id]?.name ?? s.id} has ${1 + s.specs!.length} specializations: one a skill.`,
          ...CRB(65),
        })),
  },
  // CRB Hong Kong p. 95: Exotic Weapons needs a specialization to be used, and takes no expertise
  {
    code: 'skill.exotic',
    severity: 'error',
    tab: 'skills',
    check: c =>
      c.b.skills.flatMap(s => {
        const v = c.data.skills[s.id]
        if (!v || normName(v.name) !== 'exotic weapons') return []
        return [
          ...(skillRank(s) > 0 && !s.spec && !s.specs?.length
            ? [
                {
                  path: `skills.${s.id}`,
                  message: `${v.name} has ranks but no specialization: it is used only with the weapons it has one for.`,
                  ...entryCite(c.data.entry('skills', s.id)),
                },
              ]
            : []),
          ...(s.expertise ? [{ path: `skills.${s.id}`, message: `${v.name} takes no expertise.`, ...entryCite(c.data.entry('skills', s.id)) }] : []),
        ]
      }),
  },
  // the Sixth World Companion's Alternate Mystic Adept (p. 148): no conjuring or enchanting
  {
    code: 'magic.alternateMysticAdept',
    severity: 'error',
    tab: 'skills',
    check: c =>
      !flag(c.cr, 'alternateMysticAdept') || c.b.magic !== 'mystic-adept'
        ? []
        : c.b.skills
            .filter(s => skillRank(s) > 0 && ['conjuring', 'enchanting'].includes(normName(c.data.skills[s.id]?.name ?? '')))
            .map(s => ({
              path: `skills.${s.id}`,
              message: `An alternate mystic adept has no ${c.data.skills[s.id]!.name}.`,
              ...cite(c.cr, 'alternateMysticAdept'),
            })),
  },
  // CRB Hong Kong p. 93: Astral is for full and aspected magicians, and adepts and mystic adepts with Astral Perception
  {
    code: 'skill.astral',
    severity: 'error',
    tab: 'skills',
    check: c => {
      const s = c.b.skills.find(x => normName(c.data.skills[x.id]?.name ?? '') === 'astral' && skillRank(x) > 0),
        k = MAGIC_KINDS[c.b.magic]
      if (!s || !k.powers || (k.spells && c.b.magic !== 'mystic-adept')) return null
      const perception = c.b.picks.some(x => x.kind === 'adeptpowers' && normName(c.data.entry(x.kind, x.id)?.name ?? x.name ?? '') === 'astral perception')
      return perception
        ? null
        : {
            path: `skills.${s.id}`,
            message: `An ${kindLabel(c.b)} uses Astral only with the Astral Perception power.`,
            ...entryCite(c.data.entry('skills', s.id)),
          }
    },
  },
  // CRB Hong Kong pp. 67, 99: one Native language; a language is advanced to Expert at most (languageMax)
  {
    code: 'knowledge.languages',
    severity: 'error',
    tab: 'skills',
    check: c => {
      const langs = c.b.knowledge.filter(k => k.kind === 'language'),
        most = num(c.cr, 'languageMax'),
        hits: Hit[] = []
      if (langs.filter(k => k.native).length > 1) hits.push({ message: `${langs.filter(k => k.native).length} native languages: only one.`, ...CRB(67) })
      if (most !== undefined)
        for (const k of langs)
          if (!k.native && k.points + k.karma > most)
            hits.push({
              path: `skills.${k.uid}`,
              message: `${k.name} at level ${k.points + k.karma}: a language goes to ${most} at most (the Native one counts as ${most}).`,
              ...cite(c.cr, 'languageMax'),
            })
      return hits
    },
  },
  // CRB Hong Kong pp. 76–77: no ranks in the skill an Incompetent quality names; not for a Magic skill without Magic,
  // nor Tasking without Resonance; that skill selected once
  {
    code: 'skill.incompetent',
    severity: 'error',
    tab: 'skills',
    setting: c => (c.b.qualities.some(q => q.id === str(c.cr, 'incompetentQuality')) ? ['incompetentQuality'] : []),
    check: c => {
      const id = str(c.cr, 'incompetentQuality'),
        k = MAGIC_KINDS[c.b.magic],
        hits: Hit[] = []
      for (const q of c.b.qualities.filter(x => x.id === id)) {
        const sk = noteSkill(c.data, q.note),
          v = sk ? c.data.skills[sk] : undefined,
          s = c.b.skills.find(x => x.id === sk)
        if (!v) continue
        if (s && skillRank(s) > 0)
          hits.push({ path: `skills.${v.id}`, message: `${v.name} has ${skillRank(s)} rank${skillRank(s) === 1 ? '' : 's'}: the runner is Incompetent in it.` })
        if ((v.attr === 'mag' && !(k.spells || k.powers)) || (v.attr === 'res' && !k.resonance))
          hits.push({
            path: `qualities.${q.uid}`,
            message: `Incompetent in ${v.name}: not for a skill the runner has no ${v.attr === 'res' ? 'Resonance' : 'Magic'} to use.`,
          })
      }
      return hits
    },
  },
  {
    code: 'skill.oneAtMax',
    severity: 'error',
    tab: 'skills',
    check: c => {
      // CRB p. 65: only one skill at the highest rank (with the aptitude quality, that one may go one higher)
      const cap = num(c.cr, 'skillCap')
      if (!flag(c.cr, 'oneSkillAtMax') || cap === undefined) return null
      const at = c.b.skills.filter(s => skillRank(s) >= cap).map(s => c.data.skills[s.id]?.name ?? s.id),
        most = 1 + has(c, 'manySkillsQuality')
      return at.length <= most
        ? null
        : {
            message: `Only ${most > 1 ? most : 'one'} skill${most > 1 ? 's' : ''} may be at the highest rank, ${cap} (${at.join(', ')} are).`,
            ...cite(c.cr, 'oneSkillAtMax'),
          }
    },
  },
  // (owner, 2026-10-09) an expertise may be bought at creation with the customization karma (CRB p. 66, step four, at
  // p. 68's price: budgets.ts skillSpend): no blanket error; its prerequisites are the two below
  // CRB p. 93: a specialization (or an expertise) is attached to a skill the runner has a rank in
  {
    code: 'skill.specUntrained',
    severity: 'error',
    tab: 'skills',
    check: c =>
      c.b.skills
        .filter(s => skillRank(s) < 1 && (s.spec || s.expertise))
        .map(s => ({
          path: `skills.${s.id}`,
          message: `${c.data.skills[s.id]?.name ?? s.id} has ${s.spec ? 'a specialization' : 'an expertise'} but no rank.`,
          ...CRB(93),
        })),
  },
  // CRB p. 68: an expertise needs a specialization in its area first (p. 92: the specialization is turned into it)
  {
    code: 'skill.expertiseSpec',
    severity: 'error',
    tab: 'skills',
    check: c =>
      c.b.skills
        .filter(s => s.expertise && !s.spec)
        .map(s => ({
          path: `skills.${s.id}`,
          message: `${c.data.skills[s.id]?.name ?? s.id} has an expertise but no specialization: an expertise needs one first.`,
          ...CRB(68),
        })),
  },
  // CRB p. 68: an expertise needs a skill rank of advance.expertiseRank (optional: unset, no minimum and no unset warning)
  {
    code: 'skill.expertiseRank',
    severity: 'error',
    tab: 'skills',
    check: c => {
      const need = num(c.cr, 'advance.expertiseRank')
      return need === undefined
        ? null
        : c.b.skills
            .filter(s => s.expertise && skillRank(s) < need)
            .map(s => ({
              path: `skills.${s.id}`,
              message: `${c.data.skills[s.id]?.name ?? s.id} has an expertise at rank ${skillRank(s)}: an expertise needs rank ${need}.`,
              ...cite(c.cr, 'advance.expertiseRank'),
            }))
    },
  },
  {
    code: 'skill.restricted',
    severity: 'error',
    tab: 'skills',
    check: c => {
      // R: a skill on Magic needs an awakened kind (an aspected magician picks one); one on Resonance an emerged one
      const k = MAGIC_KINDS[c.b.magic]
      return c.b.skills
        .filter(s => skillRank(s) > 0)
        .flatMap(s => {
          const v = c.data.skills[s.id]
          if (!v) return []
          // (owner's decision 3: a pure adept takes no Sorcery, Conjuring or Enchanting)
          const bad =
            v.attr === 'mag'
              ? !(k.spells || k.powers) || (c.b.magic === 'aspected' && s.id !== c.b.aspectedSkill) || adeptBars(c.b, c.data, s.id)
              : v.attr === 'res'
                ? !k.resonance
                : false
          return bad
            ? [
                {
                  path: `skills.${s.id}`,
                  message:
                    c.b.magic === 'aspected' && v.attr === 'mag'
                      ? `An aspected magician uses one Magic skill; ${v.name} isn’t the one picked.`
                      : `${article(kindLabel(c.b))} ${kindLabel(c.b)} can’t use ${v.name}.`,
                },
              ]
            : []
        })
    },
  },

  {
    code: 'quality.netBonusCap',
    severity: 'error',
    tab: 'qualities',
    setting: ['qualityNetBonusCap'],
    check: c => {
      const { pos, neg } = qualityKarma(c.b, c.data, c.cr),
        cap = n0(c.cr, 'qualityNetBonusCap')
      return neg - pos <= cap ? null : { message: `Negative qualities give ${neg - pos} karma more than positive ones cost; the most is ${cap}.` }
    },
  },
  {
    code: 'quality.maxCount',
    severity: 'error',
    tab: 'qualities',
    setting: ['qualityMaxCount'],
    check: c => {
      // (a quality whose text says it doesn't count toward the six: Lofwyr's Legions p. 16's drake qualities)
      const count = c.b.qualities.filter(q => !q.free && !c.data.qualities[q.id]?.uncounted).length,
        cap = n0(c.cr, 'qualityMaxCount')
      return count <= cap ? null : { message: `${count} paid qualities; the most is ${cap}.` }
    },
  },
  // CRB Hong Kong pp. 70–77: a quality naming its choice (`Aptitude (Skill)`, `Exceptional (Attribute)`) is for the skill or
  // attribute selected: its note names it
  {
    code: 'quality.choice',
    severity: 'error',
    tab: 'qualities',
    check: c =>
      c.b.qualities.flatMap(q => {
        const v = c.data.qualities[q.id],
          want = qualityChoice(v?.name)
        if (!v || !want || (want === 'attribute' ? noteAttr(q.note) : noteSkill(c.data, q.note))) return []
        return [{ path: `qualities.${q.uid}`, message: `${v.name}: name the ${want} it is for in its note.`, ...entryCite(c.data.entry('qualities', q.id)) }]
      }),
  },
  // CRB Hong Kong p. 71: Exceptional once per attribute; p. 77: Incompetent's skill selected once
  {
    code: 'quality.choiceTwice',
    severity: 'error',
    tab: 'qualities',
    check: c =>
      (['exceptionalQuality', 'incompetentQuality'] as const).flatMap(key => {
        const id = str(c.cr, key),
          seen = new Set<string>(),
          hits: Hit[] = []
        for (const q of c.b.qualities.filter(x => x.id === id)) {
          const choice = key === 'exceptionalQuality' ? noteAttr(q.note) : noteSkill(c.data, q.note)
          if (!choice) continue
          if (seen.has(choice))
            hits.push({
              path: `qualities.${q.uid}`,
              message: `${c.data.qualities[id!]?.name ?? id} is taken twice for ${key === 'exceptionalQuality' ? choice.toUpperCase() : (c.data.skills[choice]?.name ?? choice)}: once each.`,
              ...cite(c.cr, key),
            })
          seen.add(choice)
        }
        return hits
      }),
  },
  // CRB Hong Kong p. 78: Sensitive System can't be had with a Magic or Resonance rating
  {
    code: 'quality.sensitiveSystem',
    severity: 'error',
    tab: 'qualities',
    check: c => {
      const id = str(c.cr, 'sensitiveSystemQuality'),
        q = c.b.qualities.find(x => x.id === id)
      return q && c.b.magic !== 'mundane'
        ? {
            path: `qualities.${q.uid}`,
            message: `${c.data.qualities[id!]?.name ?? 'Sensitive System'}: not with a ${MAGIC_KINDS[c.b.magic].resonance ? 'Resonance' : 'Magic'} rating.`,
            ...cite(c.cr, 'sensitiveSystemQuality'),
          }
        : null
    },
  },
  // owner's decision 2 (2026-10-11): Aptitude and Incompetent never on the same skill; the editor refuses it, a file
  // may still hold it
  {
    code: 'quality.aptitudeIncompetent',
    severity: 'error',
    tab: 'qualities',
    check: c =>
      c.b.qualities
        .filter(q => q.id === str(c.cr, 'incompetentQuality') && opposite(c.b, c.data, c.cr, q.id, q.note ?? '', q.uid))
        .map(q => ({ path: `qualities.${q.uid}`, message: `${c.data.skills[noteSkill(c.data, q.note)!]?.name}: Aptitude and Incompetent on the same skill.` })),
  },
  // owner's decision 4: a poser quality only for the metatypes its description names (the editor offers no other)
  {
    code: 'quality.metatype',
    severity: 'error',
    tab: 'qualities',
    check: c =>
      c.b.qualities
        .filter(q => !q.free && c.b.metatype && !qualityFitsMetatype(c.data, c.b.metatype, q.id))
        .map(q => ({
          path: `qualities.${q.uid}`,
          message: `${c.data.qualities[q.id]!.name} is for ${c.data.qualities[q.id]!.metatypes!.join(' or ')} runners, not ${metaName(c).toLowerCase()}.`,
          ...entryCite(c.data.entry('qualities', q.id)),
        })),
  },
  {
    code: 'quality.level',
    severity: 'error',
    tab: 'qualities',
    check: c =>
      c.b.qualities.flatMap(q => {
        const v = c.data.qualities[q.id],
          max = v?.perLevel ? v.maxLevel : 1
        return v && q.level > max
          ? [
              {
                path: `qualities.${q.uid}`,
                message: `${v.name} level ${q.level} is above its highest level, ${max}.`,
                ...entryCite(c.data.entry('qualities', q.id)),
              },
            ]
          : []
      }),
  },

  // a quality granted only (a Returned Soldier power): taken, a quality the runner has must offer its list (a
  // prerequisite: an error), and no more of the list than that quality's choices allow (the list's max, else the
  // choice's count: a warning)
  { code: 'quality.granted', severity: 'error', tab: 'qualities', check: c => granted(c).filter(h => h.none) },
  { code: 'quality.grantedCount', severity: 'warning', tab: 'qualities', check: c => granted(c).filter(h => !h.none) },

  // martial arts (FS p. 97): their prices (set when the runner has a style), a style once, a technique once under any
  // style, and only of the style's categories, General or its signature
  {
    code: 'martial.price',
    severity: 'warning',
    tab: 'martial',
    setting: c => (c.b.martialArts.length ? ['karmaMartialArt', 'karmaTechnique'] : []),
    check: () => null,
  },
  {
    code: 'martial.duplicateStyle',
    severity: 'error',
    tab: 'martial',
    check: c =>
      c.b.martialArts
        .filter((m, i, all) => all.findIndex(x => x.id === m.id) !== i)
        .map(m => ({ path: `martial.${m.uid}`, message: `${styleName(c.data, m)} is taken twice: a style is learned once.`, ...MARTIAL_CITE })),
  },
  {
    code: 'martial.duplicateTechnique',
    severity: 'error',
    tab: 'martial',
    check: c => {
      const seen = new Set<string>(),
        hits: Hit[] = []
      for (const m of c.b.martialArts)
        for (const t of m.techniques) {
          if (seen.has(t.id))
            hits.push({
              path: `martial.${m.uid}`,
              message: `${techniqueName(c.data, t)} is learned twice: a technique is learned once, under any style.`,
              ...MARTIAL_CITE,
            })
          seen.add(t.id)
        }
      return hits
    },
  },
  {
    code: 'martial.category',
    severity: 'error',
    tab: 'martial',
    check: c =>
      c.b.martialArts.flatMap(m => {
        const style = c.data.entry('martialarts', m.id)
        return m.techniques.flatMap(t => {
          const e = c.data.entry('martialtechniques', t.id)
          return techniqueFits(style, e)
            ? []
            : [
                {
                  path: `martial.${m.uid}.${t.uid}`,
                  ...MARTIAL_CITE,
                  message: `${e!.name} is a ${e!.attrs.category.split(';')[0].trim()} technique; ${style!.name} teaches ${style!.attrs.categories} and General ones.`,
                },
              ]
        })
      }),
  },

  // a technique's printed prerequisite the runner lacks (FS p. 97: "certain techniques may have additional
  // restrictions"), an adept power, technique or quality; the augmentation one below. Errors (owner, 2026-10-09): taken
  // anyway, each stands until met or a GM approves it (one approval a technique: its path names it)
  {
    code: 'martial.requires',
    severity: 'error',
    tab: 'martial',
    check: c =>
      c.b.martialArts.flatMap(m =>
        m.techniques.flatMap(t =>
          prerequisites(c.data, c.b, c.data.entry('martialtechniques', t.id))
            .filter(p => p.met === false && p.kind !== 'augmentation')
            .map(p => ({
              path: `martial.${m.uid}.${t.uid}`,
              ...MARTIAL_CITE,
              message: `${techniqueName(c.data, t)} requires ${prerequisiteText(p)}, which the runner doesn’t have.`,
            })),
        ),
      ),
  },
  {
    code: 'martial.augmentation',
    severity: 'error',
    tab: 'martial',
    check: c =>
      c.b.martialArts.flatMap(m =>
        m.techniques.flatMap(t =>
          prerequisites(c.data, c.b, c.data.entry('martialtechniques', t.id))
            .filter(p => p.met === false && p.kind === 'augmentation')
            .map(p => ({
              path: `martial.${m.uid}.${t.uid}`,
              ...MARTIAL_CITE,
              message: `${techniqueName(c.data, t)} requires ${prerequisiteText(p)}, which the runner’s augmentations don’t include.`,
            })),
        ),
      ),
  },

  // a number the build can't hold below 0 (a hand-edited file): it would turn a cost into a refund and clear the hard
  // blocks below, so it is hard too (owner's decision 19)
  { code: 'value.negative', severity: 'error', tab: 'review', hard: true, check: c => negatives(c.b) },
  // owner's decision 19 (2026-10-11): negative Karma or nuyen is fine while building; Finalize waits until neither is
  { code: 'karma.overspent', severity: 'error', tab: 'review', hard: true, check: c => over(c.budgets.karma, 'Karma') },
  {
    code: 'nuyen.overspent',
    severity: 'error',
    tab: 'gear',
    hard: true,
    check: c => {
      const hit = over(c.budgets.nuyen, 'Nuyen', '¥'),
        size = c.budgets.nuyen.breakdown?.find(l => l.key === 'sizePricing')?.amount
      // a GM can't approve this one: name the table's house rule when it is part of the cost (metatypeSizePricing)
      return hit && size ? { message: `${hit.message.slice(0, -1)}; the house rule ‘size pricing’ adds ${fmt(size)}¥.` } : hit
    },
  },
  {
    code: 'gear.availCap',
    severity: 'error',
    tab: 'gear',
    setting: ['maxAvailability'],
    check: c => {
      // the Sixth World Companion's elite level (p. 15, levelSwcElite): no availability restrictions
      if (flag(c.cr, 'levelSwcElite')) return null
      // CRB first printing p. 66 (optional, availabilityCapIllegalOnly): the cap holds only illegal gear (Availability `(I)`)
      const cap = n0(c.cr, 'maxAvailability'),
        hits: Hit[] = [],
        illegalOnly = flag(c.cr, 'availabilityCapIllegalOnly')
      for (const { x, path } of lines(c.b)) {
        const { avail } = priced({ ...x, accessories: [] }, c.data, c.cr)
        if (illegalOnly && !/\(?\s*I\s*\)?\s*$/.test(entryOf(x, c.data)?.attrs.avail ?? '')) continue
        if (avail > cap) hits.push({ path, message: `${nameOf(c, x)}’s Availability ${avail} is above ${cap}.` })
      }
      return hits
    },
  },
  // the Sixth World Companion's street level (p. 14, levelSwcStreet): no illegal items (Availability `(I)`), but a
  // cyberdeck, always illegal unless an authority provides it
  {
    code: 'gear.illegal',
    severity: 'error',
    tab: 'gear',
    check: c => {
      if (!flag(c.cr, 'levelSwcStreet')) return null
      const hits: Hit[] = []
      for (const { x, path } of lines(c.b)) {
        const e = entryOf(x, c.data)
        if (e && /\(?\s*I\s*\)?\s*$/.test(e.attrs.avail ?? '') && !/cyberdeck/i.test(e.attrs.category ?? ''))
          hits.push({ path, message: `${nameOf(c, x)} is illegal: a street-level runner can’t have it.`, ...cite(c.cr, 'levelSwcStreet') })
      }
      return hits
    },
  },
  {
    code: 'gear.ratingRange',
    severity: 'error',
    tab: 'gear',
    check: c => {
      const hits: Hit[] = []
      for (const { x, path } of lines(c.b)) {
        const e = entryOf(x, c.data),
          range = ratingRange(e?.attrs.rating),
          r = ratingOf(x, e)
        if (e && range.length && !range.includes(r))
          hits.push({ path, message: `${e.name} comes in ratings ${range[0]}–${range[range.length - 1]}, not ${r}.`, ...entryCite(e) })
      }
      return hits
    },
  },
  // CRB p. 283: grades are for cyberware and bioware (a catalog grade may name its own types: Body Shop's exoware)
  // CRB p. 282: "All accessories and add-ons must be of the same grade as the implant to which they are added": an
  // add-on the file gives another grade is read at its implant's, and noted
  {
    code: 'gear.accessoryGrade',
    severity: 'warning',
    tab: 'augmentations',
    check: c => {
      const hits: Hit[] = []
      for (const { x, path, host, own } of lines(c.b)) {
        if (!host || !own || own.grade === x.grade || host.kind !== 'augmentations') continue
        const g = (k?: string) => (k ? gradeName(c.data, k) : 'standard')
        hits.push({
          path,
          message: `${nameOf(c, own)} on ${nameOf(c, host)}: an add-on has its implant’s grade, so it’s ${g(x.grade)}, not the file’s ${g(own.grade)}.`,
          ...CRB(282),
        })
      }
      return hits
    },
  },
  {
    code: 'gear.grade',
    severity: 'error',
    tab: 'augmentations',
    check: c => {
      const hits: Hit[] = []
      for (const { x, path, host } of lines(c.b)) {
        const e = entryOf(x, c.data),
          g = x.grade
        // (an add-on's grade is its implant's, whatever it is: gear.accessoryGrade)
        if (host || !g || !e || !gradeKnown(c.cr, c.data, g) || gradeFits(c.cr, c.data, e, g)) continue
        const ge = c.data.grades[g] && c.data.entry('grades', c.data.grades[g].id)
        hits.push({ path, message: `${nameOf(c, x)} (${e.attrs.type || e.kind}) doesn’t come in ${gradeName(c.data, g)}.`, ...(ge ? entryCite(ge) : CRB(283)) })
      }
      return hits
    },
  },
  // CRB Hong Kong pp. 157, 286–293 (and a supplement's quality text): two augmentations, powers or qualities the book
  // says can't be combined; a wireless exception (wired reflexes and reaction enhancers) is a note
  { code: 'gear.incompatible', severity: 'error', tab: 'augmentations', check: c => incompatible(c).filter(h => !h.wireless) },
  { code: 'gear.incompatibleWireless', severity: 'warning', tab: 'augmentations', check: c => incompatible(c).filter(h => h.wireless) },
  // owner's decision 9 (2026-10-11): each augmentation once, a paired body part once a side (the editor offers no more)
  {
    code: 'gear.augmentationTwice',
    severity: 'error',
    tab: 'augmentations',
    check: c => {
      const seen = new Map<string, number>(),
        hits: Hit[] = []
      for (const x of c.b.purchases.filter(p => p.kind === 'augmentations')) {
        const slot = augmentationSlot(entryOf(x, c.data))
        if (!slot) continue
        const n = (seen.get(slot.family) ?? 0) + 1
        seen.set(slot.family, n)
        if (n > slot.most)
          hits.push({
            path: `augmentations.${x.uid}`,
            message:
              slot.most === 2
                ? `${nameOf(c, x)}: a third one; a body part has a left and a right only.`
                : `${nameOf(c, x)} is installed twice: each augmentation once.`,
          })
      }
      return hits
    },
  },
  // owner's decision 11: a gun with no ammunition bought for it (a reminder): an ammunition line naming its kind of
  // weapon (`Heavy Pistol/SMG`), or an ammunition type
  {
    code: 'gear.ammo',
    severity: 'warning',
    tab: 'gear',
    check: c => {
      const ammo = new Set(
        c.b.purchases.flatMap(x => {
          const e = entryOf(x, c.data)
          return x.kind === 'ammotypes' ? ['*'] : /ammo|ammunition/i.test(e?.attrs.category ?? '') ? ammoKinds(e!.name) : []
        }),
      )
      return c.b.purchases
        .filter(x => x.kind === 'weapons' && entryOf(x, c.data)?.attrs.ammo)
        .flatMap(x => {
          const want = ammoKinds(entryOf(x, c.data)!.attrs.category ?? '')[0]
          // (a weapon whose kind no ammunition line names, a bow, takes any)
          const named = !!want && AMMO_KINDS.has(want)
          return ammo.has('*') || (named ? ammo.has(want) : ammo.size > 0)
            ? []
            : [{ path: `gear.${x.uid}`, message: `${nameOf(c, x)} has no ammunition bought for it.` }]
        })
    },
  },
  {
    code: 'essence.positive',
    severity: 'error',
    tab: 'augmentations',
    setting: ['essence'],
    check: c => (c.budgets.essence.left > 0 ? null : { message: `Essence must stay above 0 (it is ${c.budgets.essence.left}).` }),
  },

  // CRB p. 67: what each magic kind learns (spells and rituals a magician, adept powers an adept, both a mystic adept,
  // complex forms a technomancer)
  {
    code: 'magic.spellsAllowed',
    severity: 'error',
    tab: 'magic',
    check: c => {
      // adept powers are adept.ppBudget's
      const allowed = { ...picksFor(c.b.magic), adeptpowers: true }
      return c.b.picks
        .filter(x => !allowed[x.kind])
        .map(x => ({ path: `magic.${x.uid}`, message: `${article(kindLabel(c.b))} ${kindLabel(c.b)} can’t have ${pickName(c, x)}.`, ...CRB(67) }))
    },
  },
  // CRB p. 66: the customization Karma buys attributes, skills, qualities and nuyen; spells, rituals and complex forms
  // past the free ones only with the optional rule (karmaSpellsAtCreation, off as Commlink6 has it). Lifepath, point
  // buy and the Karma build buy them by their own rules (SWC pp. 30–32).
  {
    code: 'magic.karmaAtCreation',
    severity: 'error',
    tab: 'magic',
    check: c => {
      if (!usesLetters(c.p) || flag(c.cr, 'karmaSpellsAtCreation')) return null
      const { spells, forms } = extraMagic(c.b, c.data, c.cr, c.p),
        n = spells + forms
      return n
        ? {
            message: `${n} ${spells ? 'spell' : 'complex form'}${n === 1 ? '' : 's'} past the free ones: buying them with the customization Karma is an optional rule, off.`,
            ...CRB(66),
          }
        : null
    },
  },
  // CRB p. 167: some metamagics are for adepts only (the catalog's user: an adept or mystic adept; a magician's, a
  // magician or mystic adept)
  {
    code: 'magic.metamagicUser',
    severity: 'error',
    tab: 'magic',
    check: c =>
      c.b.picks
        .filter(x => x.kind === 'metamagics' && !metamagicFits(c.b.magic, c.data.metamagics[x.id]?.user))
        .map(x => ({
          path: `magic.${x.uid}`,
          message: `${pickName(c, x)} is for ${c.data.metamagics[x.id]!.user === 'adept' ? 'adepts' : 'magicians'} only, not ${article(kindLabel(c.b)).toLowerCase()} ${kindLabel(c.b)}.`,
          ...entryCite(c.data.entry('metamagics', x.id)),
        })),
  },
  // CRB p. 167: each initiation grade brings one metamagic (one taken again, a level each)
  {
    code: 'magic.metamagicCount',
    severity: 'error',
    tab: 'magic',
    check: c => {
      // (one taken again is a level each time: the pick's level, or the level of the entry it holds, levels.ts)
      const n = c.b.picks.filter(x => x.kind === 'metamagics').reduce((t, x) => t + (x.level ?? c.data.levelOf(c.data.entry('metamagics', x.id)) ?? 1), 0)
      return n > c.b.initiation ? { message: `${n} metamagic${n === 1 ? '' : 's'} at initiation grade ${c.b.initiation}: each grade brings one.` } : null
    },
  },
  {
    code: 'adept.ppBudget',
    severity: 'error',
    tab: 'magic',
    check: c => {
      if (!MAGIC_KINDS[c.b.magic].powers)
        return c.b.picks.some(x => x.kind === 'adeptpowers')
          ? { message: `${article(kindLabel(c.b))} ${kindLabel(c.b)} can’t have adept powers.`, ...CRB(67) }
          : null
      return over(c.budgets.powerPoints, 'Power points')
    },
  },
  // CRB Hong Kong pp. 157–158: a power naming its choice (`Improved Ability (Skill)`) is for the skill or attribute its
  // note names
  {
    code: 'magic.choice',
    severity: 'error',
    tab: 'magic',
    check: c =>
      c.b.picks.flatMap(x => {
        const e = c.data.entry(x.kind, x.id),
          want = qualityChoice(e?.name)
        if (!e || !want || (want === 'attribute' ? noteAttr(x.note) : noteSkill(c.data, x.note))) return []
        return [{ path: `magic.${x.uid}`, message: `${e.name}: name the ${want} it is for in its note.`, ...entryCite(e) }]
      }),
  },
  // CRB Hong Kong p. 157: Improved Ability needs a rank in its skill, and the boosted skill is at most 1.5 times the
  // original (rounded up) or the augmented maximum (+4), whichever is lower (improvedAbilityPower, improvedAbilityFactor)
  {
    code: 'adept.improvedAbility',
    severity: 'error',
    tab: 'magic',
    setting: c => (c.b.picks.some(x => x.id === str(c.cr, 'improvedAbilityPower')) ? ['improvedAbilityFactor'] : []),
    check: c => {
      const id = str(c.cr, 'improvedAbilityPower'),
        f = num(c.cr, 'improvedAbilityFactor'),
        aug = num(c.cr, 'skillAugmentMax'),
        hits: Hit[] = []
      for (const x of c.b.picks.filter(p => p.id === id)) {
        const sk = noteSkill(c.data, x.note),
          v = sk ? c.data.skills[sk] : undefined
        if (!v || f === undefined) continue
        const r = skillRank(c.b.skills.find(s => s.id === sk) ?? { points: 0, karma: 0 }),
          level = x.level ?? 1
        const most = Math.min(Math.ceil(r * f), r + (aug ?? Infinity))
        if (r < 1)
          hits.push({
            path: `magic.${x.uid}`,
            message: `${pickName(c, x)} for ${v.name}: it needs a rank in ${v.name}.`,
            ...cite(c.cr, 'improvedAbilityPower'),
          })
        else if (r + level > most)
          hits.push({
            path: `magic.${x.uid}`,
            message: `${pickName(c, x)} ${level} raises ${v.name} ${r} to ${r + level}; at most ${most}.`,
            ...cite(c.cr, 'improvedAbilityPower'),
          })
      }
      return hits
    },
  },
  // CRB Hong Kong p. 167: the initiate grade never above Magic; p. 195: the submersion grade never above Resonance
  {
    code: 'magic.gradeCap',
    severity: 'error',
    tab: 'magic',
    check: c => {
      const loss = c.budgets.essence.magicLoss,
        hits: Hit[] = []
      const mag = Math.max(0, attrRating(c.b, 'mag', c.p) - (MAGIC_KINDS[c.b.magic].resonance ? 0 : loss)),
        res = Math.max(0, attrRating(c.b, 'res', c.p) - (MAGIC_KINDS[c.b.magic].resonance ? loss : 0))
      if (c.b.initiation > mag) hits.push({ message: `Initiate grade ${c.b.initiation} is above Magic ${mag}.`, ...CRB_HK(167) })
      if (c.b.submersion > res) hits.push({ message: `Submersion grade ${c.b.submersion} is above Resonance ${res}.`, ...CRB_HK(195) })
      return hits
    },
  },
  // the house rule gradeCapAtCreation (owner's decision 15, 2026-10-11): the GM's caps on the grades at creation
  {
    code: 'magic.gradeCapCreation',
    severity: 'error',
    tab: 'magic',
    setting: c => (flag(c.cr, 'gradeCapAtCreation') ? ['gradeCap.initiation', 'gradeCap.submersion'] : []),
    check: c => {
      if (!flag(c.cr, 'gradeCapAtCreation')) return null
      const hits: Hit[] = [],
        i = n0(c.cr, 'gradeCap.initiation'),
        s = n0(c.cr, 'gradeCap.submersion')
      if (c.b.initiation > i) hits.push({ message: `Initiate grade ${c.b.initiation} at creation: the table’s cap is ${i}.` })
      if (c.b.submersion > s) hits.push({ message: `Submersion grade ${c.b.submersion} at creation: the table’s cap is ${s}.` })
      return hits
    },
  },
  // the house rule dataStructureCaps (owner's decision 13): the GM's caps on a technomancer's data structures
  {
    code: 'magic.dataStructureCaps',
    severity: 'error',
    tab: 'magic',
    setting: c => (flag(c.cr, 'dataStructureCaps') ? ['dataStructure.maxCount', 'dataStructure.maxRating'] : []),
    check: c => {
      if (!flag(c.cr, 'dataStructureCaps')) return null
      const ds = c.b.picks.filter(x => x.kind === 'datastructures'),
        most = n0(c.cr, 'dataStructure.maxCount'),
        top = n0(c.cr, 'dataStructure.maxRating')
      const hits: Hit[] = ds
        .filter(x => (x.level ?? 1) > top)
        .map(x => ({ path: `magic.${x.uid}`, message: `${pickName(c, x)} level ${x.level ?? 1}: the table’s cap is ${top}.` }))
      if (ds.length > most) hits.push({ message: `${ds.length} data structures: the table’s cap is ${most}.` })
      return hits
    },
  },
  // Hack & Slash p. 72: a data structure's price (its Karma, the level, is p. 71's): set when the runner has one
  {
    code: 'magic.dataStructurePrice',
    severity: 'warning',
    tab: 'magic',
    setting: c => (dataStructureLevels(c.b) ? ['dataStructureNuyen'] : []),
    check: () => null,
  },
  // CRB Hong Kong pp. 162–163: a mystic adept picks its mentor spirit's magician's or adept's advantages, for good
  // (both with the house rule mentorBothAdvantages)
  {
    code: 'magic.mentorAdvantage',
    severity: 'error',
    tab: 'magic',
    check: c =>
      c.b.magic === 'mystic-adept' && c.b.mentorSpirit && !c.b.mentorAdvantage && !flag(c.cr, 'mentorBothAdvantages')
        ? {
            message: `${c.data.entry('mentorspirits', c.b.mentorSpirit)?.name ?? 'The mentor spirit'}: pick its magician’s or its adept’s advantages.`,
            ...CRB_HK(162),
          }
        : null,
  },
  // CRB Hong Kong p. 154: foci only for the Awakened; no more bonded than Magic, none of Force above Magic, their Force
  // together at most Magic × fociForcePerMagic
  {
    code: 'magic.foci',
    severity: 'error',
    tab: 'gear',
    check: c => {
      const foci = c.b.purchases.filter(x => isFocus(entryOf(x, c.data)))
      if (!foci.length) return null
      const k = MAGIC_KINDS[c.b.magic],
        mag = Math.max(0, attrRating(c.b, 'mag', c.p) - c.budgets.essence.magicLoss),
        per = num(c.cr, 'fociForcePerMagic')
      if (!k.spells && !k.powers) return { message: `${foci.length} ${foci.length === 1 ? 'focus' : 'foci'}: only the Awakened bond foci.`, ...CRB_HK(154) }
      const force = (x: Sr6Purchase) => ratingOf(x, entryOf(x, c.data)),
        n = foci.reduce((t, x) => t + x.qty, 0),
        hits: Hit[] = []
      if (n > mag) hits.push({ message: `${n} foci bonded: at most Magic, ${mag}.`, ...CRB_HK(154) })
      for (const x of foci)
        if (force(x) > mag) hits.push({ path: `gear.${x.uid}`, message: `${nameOf(c, x)}: Force ${force(x)} is above Magic ${mag}.`, ...CRB_HK(154) })
      const total = foci.reduce((t, x) => t + force(x) * x.qty, 0)
      if (per !== undefined && total > mag * per)
        hits.push({ message: `The foci's Force adds up to ${total}: at most Magic × ${per}, ${mag * per}.`, ...cite(c.cr, 'fociForcePerMagic') })
      return hits
    },
  },
  {
    code: 'adept.ppCap',
    severity: 'error',
    tab: 'magic',
    check: c => {
      const cap = c.budgets.powerPoints.cap
      return !MAGIC_KINDS[c.b.magic].paysPowers || c.b.method === 'pointbuy' || c.b.powerPointsBought <= cap
        ? null
        : { message: `${c.b.powerPointsBought} power points bought; the most is the Magic rating, ${cap}.` }
    },
  },

  // (CRB Hong Kong p. 67: Charisma × 6 points; with the expanded contacts, karma buys the rest)
  {
    code: 'contact.budget',
    severity: 'error',
    tab: 'contacts',
    setting: c => [c.p.contactPoints ? 'lifepath.contactRatingCap' : 'contactPointsPerCha'],
    check: c => over(c.budgets.contactPoints, 'Contact points'),
  },
  {
    code: 'contact.ratingCap',
    severity: 'error',
    tab: 'contacts',
    check: c => {
      const cap = c.budgets.contactPoints.ratingCap
      return c.b.contacts
        .filter(x => x.connection > cap || x.loyalty > cap)
        .map(x => ({ path: `contacts.${x.uid}`, message: `${x.name || 'A contact'}’s connection or loyalty is above ${cap}.` }))
    },
  },
  // SWC p. 31: karma buys contact ratings only up to Charisma: what a contact has above it must come from the points
  {
    code: 'contact.karmaCap',
    severity: 'error',
    tab: 'contacts',
    setting: c => (c.p.contactPools ? ['lifepath.contactKarma'] : []),
    check: c => {
      if (!c.p.contactPools || num(c.cr, 'lifepath.contactKarma') === undefined) return null
      const cha = augmentedRating(c.b, c.data, 'cha', c.p)
      const above = c.b.contacts.map(x => ({ x, types: x.types ?? [], need: Math.max(0, x.connection - cha) + Math.max(0, x.loyalty - cha) }))
      if (!uncovered(c.p.contactPools(c.b), above)) return null
      const names = above
        .filter(a => a.need)
        .map(a => a.x.name || 'a contact')
        .join(', ')
      return { message: `Karma can’t raise a contact’s connection or loyalty above your Charisma (${cha}): the contact points don’t cover ${names} above it.` }
    },
  },
  {
    code: 'knowledge.budget',
    severity: 'error',
    tab: 'skills',
    setting: c => (c.p.knowledgePoints ? [] : ['knowledgePerLog']),
    check: c => over(c.budgets.knowledgePoints, 'Knowledge points'),
  },

  {
    code: 'pointbuy.overspent',
    severity: 'error',
    tab: 'method',
    setting: c => (c.budgets.characterPoints ? ['pointBuy.total'] : []),
    check: c => (c.budgets.characterPoints ? over(c.budgets.characterPoints, 'Character points') : null),
  },
  {
    code: 'pointbuy.unspent',
    severity: 'error',
    tab: 'method',
    setting: c => (c.budgets.characterPoints ? ['pointBuy.total'] : []),
    check: c => {
      const left = c.budgets.characterPoints?.left ?? 0
      return left > 0 ? { message: `${left} character points left: spend them all.` } : null
    },
  },
  {
    code: 'pointbuy.poolCap',
    severity: 'error',
    tab: 'method',
    setting: c =>
      c.p.id === 'pointbuy' ? ['pointBuy.max.attribute', 'pointBuy.max.skill', 'pointBuy.max.adjustment', 'pointBuy.max.nuyen', 'pointBuy.nuyenPerCp'] : [],
    check: c => {
      if (c.p.id !== 'pointbuy') return null
      const hits: Hit[] = (['attribute', 'skill', 'adjustment'] as const)
        .filter(k => c.b.cp[k] > n0(c.cr, `pointBuy.max.${k}`))
        .map(k => ({ message: `${c.b.cp[k]} character points in ${k} points; the most is ${n0(c.cr, `pointBuy.max.${k}`)}.` }))
      const nuyen = c.b.cp.resources * n0(c.cr, 'pointBuy.nuyenPerCp'),
        maxN = n0(c.cr, 'pointBuy.max.nuyen')
      if (nuyen > maxN) hits.push({ message: `${fmt(nuyen)}¥ bought with character points; the most is ${fmt(maxN)}¥.` })
      return hits
    },
  },
  {
    code: 'pointbuy.oneSpecialization',
    severity: 'error',
    tab: 'skills',
    setting: c => (c.p.id === 'pointbuy' ? ['pointBuy.oneSpecialization'] : []),
    check: c => {
      const count = c.b.skills.reduce((t, s) => t + (s.spec ? 1 : 0) + (s.specs?.length ?? 0), 0)
      return c.p.id !== 'pointbuy' || !flag(c.cr, 'pointBuy.oneSpecialization') || count <= 1
        ? null
        : { message: `Only one specialization in point buy (${count} taken).` }
    },
  },

  {
    code: 'lifepath.moduleCount',
    severity: 'error',
    tab: 'method',
    setting: c => (c.p.id === 'lifepath' ? ['lifepath.moduleCount'] : []),
    check: c => {
      const need = n0(c.cr, 'lifepath.moduleCount'),
        have = c.b.lifepath.length
      return c.p.id !== 'lifepath' || have === need ? null : { message: `${have} adult life modules taken; take ${need}.` }
    },
  },
  // optional settings (unset: the rule is off, no unset warning)
  {
    code: 'lifepath.repeat',
    severity: 'error',
    tab: 'method',
    check: c => {
      if (c.p.id !== 'lifepath') return null
      const times = new Map<string, number>()
      for (const pk of c.b.lifepath) times.set(pk.id, (times.get(pk.id) ?? 0) + 1)
      const twice = [...times].filter(([, t]) => t > 1),
        most = num(c.cr, 'lifepath.repeatModules') ?? 0
      const name = (id: string) => c.data.lifemodules[id]?.name ?? id
      if (twice.some(([, t]) => t > 2) || twice.length > most)
        return {
          message: `${twice.map(([id, t]) => `${name(id)} (${t} times)`).join(', ')}: ${
            most === 0 ? 'no module may be taken twice' : `${most === 1 ? 'one module' : `${most} modules`} may be taken twice, none more`
          }.`,
          ...cite(c.cr, 'lifepath.repeatModules'),
        }
      return null
    },
  },
  {
    code: 'lifepath.bestAttr',
    severity: 'error',
    tab: 'method',
    check: c => {
      const bonus = num(c.cr, 'lifepath.bestAttributeBonus')
      if (c.p.id !== 'lifepath' || !bonus) return null
      if (!c.b.bestAttr) return { message: `Pick the best attribute (it goes up by ${bonus}).`, ...cite(c.cr, 'lifepath.bestAttributeBonus') }
      const used = c.p.attributeBonus?.(c.b, c.b.bestAttr) ?? 0
      return used < bonus && (!c.b.bestExtra || c.b.bestExtra === c.b.bestAttr)
        ? {
            message: `${A(c.b.bestAttr)} reaches its maximum: pick the attribute that takes the other ${bonus - used}.`,
            ...cite(c.cr, 'lifepath.bestAttributeBonus'),
          }
        : null
    },
  },
  {
    code: 'lifepath.mixedChoices',
    severity: 'error',
    tab: 'method',
    check: c =>
      c.p.id !== 'lifepath'
        ? null
        : c.b.lifepath.flatMap(pk => {
            const m = c.data.lifemodules[pk.id]
            return m && m.choices.some((_, i) => !pk.choices[i])
              ? [{ path: `method.${pk.id}`, message: `${m.name}: pick where its choice goes.`, ...entryCite(c.data.entry('lifemodules', pk.id)) }]
              : []
          }),
  },

  // an adult module printed for an awakened, emerged, adept or magician runner (`( Awakened only )`), taken by another
  {
    code: 'lifepath.requires',
    severity: 'error',
    tab: 'method',
    check: c =>
      (c.p.available?.(c.b) ?? [])
        .filter(m => m.taken && !m.fits)
        .map(m => ({
          path: `method.${m.id}`,
          message: `${m.name} is for ${article(m.requires!).toLowerCase()} ${m.requires} runner, not ${article(kindLabel(c.b)).toLowerCase()} ${kindLabel(c.b)}.`,
          ...entryCite(c.data.entry('lifemodules', m.id)),
        })),
  },

  // owner's decision L2 (2026-10-11): more left than carries over (CRB Hong Kong pp. 66, 68, or the GM's own with
  // ownCarryOver) is a problem a GM can approve. maxKarmaLeft optional: unset, no limit (and no unset warning)
  {
    code: 'leftover.karma',
    severity: 'error',
    tab: 'review',
    check: c => {
      const most = num(c.cr, 'maxKarmaLeft')
      return most === undefined || c.budgets.karma.left <= most
        ? null
        : { message: `${c.budgets.karma.left} karma left; at most ${most} carries over.`, ...cite(c.cr, 'maxKarmaLeft') }
    },
  },
  {
    code: 'leftover.nuyen',
    severity: 'error',
    tab: 'review',
    setting: ['maxNuyenLeft'],
    check: c =>
      c.budgets.nuyen.left <= n0(c.cr, 'maxNuyenLeft')
        ? null
        : { message: `${fmt(c.budgets.nuyen.left)}¥ left; at most ${fmt(n0(c.cr, 'maxNuyenLeft'))}¥ carries over.` },
  },

  // owner's decision 1 (2026-10-11): points left at finish are lost: a note, never a block
  {
    code: 'points.unspent',
    severity: 'warning',
    tab: 'review',
    check: c =>
      (
        [
          [c.budgets.attributePoints, 'attribute points', 'attributes'],
          [c.budgets.adjustmentPoints, 'adjustment points', 'attributes'],
          [c.budgets.skillPoints, 'skill points', 'skills'],
          [c.budgets.knowledgePoints, 'knowledge points', 'skills'],
        ] as const
      )
        .filter(([b]) => b.left > 0)
        .map(([b, what, path]) => ({
          path,
          message: `${fmt(b.left)} ${b.left === 1 ? what.replace(/s$/, '') : what} left: ${b.left === 1 ? 'it’s' : 'they’re'} lost when the runner is finalized.`,
        })),
  },
  // owner's decisions 7 and 8: no lifestyle, no name or alias: notes
  {
    code: 'lifestyle.none',
    severity: 'warning',
    tab: 'contacts',
    check: c => (c.b.sins.some(s => s.lifestyles?.length) ? null : { message: 'No lifestyle bought: the runner lives somewhere (a lifestyle goes on a SIN).' }),
  },
  {
    code: 'identity.name',
    severity: 'warning',
    tab: 'concept',
    check: c => {
      const gone = [!c.ch.identity.name.trim() && 'name', !c.ch.identity.streetName.trim() && 'alias'].filter(Boolean)
      return gone.length ? { message: `The runner has no ${gone.join(' and no ')}.` } : null
    },
  },
  // an older file's lifestyle on a runner with no SIN went on an unnamed placeholder (charxml.ts): a note, not a block
  {
    code: 'sin.placeholder',
    severity: 'warning',
    tab: 'contacts',
    check: c =>
      c.b.sins
        .filter(s => s.placeholder)
        .map(s => ({
          path: `contacts.sin.${s.uid}`,
          message:
            'An unnamed SIN holds the lifestyle from an older file: give it a name, kind and rating ' +
            '(once finalized: Ledger → Add or name a SIN), or move the lifestyle to a real or fake SIN and remove it.',
        })),
  },
  {
    code: 'catalog.missing',
    severity: 'error',
    tab: 'review',
    check: c => {
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
      for (const s of c.b.sins) for (const l of s.lifestyles ?? []) if (!c.data.entry('lifestyles', l.id)) hits.push(gone(`contacts.lifestyle.${l.uid}`, l.id))
      for (const pk of c.b.lifepath) if (!c.data.lifemodules[pk.id]) hits.push(gone(`method.${pk.id}`, pk.id))
      return hits
    },
  },
  {
    code: 'catalog.bookValue',
    severity: 'warning',
    tab: 'gear',
    check: c => {
      const hits: Hit[] = []
      for (const { x, path } of lines(c.b)) {
        if (priced({ ...x, accessories: [] }, c.data, c.cr).ok) continue
        const e = entryOf(x, c.data)
        hits.push({ path, message: `${nameOf(c, x)}: a cost, Availability or Essence the app can’t read counts as 0.`, ...entryCite(e) })
      }
      return hits
    },
  },
  // what a formula had to assume (no rating given: worked out at rating 1…)
  {
    code: 'catalog.formula',
    severity: 'warning',
    tab: 'gear',
    check: c => {
      const hits: Hit[] = []
      for (const { x, path } of lines(c.b)) {
        const { notes } = priced({ ...x, accessories: [] }, c.data, c.cr)
        if (notes.length) hits.push({ path, message: `${nameOf(c, x)}: ${notes.join('; ')}.`, ...entryCite(entryOf(x, c.data)) })
      }
      return hits
    },
  },
  // an accessory whose category is for another kind of host (categories.ts: a cyberlimb's armor on a weapon): fitted
  // anyway, a prerequisite it lacks
  {
    code: 'catalog.accessoryHost',
    severity: 'error',
    tab: 'gear',
    check: c =>
      c.b.purchases.flatMap(x => {
        const he = entryOf(x, c.data)
        return he
          ? x.accessories.flatMap(a => {
              const e = entryOf(a, c.data)
              return e && fitsHost(c.data.categories, e, he) === false
                ? [
                    {
                      path: `${PURCHASE_TAB[x.kind]}.${x.uid}`,
                      message: `${nameOf(c, a)} is for ${hostsOf(c.data.categories, e).join(' or ')}, not ${nameOf(c, x)}.`,
                      ...entryCite(e),
                    },
                  ]
                : []
            })
          : []
      }),
  },
  // the accessories' bracketed capacity ([2], [Rating]) comes out of the host's capacity
  {
    code: 'catalog.capacity',
    severity: 'error',
    tab: 'gear',
    check: c =>
      c.b.purchases.flatMap(x => {
        const he = entryOf(x, c.data),
          cap = capacityOf(he, ratingOf(x, he))
        if (cap === null || !x.accessories.length) return []
        const used = x.accessories.reduce((t, a) => {
          const e = entryOf(a, c.data)
          return t + capacityUsed(e, ratingOf(a, e))
        }, 0)
        return used > cap
          ? [{ path: `${PURCHASE_TAB[x.kind]}.${x.uid}`, message: `${nameOf(c, x)}: its accessories take ${used} capacity; it has ${cap}.`, ...entryCite(he) }]
          : []
      }),
  },
  // a book sample keeps the numbers its stat block prints; where the rules give others, say so (the book isn't corrected)
  { code: 'sample.printed', severity: 'warning', tab: 'review', check: c => printedHits(c) },
]

/** "Initiative: the book prints 9(11) + 3D6; the rules give 9(12) + 3D6.": a book sample's printed attributes (natural
 *  and augmented), Essence, initiative, condition monitors and Defense Rating where the rules give others, cited to its page. */
function printedHits(c: Ctx): Hit[] {
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
function incompatible(c: Ctx): (Hit & { wireless: boolean })[] {
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
function granted(c: Ctx): (Hit & { none: boolean })[] {
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
function negatives(b: Sr6Build): Hit[] {
  const hits: Hit[] = []
  const at = (path: string, o: object, keys: string[]) => {
    for (const k of keys) {
      const v = (o as Record<string, unknown>)[k]
      if (typeof v === 'number' && v < 0) hits.push({ path, message: `${k} is ${v}; it can’t be below 0.` })
    }
  }
  at('method', b, ['powerPointsBought', 'initiation', 'submersion', 'karmaToNuyen'])
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

/** The kind of the purchase line `uid` (augmentations when it's gone). */
const PURCHASE_KIND_OF = (ch: Sr6Character, uid: string) => ch.build.purchases.find(x => x.uid === uid)?.kind ?? 'augmentations'
const nameOf = (c: Ctx, x: Sr6Purchase) => {
  const e = entryOf(x, c.data)
  return e ? entryLabel(e) : (x.name ?? x.id ?? 'Custom item')
}

/** Every broken creation rule on `ch`, the catalog's own problems, and a warning per unset setting a rule needed; approved
 *  from the GM's overrides (code and path). */
export function validateSr6(data: Sr6Data, cr: CreationRules, ch: Sr6Character): Violation[] {
  const b = ch.build,
    p = makeProvider(b.method, data, cr)
  const c: Ctx = { data, cr, ch, b, p, budgets: allBudgets(b, data, cr, p) }
  const labels = new Map(expandKeys(data).map(k => [k.key, k.label]))
  const out: Violation[] = [],
    unset = new Set<string>()
  // a setting the runner turned off itself (Creation method tab) is no table setting left unset
  const off = new Set((ch.rules ?? []).filter(r => !r.value.trim()).map(r => r.key))
  for (const r of RULES) {
    const keys = typeof r.setting === 'function' ? r.setting(c) : (r.setting ?? [])
    const missing = keys.filter(k => !cr.has(k) && !off.has(k))
    if (keys.some(k => off.has(k) && !cr.has(k))) continue
    if (missing.length) {
      for (const k of missing)
        if (!unset.has(k)) {
          unset.add(k)
          out.push({ code: 'setting.unset', severity: 'warning', path: r.tab, message: `${labels.get(k) ?? k} isn’t set: Table setup → Creation rules.` })
        }
      continue
    }
    const hits = r.check(c)
    for (const h of hits === null ? [] : Array.isArray(hits) ? hits : [hits]) {
      const at = h.page ? { source: h.source, page: h.page } : keys[0] ? cite(cr, keys[0]) : {}
      out.push({ code: r.code, severity: r.severity, path: h.path ?? r.tab, message: h.message, ...at, ...(r.hard ? { hard: true as const } : {}) })
    }
  }
  out.push(...runnerRuleNotes(cr, ch, labels))
  // a printed line the owner's override file corrects (engine/samplefix.ts): a note, not the error the book's value gave
  for (const k of ch.corrections ?? []) {
    const e = c.data.entry(PURCHASE_KIND_OF(ch, k.path), k.item)
    out.push({
      code: 'sample.corrected',
      severity: 'warning',
      path: `${PURCHASE_TAB[PURCHASE_KIND_OF(ch, k.path)]}.${k.path}`,
      source: k.source,
      page: k.page,
      message: `${e ? entryLabel(e) : k.item}: the book prints ${k.field} ${k.from}; corrected to ${k.to} by an override${k.note ? ` (${k.note})` : ''}.`,
    })
  }
  // the catalog's own problems (data.ts), only for entries this runner uses (and the priority table): not every book's
  // (a level's entry, levels.ts, carries its family's parent's problems: the parent is the id the catalog warns under)
  const families = [...JSON.stringify(ch.build).matchAll(/"id":"([^"]+)"/g)].flatMap(m => {
    const e = [...PURCHASE_KINDS, ...PICK_KINDS, 'qualities' as const].map(k => data.entry(k, m[1])).find(Boolean)
    return e?.attrs.family ? [e.attrs.family] : []
  })
  const used = JSON.stringify(ch.build) + JSON.stringify(families)
  out.push(...data.problems.filter(v => v.path.startsWith('priorities.') || used.includes(`"${v.path.slice(v.path.indexOf('.') + 1)}"`)))
  const approved = new Set(ch.overrides.map(o => `${o.code}|${o.path}`))
  return out.map(v => (approved.has(`${v.code}|${v.path}`) && !v.hard ? { ...v, approved: true } : v))
}

/** An assumption a sample runner's numbers need that a known printing explains (owner's decision U31, 2026-10-11). */
const ASSUMED: Record<string, string> = { availabilityCapIllegalOnly: 'assumed: 2019 printing (its numbers need the first printing’s reading)' }

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
const AMMO_KINDS = new Set(['holdout', 'light pistol', 'machine pistol', 'heavy pistol', 'submachine gun', 'rifle', 'machine gun', 'assault cannon', 'taser'])

/** Notes on the runner's own rules (creation.ts runnerRules): one a book sample was given because its numbers need it
 *  (assumed: the book doesn't say), and one its campaign locked, so the runner's choice is set aside. Never errors. */
function runnerRuleNotes(cr: CreationRules, ch: Sr6Character, labels: Map<string, string>): Violation[] {
  const name = (k: string) => labels.get(k) ?? k,
    out: Violation[] = []
  // (rules that can't be on together, all on: rules that didn't go through runnerRules, which keeps one)
  const clash = [...cr.keys()].filter(k => isOn(cr.get(k)) && conflictsOf(k).some(c => isOn(cr.get(c))))
  if (clash.length)
    out.push({ code: 'rules.conflict', severity: 'warning', path: 'method', message: `${clash.map(name).join('; ')}: these can’t be on together.` })
  for (const r of ch.rules ?? []) {
    const s = cr.get(r.key),
      b = !s && r.value.trim() && r.value !== 'false' ? blockedBy(cr, r.key) : undefined
    if (!isRunnerRuleKey(r.key))
      out.push({ code: 'rules.tableOnly', severity: 'warning', path: 'method', message: `${name(r.key)}: your choice is set aside; only the table sets this.` })
    else if (s?.lockedBy)
      out.push({
        code: 'rules.locked',
        severity: 'warning',
        path: 'method',
        message: `${name(r.key)}: your choice is set aside; the campaign’s GM ${s.lockedBy} locked it.`,
      })
    else if (b)
      out.push({
        code: 'rules.setAside',
        severity: 'warning',
        path: 'method',
        message: `${name(r.key)}: your choice is set aside; ${'needs' in b ? `it needs ${name(b.needs)}, which is off` : `it can’t be on with ${name(b.conflicts)}`}.`,
      })
    else if (r.assumed)
      out.push({
        code: 'rules.assumed',
        severity: 'warning',
        path: 'method',
        ...(r.source ? { source: r.source } : {}),
        ...(r.page ? { page: r.page } : {}),
        message: `${name(r.key)}: ${r.value.trim() === '' || r.value === 'false' ? 'off' : r.value === 'true' ? 'on' : r.value}; ${
          ASSUMED[r.key] ?? 'assumed from the book’s numbers (the book doesn’t say)'
        }.`,
      })
  }
  return out
}

/** No error left that a GM hasn't approved (Anarchy's rule). */
export const canFinalizeSr6 = canFinalize
