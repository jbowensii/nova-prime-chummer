// Review rules, skills, qualities, SURGE, infected, cyberadept and martial arts. Part of the rules table (rules.ts assembles it in order).
import { CORE_ATTRS, type Sr6Purchase, type Sr6Quality } from '../../../formats/domain/character'
import {
  aptitudeSkills,
  manySpecs,
  attrMax,
  attrRating,
  entryOf,
  noteAttr,
  noteSkill,
  qualityChoice,
  qualityKarma,
  qualityPrice,
  settingQuality,
  skillRank,
} from '../creation/budgets'
import { cite, flag, num, str } from '../../../table-setup/domain/creation'
import { dracoformProblems, drakeKind, isShifter, isShifterAddOn, shifterResonance } from '../creation/drake'
import { collectiveFits, collectiveGrants, collectiveOptions, isMetagenic, SURGE_CAP, surgeAllowed, surgeKarma } from '../creation/surge'
import { MAGIC_KINDS, qualityFitsMetatype } from '../../../catalog/domain/data'
import { normName } from '../../../catalog/domain/names'
import { languageCap, nativeMax } from '../creation/skills'
import { adeptBars, opposite } from '../creation/actions'
import type { Sr6Entry } from '../../../formats/domain/types'
import { characterRequirements } from '../creation/prereq'
import { entryLabel } from '../../../catalog/domain/categories'
import { missingPicks, VARIANT } from '../../../catalog/domain/structure'
import { awakenedFlag, freePick, infectedFit, optionalPower, powerRefusal, runnerInfected } from '../creation/infected'
import { infectedQuality } from '../assets/critterware'
import { MARTIAL_CITE, prerequisites, prerequisiteText, styleName, techniqueFits, techniqueName } from '../creation/martial'
import { CYBERADEPT, cyberadeptSteps, GRADE_RANK } from '../creation/cyberadept'
import { qualityIdOf, stepOf } from '../paths'
import { activeRules } from '../creation/rule-markers'
import { type Hit, type Rule, A, kindLabel, article, n0, over, entryCite, CRB, SWC, metaName, lines, has, granted, negatives } from './context'

