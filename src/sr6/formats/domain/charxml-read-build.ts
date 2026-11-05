// Shadowrun 6 runner XML: reading the <build> element and the lifestyle migration (see charxml.ts).
import { each, kids } from '../../../core/shared/xml'
import {
  CORE_ATTRS,
  CP_POOLS,
  itemLicence,
  rateLicences,
  PRIORITY_COLUMNS,
  SR6_ATTRS,
  SR6_METHODS,
  blankBuild,
  type Sr6Build,
  type Sr6Character,
  type Sr6Lifestyle,
  type Sr6Sin,
} from './character'
import { MAGIC_KINDS } from './charxml-common'
import {
  def,
  label,
  listOrNone,
  num,
  oneOf,
  readContact,
  readDracoform,
  readKnowledge,
  readMartial,
  readPick,
  readPurchase,
  readQuality,
  readSpirit,
  str,
  yes,
} from './charxml-read'

export function readBuild(b: Element, fix?: string[]): Sr6Build {
  const out = blankBuild(oneOf(b.getAttribute('method'), SR6_METHODS, 'method', 'priority', fix))
  out.magic = oneOf(b.getAttribute('magic'), MAGIC_KINDS, 'magic kind', 'mundane', fix)!
  // (the Awakened override: absent, derived; the kind before an Infected type changed it)
  const awake = b.getAttribute('awakened'),
    from = b.getAttribute('infectedFrom')
  const yesNo = awake == null ? undefined : oneOf(awake, ['true', 'false', '1', '0'] as const, 'Awakened override', undefined, fix) // (xs:boolean)
  if (yesNo) out.awakened = yesNo === 'true' || yesNo === '1'
  if (from != null) out.infectedFrom = oneOf(from, MAGIC_KINDS, 'magic kind before the Infected type', undefined, fix)
  const drain = b.getAttribute('drainAttr')
  const adv = b.getAttribute('mentorAdvantage')
  Object.assign(
    out,
    def({
      aspectedSkill: str(b, 'aspectedSkill'),
      tradition: str(b, 'tradition'),
      surgeCollective: str(b, 'surgeCollective'),
      surgeChoice: str(b, 'surgeChoice'),
      dracoform: readDracoform(str(b, 'dracoform')),
      mentorSpirit: str(b, 'mentorSpirit'),
      mentorAdvantage: adv == null ? undefined : oneOf(adv, ['magician', 'adept'] as const, 'mentor advantage', undefined, fix),
      drainAttr: drain == null ? undefined : oneOf(drain, ['log', 'int', 'cha'] as const, 'drain attribute', undefined, fix),
      ...Object.fromEntries(
        (['bestAttr', 'bestExtra'] as const).map(k => [
          k,
          b.getAttribute(k) == null ? undefined : oneOf(b.getAttribute(k), CORE_ATTRS, 'best attribute', undefined, fix),
        ]),
      ),
    }),
  )
  for (const k of ['powerPointsBought', 'initiation', 'submersion', 'transhuman', 'karmaToNuyen', 'karmaToDeck'] as const) out[k] = num(b, k, 0)
  each(
    kids(b, 'priority'),
    e => {
      const l = e.getAttribute('letter')
      out.priorities[oneOf(e.getAttribute('column'), PRIORITY_COLUMNS, 'priority column')!] =
        l == null ? null : oneOf(l, ['A', 'B', 'C', 'D', 'E'] as const, 'priority letter')!
    },
    label,
    fix,
  )
  each(
    kids(b, 'cp'),
    e => {
      out.cp[oneOf(e.getAttribute('pool'), CP_POOLS, 'character point pool')!] = num(e, 'points', 0)
    },
    label,
    fix,
  )
  out.lifepath = each(
    kids(b, 'lifemodule'),
    e => {
      const cs = kids(e, 'choice'),
        lines = Object.fromEntries(cs.filter(c => c.getAttribute('line')).map(c => [num(c, 'index', 0), c.getAttribute('line')!]))
      return {
        id: e.getAttribute('id') ?? '',
        choices: Object.fromEntries(cs.map(c => [num(c, 'index', 0), c.getAttribute('pick') ?? ''])),
        ...(Object.keys(lines).length ? { lines } : {}),
      }
    },
    label,
    fix,
  )
  each(
    kids(b, 'attribute'),
    e => {
      out.attributes[oneOf(e.getAttribute('id'), SR6_ATTRS, 'attribute')!] = {
        points: num(e, 'points', 0),
        adjust: num(e, 'adjust', 0),
        karma: num(e, 'karma', 0),
      }
    },
    label,
    fix,
  )
  out.skills = each(
    kids(b, 'skill'),
    e =>
      def({
        id: e.getAttribute('id') ?? '',
        points: num(e, 'points', 0),
        karma: num(e, 'karma', 0),
        spec: str(e, 'spec'),
        expertise: str(e, 'expertise'),
        // (a file from before 0.13.2 kept them in one `; `-separated attribute)
        specs: listOrNone([...kids(e, 'spec').map(x => x.textContent ?? ''), ...(str(e, 'specs')?.split(/;\s*/) ?? [])].map(x => x.trim()).filter(Boolean)),
      }),
    label,
    fix,
  )
  out.knowledge = each(kids(b, 'knowledge'), readKnowledge, label, fix)
  out.qualities = each(kids(b, 'quality'), readQuality, label, fix)
  out.picks = each(kids(b, 'pick'), readPick, label, fix)
  out.martialArts = each(kids(b, 'martialart'), e => readMartial(e, fix), label, fix)
  out.sins = each(kids(b, 'sin'), readSin, label, fix)
  // an older file's item licences (on the line, before every licence was one of a SIN's: owner 2026-10-16) move onto the
  // SINs they name, a fake SIN's rated as its SIN; one naming no SIN of the runner is left out, noted
  out.purchases = each(
    kids(b, 'purchase'),
    e =>
      readPurchase(e, fix, (x, on) => {
        for (const uid of on) {
          const s = out.sins.find(s => s.uid === (uid || out.sins[0]?.uid))
          if (s && !s.licences.some(l => l.item === x.uid)) s.licences.push(itemLicence(x, s))
          else if (!s) fix?.push(`${x.name || 'A custom item'}: its licence names no SIN of the runner, so it’s left out (licence it on a SIN on Contacts).`)
        }
      }),
    label,
    fix,
  )
  out.contacts = each(kids(b, 'contact'), readContact, label, fix)
  out.boundSpirits = each(kids(b, 'spirit'), readSpirit, label, fix)
  return out
}
/** (every licence rated as its SIN, an older file's another rating too: owner 2026-10-16) */
export function readSin(e: Element): Sr6Sin {
  const lifestyles = kids(e, 'lifestyle').map(readLifestyle)
  return rateLicences(
    def({
      uid: e.getAttribute('uid') ?? '',
      name: e.getAttribute('name') ?? '',
      kind: oneOf(e.getAttribute('kind'), ['real', 'fake'] as const, 'SIN kind')!,
      rating: num(e, 'rating'),
      gender: str(e, 'gender'),
      licences: kids(e, 'licence').map(l => def({ name: l.getAttribute('name') ?? '', rating: num(l, 'rating', 0), item: str(l, 'item') })),
      lifestyles: lifestyles.length ? lifestyles : undefined,
      placeholder: yes(e, 'placeholder'),
      pack: str(e, 'pack'),
    }),
  )
}
export const readLifestyle = (e: Element): Sr6Lifestyle =>
  def({ uid: e.getAttribute('uid') ?? '', id: e.getAttribute('id') ?? '', months: num(e, 'months', 0), pack: str(e, 'pack') })

/** An older file's one lifestyle (<build><lifestyle>) goes on the first SIN, and its ledger's lifestyle spends naming no
 *  SIN replay there (career.ts); a runner with either and no SIN gets an unnamed placeholder SIN (free; Review asks the
 *  player to name it or move the lifestyle: rules.ts sin.placeholder). */
export function migrateLifestyle(ch: Sr6Character, old: Element | undefined) {
  const b = ch.build
  if (!old && !ch.ledger.some(e => e.type === 'advance' && e.advance.op === 'lifestyle' && !e.advance.sin)) return
  if (!b.sins.length) b.sins.push({ uid: `${ch.id}-sin`, name: '', kind: 'real', licences: [], placeholder: true })
  const sin = b.sins[0],
    id = old?.getAttribute('id') ?? ''
  if (old) sin.lifestyles = [{ uid: `${sin.uid}-${id}`, id, months: num(old, 'months', 0) }, ...(sin.lifestyles ?? [])]
}
