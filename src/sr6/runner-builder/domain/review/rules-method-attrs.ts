// Review rules, creation method and attributes: priority/letters, metatype and magic allowed, attribute caps. Part of the rules table (rules.ts assembles it in order).
import { CORE_ATTRS, LETTERS, MAGIC_KIND_LABELS, type Sr6Attr } from '../../../formats/domain/character'
import { magicCap, attrMax, attrRating } from '../creation/budgets'
import { cite, flag, str } from '../../../table-setup/domain/creation'
import { boughtKind, runnerInfected } from '../creation/infected'
import { type Rule, A, usesLetters, n0, over, metaName, has } from './context'

export const RULES_METHOD_ATTRS: Rule[] = [
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
    // shows on Magic (Method once the Magic tab is gone), fixed on Method
    tab: 'magic',
    fixAt: 'method',
    // (the kind the method bought: one an Infected type gave isn't the method's, infected.ts boughtKind)
    check: c =>
      c.p.legalMagic(c.b).some(m => m.kind === boughtKind(c.b))
        ? null
        : usesLetters(c.p) && !c.b.priorities.magic
          ? { message: `Set the Magic priority on Creation method: ${MAGIC_KIND_LABELS[boughtKind(c.b)]} needs one.` }
          : { message: `${MAGIC_KIND_LABELS[boughtKind(c.b)]} isn’t available at magic priority ${c.b.priorities.magic ?? '(none)'}.` },
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
      // (an Infected's core attributes drop to its type's maxima instead: infected.dropped)
      return [...(runnerInfected(c.b, c.data) ? [] : CORE_ATTRS), 'edg' as const].flatMap(k => {
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
          max = magicCap(c.b, c.cr, k, c.data) ?? 0
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
]