export const RULES_SKILLS_QUALITIES: Rule[] = [
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
        most = languageCap(c.b, c.data, num(c.cr, 'languageMax')),
        hits: Hit[] = []
      const nat = langs.filter(k => k.native).length,
        allowed = nativeMax(c.b, c.data)
      if (nat > allowed)
        hits.push({ message: `${nat} native languages: ${allowed === 1 ? 'only one (a second needs the Bilingual quality)' : 'two at most'}.`, ...CRB(67) })
      if (most !== undefined)
        for (const k of langs)
          if (!k.native && k.points + k.karma > most)
            hits.push({
              path: `skills.${k.uid}`,
              message: `${k.name} at level ${k.points + k.karma}: a learned language goes to ${most} at most (Expert; Polyglot lets it reach Native).`,
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
  // drake and shifter player characters as Commlink6 builds them (drake.ts): dracogenesis powers for an aware drake only,
  // shifter add-ons only with the Shifter quality, and no shifter technomancer
  {
    code: 'drake.powers',
    severity: 'error',
    tab: 'qualities',
    check: c =>
      c.b.picks.some(x => x.kind === 'critterpowers') && drakeKind(c.b, c.data) !== 'aware'
        ? { message: 'Only an aware drake (the Drake quality) learns dracogenesis powers.' }
        : null,
  },
  {
    code: 'shifter.addOns',
    severity: 'error',
    tab: 'qualities',
    check: c =>
      !isShifter(c.b, c.data) && c.b.qualities.some(q => isShifterAddOn(c.data, q.id)) ? { message: 'Shifter add-ons need the Shifter quality.' } : null,
  },
  {
    code: 'shifter.resonance',
    severity: 'error',
    tab: 'qualities',
    check: c => (shifterResonance(c.b, c.data) ? { message: 'A shifter can’t be a technomancer: it needs Magic, not Resonance.' } : null),
  },
  // SURGE as Commlink6 handles it (CommonQualityGenerator): at most 30 Karma on metagenic qualities picked (a collective's free
  // ones not counted); a collective only for the metatypes it lists, with its choice made; a collective quality the catalog
  // lacks is said
  // SURGE off at the table (allowSurge: owner ruling 2026-10-31): no metagenic quality nor collective at creation
  {
    code: 'quality.surgeOff',
    severity: 'error',
    tab: 'qualities',
    check: c =>
      surgeAllowed(c.cr) || (!c.b.surgeCollective && !c.b.qualities.some(q => !q.free && isMetagenic(c.data.entry('qualities', q.id))))
        ? null
        : { message: 'This table does not allow SURGE (metagenic qualities and collectives).' },
  },
  {
    code: 'quality.surgeCap',
    severity: 'error',
    tab: 'qualities',
    check: c => {
      const k = surgeKarma(c.b, c.data)
      return k <= SURGE_CAP ? null : { message: `${k} Karma on metagenic qualities; the most is ${SURGE_CAP}.` }
    },
  },
  {
    code: 'quality.surgeCollective',
    severity: 'error',
    tab: 'qualities',
    check: c => {
      if (!c.b.surgeCollective) return null
      const set = c.data.entry('qualitysets', c.b.surgeCollective)
      if (!set) return { message: 'The SURGE collective is no longer in the catalog.' }
      const out: { message: string }[] = []
      if (!collectiveFits(c.b, c.data)) out.push({ message: `The ${set.name} collective is for ${set.attrs.metatypes}, not this metatype.` })
      if (collectiveOptions(set).length && !c.b.surgeChoice) out.push({ message: `The ${set.name} collective: make its choice.` })
      const lost = collectiveGrants(c.data, set, c.b.surgeChoice).filter(g => !g.id)
      if (lost.length) out.push({ message: `The ${set.name} collective's ${lost.map(g => g.ref).join(', ')} is not in the catalog.` })
      return out
    },
  },
  {
    code: 'quality.maxCount',
    severity: 'error',
    tab: 'qualities',
    setting: ['qualityMaxCount'],
    check: c => {
      // (a quality whose text says it doesn't count toward the six: Lofwyr's Legions p. 16's drake qualities)
      // (nor a shifter add-on, Commlink6's own list: drake.ts)
      const count = c.b.qualities.filter(q => !q.free && !c.data.qualities[q.id]?.uncounted && !isShifterAddOn(c.data, q.id)).length,
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
  // No Future's errata (NF p. 162): never both In Debt and Stolen Gear (taken anyway: a GM may approve it)
  {
    code: 'quality.stolenGearInDebt',
    severity: 'error',
    tab: 'qualities',
    check: c => {
      const q = settingQuality(c.b, c.cr, 'stolenGearQuality', c.data),
        d = settingQuality(c.b, c.cr, 'inDebtQuality', c.data)
      const name = (x: Sr6Quality) => c.data.qualities[x.id]?.name ?? x.name ?? x.id
      return q && d ? { path: `qualities.${q.uid}`, message: `${name(q)} and ${name(d)}: a runner can’t have both.`, ...cite(c.cr, 'stolenGearQuality') } : null
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
  // Commlink6's character requirements (behaviour-gaps Stage 3): what the runner must have for a quality, power,
  // metamagic, echo or piece of gear (another quality, a magic type, a minimum attribute or Essence, a skill rank …)
  {
    code: 'prerequisite.character',
    severity: 'error',
    tab: 'qualities',
    check: c => {
      const out: Hit[] = []
      const say = (e: Sr6Entry | undefined, path: string, rating?: number, skip?: string[]) => {
        if (!e) return
        const { failed } = characterRequirements(e, c, rating, skip)
        if (failed.length) out.push({ path, message: `${entryLabel(e)} requires ${failed.join('; ')}, which the runner doesn’t have.`, ...entryCite(e) })
      }
      for (const q of c.b.qualities)
        if (!q.free) say(c.data.entry('qualities', q.id), `qualities.${q.uid}`, q.level, c.data.qualities[q.id]?.metatypes ? ['METATYPE'] : []) // (a metatype list is quality.metatype's)
      for (const x of c.b.picks) say(c.data.entry(x.kind, x.id), `magic.${x.uid}`, x.level)
      for (const { x, path } of lines(c.b)) say(entryOf(x, c.data), path, x.rating)
      return out
    },
  },
  {
    code: 'quality.level',
    severity: 'error',
    tab: 'qualities',
    check: c =>
      c.b.qualities.flatMap(q => {
        const v = c.data.qualities[q.id],
          max = v?.perLevel ? (v.maxLevel ?? Infinity) : 1
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

  // a required sub-option or variant left unpicked (Commlink6's SUBSELECT and reqVariant, behaviour-gap plan Stage 2):
  // the line's price and effects depend on it
  {
    code: 'choice.option',
    severity: 'warning',
    tab: 'gear',
    check: c => {
      const lines: [string, Sr6Entry | undefined, Record<string, string> | undefined][] = [
        ...c.b.qualities.map(
          q => [`qualities.${q.uid}`, c.data.entry('qualities', q.id), q.options] as [string, Sr6Entry | undefined, Record<string, string> | undefined],
        ),
        ...c.b.purchases.flatMap(function all(x: Sr6Purchase): [string, Sr6Entry | undefined, Record<string, string> | undefined][] {
          return [[`purchases.${x.uid}`, x.id ? c.data.entry(x.kind, x.id) : undefined, x.options], ...x.accessories.flatMap(all)]
        }),
      ]
      return lines.flatMap(([path, e, o]) =>
        missingPicks(e, o).map(ch => ({
          path,
          message: `${e!.name}: pick its ${ch.ref === VARIANT ? 'variant' : ch.ref.replace(/_/g, ' ')} (${ch.options.map(x => x.label).join(', ')}).`,
          ...entryCite(e),
        })),
      )
    },
  },

  // a drake's dracoform adjustment points (Lofwyr's Legions p. 16): within its drake type's pool, on the attributes it names
  {
    code: 'drake.dracoform',
    severity: 'error',
    tab: 'qualities',
    check: c => dracoformProblems(c.b, c.data).map(message => ({ message })),
  },

  // the Awakened flag overridden by the player (owner, 2026-10-16: always allowed, shown with what it overrides): also
  // when it agrees with the derived flag but changes a quality's <karmaif> price (an Infected type's own goes by
  // Awakened before it, infected.ts priceAwakened)
  {
    code: 'awakened.override',
    severity: 'warning',
    tab: 'method',
    check: c => {
      const f = awakenedFlag(c.b, c.data)
      if (f.override === undefined) return null
      const { awakened: _, ...derived } = c.b
      const prices = c.b.qualities.flatMap(q => {
        const v = c.data.qualities[q.id]
        if (q.free || !v) return []
        const now = qualityPrice(c.b, c.data, q, v),
          was = qualityPrice(derived, c.data, q, v)
        return now === was ? [] : [`${v.name} ${was} → ${now} Karma`]
      })
      const yes = (v: boolean) => (v ? 'Awakened' : 'not Awakened')
      if (f.override === f.derived && !prices.length) return null
      return {
        message:
          (f.override === f.derived
            ? `Overridden to ${yes(f.value)}, as derived (${f.why})`
            : `Derived: ${yes(f.derived)} (${f.why}); overridden to ${yes(f.value)}`) +
          (prices.length ? `; the override changes the price of ${prices.join(', ')}.` : '.'),
      }
    },
  },
  // the Sixth World Companion's Infected (pp. 104–106; infected.ts)
  {
    code: 'infected.off',
    severity: 'warning',
    tab: 'qualities',
    check: c =>
      flag(c.cr, 'infectedAllowed')
        ? null
        : c.b.qualities
            .filter(q => infectedQuality(c.data.entry('qualities', q.id)))
            .map(q => ({
              path: `qualities.${q.uid}`,
              message: `${c.data.qualities[q.id]?.name ?? q.id} is an Infected entry, but Infected player characters aren’t allowed at this table (kept).`,
              ...SWC(104),
            })),
  },
  {
    code: 'infected.metatype',
    severity: 'error',
    tab: 'qualities',
    check: c => {
      const inf = runnerInfected(c.b, c.data)
      return inf && c.b.metatype && !infectedFit(c.data, c.b.metatype, inf.t)
        ? {
            path: `qualities.${inf.line.uid}`,
            message: `${inf.t.name} is for ${inf.t.base} runners, not ${metaName(c).toLowerCase()}.`,
            ...entryCite(c.data.entry('qualities', inf.t.id)),
          }
        : null
    },
  },
  {
    code: 'infected.power',
    severity: 'error',
    tab: 'qualities',
    check: c => {
      const free = freePick(c.b, c.data),
        creation = !c.ch.finalizedAt && !flag(c.cr, 'infectedPowersAtCreation')
      return c.b.qualities.flatMap(q => {
        if (!optionalPower(c.data.entry('qualities', q.id))) return []
        const why = powerRefusal(c.b, c.data, c.cr, q.id, false),
          name = c.data.qualities[q.id]?.name ?? q.id
        const message =
          why === 'infected-no-type'
            ? `${name}: only an Infected runner buys optional powers.`
            : why === 'infected-not-listed'
              ? `${name} isn’t on ${runnerInfected(c.b, c.data)!.t.name}’s optional powers.`
              : creation && (q !== free || q.level > 1)
                ? `${name}: at creation only the free optional power (one level); the rest are bought after creation.`
                : ''
        return message ? [{ path: `qualities.${q.uid}`, message, ...SWC(105) }] : []
      })
    },
  },
  {
    code: 'infected.dropped',
    severity: 'warning',
    tab: 'attributes',
    check: c =>
      runnerInfected(c.b, c.data)
        ? CORE_ATTRS.flatMap(k => {
            const r = attrRating(c.b, k, c.p),
              max = attrMax(c.data, c.cr, c.b, k)!
            return r > max
              ? [
                  {
                    path: `attributes.${k}`,
                    message: `${A(k)} ${r} is above the Infected maximum of ${max}: it drops to ${max}, the spend not refunded.`,
                    ...SWC(104),
                  },
                ]
              : []
          })
        : [],
  },
  // a quality granted only (a Returned Soldier power): taken, a quality the runner has must offer its list (a
  // prerequisite: an error), and no more of the list than that quality's choices allow (the list's max, else the
  // choice's count: a warning)
  { code: 'quality.granted', severity: 'error', tab: 'qualities', check: c => granted(c).filter(h => h.none) },
  { code: 'quality.grantedCount', severity: 'warning', tab: 'qualities', check: c => granted(c).filter(h => !h.none) },
  // Commlink6's HandleAugmentationGradeStep: omega-grade ware gives the runner the Bad Luck quality (Body Shop)
  {
    code: 'grade.omegaBadLuck',
    severity: 'warning',
    tab: 'qualities',
    check: c =>
      c.b.purchases.some(x => x.grade === 'omega') && !c.b.qualities.some(q => /^bad luck\b/i.test(c.data.entry('qualities', q.id)?.name ?? ''))
        ? { message: 'Omega-grade ware brings the Bad Luck quality; add it (Body Shop).' }
        : null,
  },
  // owner ruling 4 (2026-10-31), from the book: Permanent Damage (Body Shop p. 16) can't be taken at Essence 6; Essence
  // Regrowth (p. 16) can't be taken at character creation
  {
    code: 'quality.permanentDamage',
    severity: 'error',
    tab: 'qualities',
    check: c =>
      activeRules(c.b, c.data).has('CANNOT_USE_ESSENCE_HOLE') && c.budgets.essence.spent <= 0
        ? { message: 'Permanent Damage can’t be taken by a runner with 6 Essence.', source: 'BS', page: 16 }
        : null,
  },
  {
    code: 'quality.essenceRegrowth',
    severity: 'error',
    tab: 'qualities',
    check: c =>
      !c.ch.finalizedAt && activeRules(c.b, c.data).has('ESSENCE_REGROWTH')
        ? { message: 'Essence Regrowth can’t be taken at character creation.', source: 'BS', page: 16 }
        : null,
  },
  // the cyberadept path (H&S pp. 86–87, owner ruling 4): ware taken after a step must be of its least grade or better
  {
    code: 'grade.cyberadept',
    severity: 'error',
    tab: 'augmentations',
    check: c =>
      cyberadeptSteps(c.b, c.data).flatMap(st => {
        const r = CYBERADEPT[st.step]
        return c.b.purchases
          .filter(x => x.kind === 'augmentations' && (x.seq ?? 0) > st.seq && (GRADE_RANK[x.grade ?? 'standard'] ?? 99) < GRADE_RANK[r.min])
          .map(x => ({
            message: `${entryOf(x, c.data)?.name ?? x.name ?? 'An augmentation'} is ${x.grade ?? 'standard'} grade; after ${r.name} new ware must be ${r.min} grade or better.`,
            source: 'HS',
            page: r.page,
          }))
      }),
  },
  // All Business (SWC p. 135, RULE MAX_3_CONTACT_LOYALTY): no contact's Loyalty above 3
  {
    code: 'contact.allBusiness',
    severity: 'error',
    tab: 'contacts',
    check: c =>
      activeRules(c.b, c.data).has('MAX_3_CONTACT_LOYALTY')
        ? c.b.contacts.filter(x => x.loyalty > 3).map(x => ({ message: `${x.name || 'A contact'} has Loyalty ${x.loyalty}; All Business allows at most 3.` }))
        : null,
  },

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

  // Quality paths (domain/paths.ts): the saved progress against the loaded paths; waits until they are loaded
  {
    code: 'path.progress',
    severity: 'warning',
    tab: 'qualities',
    check: c => {
      if (!c.paths.length) return []
      const hits: Hit[] = []
      for (const p of c.ch.pathProgress ?? []) {
        const path = c.paths.find(x => x.id === p.pathId)
        const at = `qualities.path.${p.pathId}`
        if (!path || !stepOf(path, p.currentStepId)) {
          hits.push({ path: at, message: `Quality path ${p.pathId}: ${path ? `step ${p.currentStepId}` : 'the path'} isn’t in the loaded paths.` })
          continue
        }
        p.visitedStepIds.forEach((id, i) => {
          if (i && !stepOf(path, p.visitedStepIds[i - 1])?.nextSteps.includes(id))
            hits.push({ path: at, message: `${path.name}: step ${id} doesn’t follow ${p.visitedStepIds[i - 1]}.` })
        })
        for (const id of new Set(p.visitedStepIds)) {
          const step = stepOf(path, id)
          if (!step) continue
          if (step.modifications.some(m => m.op === 'choice') && !p.choicesByStepId[id])
            hits.push({ path: at, message: `${path.name}: ${step.name} asks for a choice; none is recorded.` })
          for (const m of step.modifications)
            if ((m.op === 'add' || m.op === 'remove') && m.ref !== 'quality:CHOICE' && !qualityIdOf(c.data, m.ref, path.bookKey, path))
              hits.push({ path: at, message: `${path.name}: ${step.name} names ${m.ref}, which isn’t in the catalog (skipped).` })
        }
      }
      return hits
    },
  },
  // a number the build can't hold below 0 (a hand-edited file): it would turn a cost into a refund and clear the hard
  // blocks below, so it is hard too (owner's decision 19)
  { code: 'value.negative', severity: 'error', tab: 'review', hard: true, check: c => negatives(c.b) },
  // owner's decision 19 (2026-10-11): negative Karma or nuyen is fine while building; Finalize waits until neither is
  { code: 'karma.overspent', severity: 'error', tab: 'review', hard: true, check: c => over(c.budgets.karma, 'Karma') },
]
