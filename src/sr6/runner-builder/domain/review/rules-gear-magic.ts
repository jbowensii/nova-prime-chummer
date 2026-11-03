// Review rules, gear and augmentations, essence, spells, metamagic, adept powers and foci. Part of the rules table (rules.ts assembles it in order).
import { type Sr6Purchase } from '../../../formats/domain/character'
import {
  augmentationSlot,
  dataStructureLevels,
  isFocus,
  attrRating,
  entryOf,
  extraMagic,
  noteAttr,
  noteSkill,
  priced,
  qualityChoice,
  ratingOf,
  skillRank,
} from '../creation/budgets'
import { cite, flag, num, str } from '../../../table-setup/domain/creation'
import { animalismAllowed, animalismGrade, animalismMax, animalismPicks, isAnimalism } from '../creation/animalism'
import { MAGIC_KINDS, metamagicFits, picksFor } from '../../../catalog/domain/data'
import { ratingRange } from '../../../catalog/domain/values'
import { gradeFits, gradeKnown, gradeName } from '../creation/grades'
import { effectiveAvailability } from '../creation/rule-markers'
import {
  type Hit,
  type Rule,
  kindLabel,
  article,
  usesLetters,
  fmt,
  n0,
  over,
  entryCite,
  CRB,
  CRB_HK,
  SWC,
  lines,
  pickName,
  incompatible,
  nameOf,
  ammoKinds,
  AMMO_KINDS,
} from './context'

export const RULES_GEAR_MAGIC: Rule[] = [
  {
    code: 'nuyen.overspent',
    severity: 'error',
    tab: 'gear',
    hard: true,
    check: c => {
      const hit = over(c.budgets.nuyen, 'Nuyen', '¥'),
        size = c.budgets.nuyen.breakdown?.find(l => l.key === 'sizePricing')?.amount
      // a GM can't approve this one: name the price modifiers when they are part of the cost (metatypeSizePricing)
      return hit && size ? { message: `${hit.message.slice(0, -1)}; the price modifiers add ${fmt(size)}¥.` } : hit
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
        const avail = effectiveAvailability(c.b, c.data, priced({ ...x, accessories: [] }, c.data, c.cr).avail)
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
        // compare the effective grades: an add-on with no grade of its own is already its implant's, so it's not noted
        if (!host || !own || (own.grade || 'standard') === (x.grade || 'standard') || host.kind !== 'augmentations') continue
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
        .filter(x => !allowed[x.kind] && !(x.kind === 'metamagics' && isAnimalism(c.data.entry('metamagics', x.id)))) // (animalism: any kind, owner 2026-10-31)
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
      // (an animalism power is bought outside initiation: animalism.ts)
      const n = c.b.picks
        .filter(x => x.kind === 'metamagics' && !isAnimalism(c.data.entry('metamagics', x.id)))
        .reduce((t, x) => t + (x.level ?? c.data.levelOf(c.data.entry('metamagics', x.id)) ?? 1), 0)
      if (n === c.b.initiation) return null
      const short = c.b.initiation - n
      return {
        message:
          short > 0
            ? `${n} metamagic${n === 1 ? '' : 's'} at initiation grade ${c.b.initiation}: each grade brings one, pick ${short} more.`
            : `${n} metamagic${n === 1 ? '' : 's'} at initiation grade ${c.b.initiation}: each grade brings one.`,
      }
    },
  },
  // Bestial Nature's animalism, as Commlink6 handles it (SR6AnimalismController): only while the table allows it
  // (ALLOW_ANIMALISM), and at creation up to its grade cap (CHARGEN_MAX_ANIMALISM, default 2)
  {
    code: 'magic.animalismOff',
    severity: 'error',
    tab: 'magic',
    check: c => (animalismAllowed(c.cr) || !animalismPicks(c.b, c.data).length ? null : { message: 'This table does not allow animalism.' }),
  },
  {
    code: 'magic.animalismMax',
    severity: 'error',
    tab: 'magic',
    check: c => {
      const g = animalismGrade(c.b, c.data),
        max = animalismMax(c.cr)
      return g <= max ? null : { message: `Animalism grade ${g} at creation; the most is ${max}.` }
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
    fixAt: 'attributes',
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
  // the Sixth World Companion's Transhumanism (p. 146): a mundane's grades, with the rule on
  {
    code: 'magic.transhuman',
    severity: 'error',
    tab: 'magic',
    fixAt: 'method',
    setting: () => ['transhumanism'],
    check: c => {
      if (c.b.transhuman <= 0) return null
      const k = MAGIC_KINDS[c.b.magic]
      if (!flag(c.cr, 'transhumanism')) return { message: `Transhumanist grade ${c.b.transhuman}: the optional rule is off at this table.`, ...SWC(146) }
      return k.spells || k.powers || k.resonance ? { message: 'Transhumanism is for a mundane runner.', ...SWC(146) } : null
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
  // the same house rule for the Sixth World Companion's transhumanist grades (a rule of its own: its cap is set only with Transhumanism)
  {
    code: 'magic.gradeCapCreationTranshuman',
    severity: 'error',
    tab: 'magic',
    setting: c => (flag(c.cr, 'gradeCapAtCreation') && flag(c.cr, 'transhumanism') ? ['gradeCap.transhuman'] : []),
    check: c => {
      if (!flag(c.cr, 'gradeCapAtCreation') || !flag(c.cr, 'transhumanism')) return null
      const h = n0(c.cr, 'gradeCap.transhuman')
      return c.b.transhuman > h ? { message: `Transhumanist grade ${c.b.transhuman} at creation: the table’s cap is ${h}.` } : null
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
    fixAt: 'attributes',
    check: c => {
      const cap = c.budgets.powerPoints.cap
      return !MAGIC_KINDS[c.b.magic].paysPowers || c.b.method === 'pointbuy' || c.b.powerPointsBought <= cap
        ? null
        : { message: `${c.b.powerPointsBought} power points bought; the most is the Magic rating, ${cap}.` }
    },
  },
]
