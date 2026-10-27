// Shadowrun 6 runner <-> XML (docs/sr6-character-format.md, public/data/sr6/schema/character.xsd): the file a runner is
// saved as in /api/sr6/characters and what Export writes. Summary fields sit on the root as Anarchy's
// (src/ca2/formats/domain/charxml.ts), with the writing and reading helpers both games share (src/core/shared/xml.ts).
import { attrs, each, el, esc, kid, kids, readDoc, text, type ReadOpts } from '../../../core/shared/xml'
import { BACKDROPS, type Backdrop } from '../../../core/shared/types'
import {
  BONUS_SWITCHES,
  BONUS_TARGETS,
  CONTACT_TYPES,
  CORE_ATTRS,
  CP_POOLS,
  itemLicence,
  rateLicences,
  MAGIC_KIND_LABELS,
  PICK_KINDS,
  PRIORITY_COLUMNS,
  PET_CLASSES,
  PURCHASE_KINDS,
  SR6_ADVANCE_OPS,
  SHIFT_KINDS,
  SR6_ATTRS,
  SR6_LEDGER_TYPES,
  SR6_METHODS,
  SR6_NPC_KINDS,
  SR6_NPC_PARTS,
  blankBuild,
  type Bonus,
  type BonusSwitch,
  type ContactType,
  type MagicKind,
  type SlotShift,
  type Sr6Advance,
  type Sr6Build,
  type Sr6Character,
  type Sr6Contact,
  type Sr6CritterQuality,
  type Sr6CritterTrained,
  type Sr6Design,
  type Sr6Knowledge,
  type Sr6LedgerEntry,
  type Sr6MartialArt,
  type Sr6Npc,
  type Sr6Pick,
  type Sr6Printed,
  type Sr6Purchase,
  type Sr6Quality,
  type Sr6Sin,
} from './character'
import { SR6_KINDS, type Sr6Entry, type Sr6Kind } from './types'
import { sr6EntryXml, toEntry } from './entryxml'

export const SR6_CHAR_NS = 'urn:chummer-sr6:character:1'
const FORMAT_VERSION = 1
const MAGIC_KINDS = Object.keys(MAGIC_KIND_LABELS) as MagicKind[]

// ---- writing ----
const bonusXml = (x: Bonus) =>
  el('bonus', {
    target: x.target,
    skill: x.skill,
    value: x.value,
    perRating: x.perRating,
    minus: x.minus,
    byRating: x.byRating?.length ? x.byRating.join(',') : undefined,
    when: x.when,
    spec: x.spec,
    switch: x.switch,
    affects: x.affects,
  })
const bonusesXml = (xs?: Bonus[]) => (xs ?? []).map(bonusXml).join('')
function purchaseXml(p: Sr6Purchase): string {
  return el(
    'purchase',
    {
      uid: p.uid,
      sin: p.sin,
      kind: p.kind,
      id: p.id,
      name: p.name,
      cost: p.cost,
      gmPrice: p.gmPrice,
      avail: p.avail,
      essence: p.essence,
      rating: p.rating,
      qty: p.qty,
      grade: p.grade,
      worn: p.worn,
      note: p.note,
      seatsRemoved: p.seatsRemoved,
      mount: p.mount,
      diy: p.diy,
      material: p.material,
      design: p.design,
      slotShifts: p.slotShifts?.length ? p.slotShifts.map(t => `${t.from}>${t.to}`).join(' ') : undefined,
      addedSlots: p.addedSlots?.length ? p.addedSlots.map(s => (s.value ? `${s.id}:${s.value}` : s.id)).join(' ') : undefined,
      removedBuiltins: p.removedBuiltins?.length ? p.removedBuiltins.join(' ') : undefined,
      pet: p.pet,
      tamed: p.tamed,
    },
    bonusesXml(p.bonuses) +
      (p.critterQualities ?? []).map(critterQualityXml).join('') +
      (p.trained ?? []).map(trainedXml).join('') +
      p.accessories.map(purchaseXml).join('') +
      (p.snapshot ? `<snapshot>${sr6EntryXml(p.snapshot)}</snapshot>` : ''),
  )
}
const critterQualityXml = (q: Sr6CritterQuality) => el('quality', { uid: q.uid, id: q.id, level: q.level, name: q.name, how: q.how })
const trainedXml = (t: Sr6CritterTrained) => el('trained', { uid: t.uid, what: t.what, id: t.id, name: t.name, taught: t.taught })

// one writer per line kind: the build's lines and a ledger entry's line are the same element
const knowledgeXml = (k: Sr6Knowledge) =>
  `<knowledge${attrs({ uid: k.uid, kind: k.kind, native: k.native, points: k.points, karma: k.karma, payment: k.payment })}>${esc(k.name)}</knowledge>`
const qualityXml = (q: Sr6Quality) =>
  el('quality', { uid: q.uid, id: q.id, level: q.level, karma: q.karma, free: q.free, note: q.note, name: q.name, boughtOff: q.boughtOff })
const pickXml = (p: Sr6Pick) => el('pick', { uid: p.uid, kind: p.kind, id: p.id, level: p.level, name: p.name, note: p.note }, bonusesXml(p.bonuses))
const techniqueXml = (t: Sr6MartialArt['techniques'][number]) => el('technique', { uid: t.uid, id: t.id, name: t.name })
const martialXml = (m: Sr6MartialArt) => el('martialart', { uid: m.uid, id: m.id, name: m.name }, m.techniques.map(techniqueXml).join(''))
const contactXml = (c: Sr6Contact) =>
  el('contact', {
    uid: c.uid,
    name: c.name,
    archetype: c.archetype,
    connection: c.connection,
    loyalty: c.loyalty,
    types: c.types?.length ? c.types.join(' ') : undefined,
  })
const sinXml = (s: Sr6Sin) =>
  el(
    'sin',
    { uid: s.uid, name: s.name, kind: s.kind, rating: s.rating, gender: s.gender, placeholder: s.placeholder },
    s.licences.map(l => el('licence', { ...l })).join('') + (s.lifestyles ?? []).map(l => el('lifestyle', { uid: l.uid, id: l.id, months: l.months })).join(''),
  )

function buildXml(b: Sr6Build): string {
  const rows = [
    ...PRIORITY_COLUMNS.map(column => el('priority', { column, letter: b.priorities[column] })),
    ...CP_POOLS.map(pool => el('cp', { pool, points: b.cp[pool] })),
    ...b.lifepath.map(m =>
      el(
        'lifemodule',
        { id: m.id },
        Object.entries(m.choices)
          .map(([index, pick]) => el('choice', { index, pick }))
          .join(''),
      ),
    ),
    ...SR6_ATTRS.map(id => el('attribute', { id, ...b.attributes[id] })),
    // (the specializations past the first one element each: a name may hold any character)
    ...b.skills.map(s =>
      el('skill', { id: s.id, points: s.points, karma: s.karma, spec: s.spec, expertise: s.expertise }, (s.specs ?? []).map(x => text('spec', x)).join('')),
    ),
    ...b.knowledge.map(knowledgeXml),
    ...b.qualities.map(qualityXml),
    ...b.picks.map(pickXml),
    ...b.martialArts.map(martialXml),
    ...b.purchases.map(purchaseXml),
    ...b.contacts.map(contactXml),
    ...b.sins.map(sinXml),
  ]
  return el(
    'build',
    {
      method: b.method,
      magic: b.magic,
      awakened: b.awakened,
      infectedFrom: b.infectedFrom,
      aspectedSkill: b.aspectedSkill,
      tradition: b.tradition,
      drainAttr: b.drainAttr,
      mentorSpirit: b.mentorSpirit,
      mentorAdvantage: b.mentorAdvantage,
      powerPointsBought: b.powerPointsBought,
      initiation: b.initiation,
      submersion: b.submersion,
      ...(b.transhuman ? { transhuman: b.transhuman } : {}),
      karmaToNuyen: b.karmaToNuyen,
      ...(b.karmaToDeck ? { karmaToDeck: b.karmaToDeck } : {}),
      bestAttr: b.bestAttr,
      bestExtra: b.bestExtra,
    },
    `\n    ${rows.join('\n    ')}\n  `,
  )
}

/** An advance's attributes and its one line (convert's karma is the entry's). */
function advanceXml(a: Sr6Advance): [Record<string, unknown>, string] {
  switch (a.op) {
    case 'attribute':
    case 'skill':
      return [{ target: a.target }, '']
    case 'spec':
    case 'expertise':
      return [{ target: a.target, name: a.name }, '']
    case 'knowledge':
      return [{}, knowledgeXml(a.line)]
    case 'quality':
      return [{ target: a.target, magic: a.magic }, qualityXml(a.line)]
    case 'buyoff':
      return [{ target: a.target, part: a.part }, a.line ? qualityXml(a.line) : '']
    case 'pick':
      return [{ target: a.target }, pickXml(a.line)]
    case 'martialart':
      return [{}, martialXml(a.line)]
    case 'technique':
      return [{ target: a.target }, techniqueXml(a.line)]
    case 'initiate':
      return [{ target: a.target }, a.line ? pickXml(a.line) : '']
    case 'purchase':
      return [{}, purchaseXml(a.line)]
    case 'drop':
      return [{ target: a.target, refund: a.refund }, a.line ? purchaseXml(a.line) : '']
    case 'upgrade':
    case 'fit':
      return [{ target: a.target }, purchaseXml(a.line)]
    case 'unfit':
      return [{ target: a.target, refund: a.refund }, a.line ? purchaseXml(a.line) : '']
    case 'shift':
      return [{ target: a.target, from: a.from, to: a.to }, '']
    case 'move':
      return [{ target: a.target, mount: a.mount }, '']
    case 'bond':
      return [{ target: a.target }, critterQualityXml(a.line) + (a.with ? critterQualityXml(a.with) : '')]
    case 'teach':
      return [{ target: a.target }, trainedXml(a.line)]
    case 'contact':
      return [{}, contactXml(a.line)]
    case 'sin':
      return [{}, sinXml(a.line)]
    case 'lifestyle':
      return [{ lifestyle: a.id, months: a.months, sin: a.sin, uid: a.uid }, '']
    case 'awakened':
      return [{ awakened: a.value }, '']
    case 'licensed':
      return [{ target: a.target, sin: a.sin, name: a.name }, '']
    case 'powerpoint':
    case 'convert':
    case 'other':
      return [{}, '']
  }
}
function entryXml(e: Sr6LedgerEntry): string {
  const head = { id: e.id, at: e.at, type: e.type }
  switch (e.type) {
    case 'finalize':
      return el('entry', { ...head, karma: e.karma, nuyen: e.nuyen })
    case 'earn':
      return el('entry', { ...head, karma: e.karma, nuyen: e.nuyen, date: e.date }, esc(e.run))
    case 'note':
      return el('entry', head, esc(e.text))
    case 'void':
      return el('entry', { ...head, event: e.eventId }, esc(e.reason))
    case 'advance': {
      const [a, line] = advanceXml(e.advance)
      return el('entry', { ...head, karma: e.karma, nuyen: e.nuyen, op: e.advance.op, ...a, label: e.label }, line)
    }
  }
}
const ledgerXml = (l: Sr6LedgerEntry[]) => (l.length ? `<ledger>\n    ${l.map(entryXml).join('\n    ')}\n  </ledger>` : '')

/** The career ledger alone, as its own file (import/export of the history without the runner). */
export const sr6LedgerToXml = (ledger: Sr6LedgerEntry[]) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<sr6:ledger xmlns:sr6="${SR6_CHAR_NS}" formatVersion="${FORMAT_VERSION}">\n    ${ledger.map(entryXml).join('\n    ')}\n  </sr6:ledger>\n`

/** Read a ledger-only file (sr6LedgerToXml): the entries, or why it can't be read. */
export function xmlToSr6Ledger(xml: string): { ok: true; ledger: Sr6LedgerEntry[] } | { ok: false; reason: string } {
  const parsed = readDoc(xml)
  if (!parsed.ok) return parsed
  const r = parsed.root
  if (r.localName !== 'ledger' || r.namespaceURI !== SR6_CHAR_NS) return { ok: false, reason: 'Not a Shadowrun 6 ledger file.' }
  try {
    return { ok: true, ledger: kids(r, 'entry').map(e => readEntry(e)) }
  } catch (e) {
    return { ok: false, reason: `Couldn’t read ${(e as Error).message}.` }
  }
}
// the compendium entries the runner uses, with their text (src/sr6/runner-builder/domain/career/house.ts)
const houseXml = (h?: Sr6Entry[]) => (h?.length ? `<house>${h.map(e => sr6EntryXml(e, true)).join('')}</house>` : '')

function npcXml(n?: Sr6Npc): string {
  if (!n) return ''
  const f = n.from,
    d = n.design
  return el(
    'npc',
    {
      kind: n.kind,
      rating: n.rating,
      group: n.group,
      fromKind: f?.kind,
      fromId: f?.id,
      fromName: f?.name,
      fromSource: f?.source,
      fromPage: f?.page,
      designed: d ? true : undefined,
      dice: d?.dice,
    },
    Object.entries(n.stats)
      .map(([key, value]) => el('stat', { key, value }))
      .join('') +
      n.lines.map(l => `<line${attrs({ part: l.part })}>${esc(l.text)}</line>`).join('') +
      (d
        ? d.powers.map(p => el('power', { ...p })).join('') +
          d.weaknesses.map(p => el('weakness', { ...p })).join('') +
          d.skills.map(s => el('skill', { ...s })).join('')
        : ''),
  )
}

// a vehicle or drone design (the Designer): its parts, options with their levels and the mods built in
const designXml = (d?: Sr6Design) =>
  d
    ? el(
        'design',
        { kind: d.kind, chassis: d.chassis, powertrain: d.powertrain, console: d.console, diy: d.diy, approved: d.approved },
        d.options.map(o => el('option', o)).join('') + d.mods.map(purchaseXml).join(''),
      )
    : ''

const rulesXml = (rs?: Sr6Character['rules']) =>
  rs?.length ? el('rules', {}, rs.map(r => el('setting', { key: r.key, value: r.value, assumed: r.assumed, source: r.source, page: r.page })).join('')) : ''
const printedXml = (p?: Sr6Printed) =>
  p
    ? el(
        'printed',
        { source: p.source, page: p.page },
        Object.entries(p.values)
          .map(([key, value]) => el('value', { key, value }))
          .join(''),
      )
    : ''

/** Serialize a runner. `rev` is the server's revision counter (omitted for exports). */
export function sr6ToXml(ch: Sr6Character, rev?: number): string {
  const id = ch.identity
  const body = [
    npcXml(ch.npc),
    designXml(ch.design),
    text('portrait', id.portrait) + text('token', id.token),
    text('background', id.background),
    text('notes', id.notes),
    printedXml(ch.printed),
    rulesXml(ch.rules),
    buildXml(ch.build),
    ledgerXml(ch.ledger),
    houseXml(ch.house),
    ...ch.overrides.map(o => el('override', { code: o.code, path: o.path }, esc(o.note))),
    ...(ch.migrated ?? []).map(m => el('migrated', m)),
  ]
    .filter(Boolean)
    .join('\n  ')
  const root = attrs({
    formatVersion: FORMAT_VERSION,
    id: ch.id,
    rev,
    streetName: id.streetName,
    name: id.name,
    gender: id.gender,
    metatype: ch.build.metatype,
    method: ch.build.method,
    backdrop: id.backdrop,
    finalizedAt: ch.finalizedAt,
    campaign: ch.campaign,
    updatedAt: ch.updatedAt,
    lastExportedAt: ch.lastExportedAt,
    finalKarma: ch.final?.karma,
    finalNuyen: ch.final?.nuyen,
    debtPercent: ch.debtPercent,
    sampleKey: ch.sampleKey,
  })
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sr6:character xmlns:sr6="${SR6_CHAR_NS}"${root}>\n  ${body}\n</sr6:character>\n`
}

// ---- reading ----
/** Leave out what isn't set, so a runner reads back exactly as written. */
const def = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
const listOrNone = <T>(xs: T[]) => (xs.length ? xs : undefined)
const str = (e: Element, a: string) => e.getAttribute(a) ?? undefined
const yes = (e: Element, a: string) => (e.getAttribute(a) === 'true' ? (true as const) : undefined)
/** A number attribute: absent → `absent`; not a number → throws naming it. */
function num(e: Element, a: string): number | undefined
function num(e: Element, a: string, absent: number): number
function num(e: Element, a: string, absent?: number) {
  const v = e.getAttribute(a)
  if (v == null) return absent
  const x = Number(v)
  if (v.trim() === '' || !Number.isFinite(x)) throw new Error(`${a}="${v}" isn’t a number`)
  return x
}
/** A value from a fixed list: anything else throws, or in repair becomes `fallback` (undefined: left out) with a note. */
function oneOf<T extends string>(v: string | null, allowed: readonly T[], what: string, fallback?: T, fix?: string[]): T | undefined {
  if ((allowed as readonly string[]).includes(v ?? '')) return v as T
  if (!fix) throw new Error(`${what} “${v ?? ''}” (not one of ${allowed.join(', ')})`)
  fix.push(`The ${what} “${v ?? ''}” isn’t known: ${fallback ? `set to ${fallback}` : 'left out'}.`)
  return fallback
}
const label = (e: Element, i: number) => `${e.localName} ${i + 1}`

function readBonus(e: Element): Bonus {
  const target = oneOf(e.getAttribute('target'), BONUS_TARGETS, 'bonus target')!,
    skill = str(e, 'skill')
  if (target === 'skill' && !skill) throw new Error('a skill bonus names no skill')
  const by = str(e, 'byRating')?.split(',').map(Number)
  return def({
    target,
    skill: target === 'skill' ? skill : undefined,
    value: num(e, 'value', 0),
    perRating: yes(e, 'perRating'),
    minus: num(e, 'minus'),
    byRating: by?.length && by.every(Number.isFinite) ? by : undefined,
    when: str(e, 'when'),
    spec: str(e, 'spec'),
    switch: (BONUS_SWITCHES as string[]).includes(str(e, 'switch') ?? '') ? (str(e, 'switch') as BonusSwitch) : undefined,
    affects: str(e, 'affects') === 'caster' || str(e, 'affects') === 'target' ? (str(e, 'affects') as Bonus['affects']) : undefined,
  })
}
const readBonuses = (e: Element) => {
  const xs = kids(e, 'bonus').map(readBonus)
  return xs.length ? xs : undefined
}

/** licensed: told an older line's licences (licensedOn: the SINs' uids; before it, licence="bought": the first SIN's, ''
 *  when the runner has none), which readBuild moves onto those SINs. */
function readPurchase(e: Element, fix?: string[], licensed?: (x: Sr6Purchase, sins: string[]) => void): Sr6Purchase {
  const kind = oneOf(e.getAttribute('kind'), PURCHASE_KINDS, 'purchase kind')!
  const snap = kid(e, 'snapshot')?.firstElementChild,
    on = str(e, 'licensedOn')?.split(/\s+/).filter(Boolean) ?? (e.getAttribute('licence') === 'bought' ? [''] : [])
  const x: Sr6Purchase = def({
    uid: e.getAttribute('uid') ?? '',
    kind,
    sin: str(e, 'sin'),
    id: str(e, 'id'),
    name: str(e, 'name'),
    cost: num(e, 'cost'),
    gmPrice: num(e, 'gmPrice'),
    avail: num(e, 'avail'),
    essence: num(e, 'essence'),
    rating: num(e, 'rating'),
    qty: num(e, 'qty', 1),
    grade: str(e, 'grade'),
    worn: yes(e, 'worn'),
    bonuses: readBonuses(e),
    note: str(e, 'note'),
    seatsRemoved: num(e, 'seatsRemoved'),
    mount: str(e, 'mount'),
    diy: yes(e, 'diy'),
    material: str(e, 'material'),
    design: str(e, 'design'),
    slotShifts: readShifts(e, fix),
    addedSlots: readAddedSlots(e),
    removedBuiltins: (u => (u.length ? u : undefined))(
      str(e, 'removedBuiltins')
        ?.split(/\s+/)
        .filter(w => /^builtin:\d+$/.test(w)) ?? [],
    ),
    pet: str(e, 'pet') === undefined ? undefined : oneOf(e.getAttribute('pet'), PET_CLASSES, 'pet class', undefined, fix),
    tamed: yes(e, 'tamed'),
    trained: listOrNone([...each(kids(e, 'trained'), readTrained, label, fix), ...olderTrained(e, fix)]),
    critterQualities: listOrNone(each(kids(e, 'quality'), readCritterQuality, label, fix)),
    accessories: each(kids(e, 'purchase'), x => readPurchase(x, fix, licensed), label, fix),
    snapshot: snap ? toEntry(snap, kind) : undefined,
  })
  // a weapon naming a mount its host doesn't have (a file edited by hand) sits in none: noted (a built-in one,
  // `builtin:<n>`, is the catalog's: vehiclemods.ts warns when it isn't there)
  for (const a of x.accessories)
    if (a.mount && !a.mount.startsWith('builtin:') && !x.accessories.some(m => m.uid === a.mount)) {
      fix?.push(`${a.name || 'A weapon'}: its weapon mount isn’t on ${x.name || 'its vehicle'}, so it’s in none (put it in one on the Vehicles or Drones tab).`)
      delete a.mount
    }
  if (on.length) licensed?.(x, on)
  return x
}

/** An owned critter's companion quality (`how`: tamed or bonded; none, specified with the purchase). */
const readCritterQuality = (e: Element): Sr6CritterQuality => {
  const how = str(e, 'how')
  if (how !== undefined && how !== 'tamed' && how !== 'bonded') throw new Error(`critter quality how “${how}” (not tamed or bonded)`)
  return def({ uid: e.getAttribute('uid') ?? '', id: e.getAttribute('id') ?? '', level: num(e, 'level', 1), name: str(e, 'name'), how })
}

/** An owned critter's named command or special training (`taught`: after it was bought; absent: with the purchase). */
const readTrained = (e: Element): Sr6CritterTrained => {
  const what = str(e, 'what')
  if (what !== 'command' && what !== 'training') throw new Error(`trained what “${what ?? ''}” (not command or training)`)
  return def({ uid: e.getAttribute('uid') ?? '', what, id: str(e, 'id'), name: str(e, 'name'), taught: yes(e, 'taught') })
}
/** The most of each an older file's count is read as: past any critter's Logic or Intuition × 2 (a count of 1e9 froze
 *  the load). */
const MAX_OLDER_TRAINED = 99
/** An older file's counts (`commands="2" training="1"`, before they were named): as many unnamed ones, with the purchase
 *  (a tamed critter's taught), noted so the player can pick which they are. A count that isn't a whole number from 0 is
 *  refused (in repair: none, noted); one past MAX_OLDER_TRAINED is refused (in repair: that many, noted). */
function olderTrained(e: Element, fix?: string[]): Sr6CritterTrained[] {
  const out: Sr6CritterTrained[] = [],
    who = e.getAttribute('name') || 'A critter'
  for (const what of ['command', 'training'] as const) {
    const a = what === 'command' ? 'commands' : 'training'
    let n = num(e, a) ?? 0
    if (!Number.isInteger(n) || n < 0) {
      if (!fix) throw new Error(`${a}="${n}" isn’t a whole number from 0`)
      fix.push(`${who}: its ${a} count “${n}” isn’t a whole number from 0, so it’s left out.`)
      n = 0
    } else if (n > MAX_OLDER_TRAINED) {
      if (!fix) throw new Error(`${a}="${n}" is more than ${MAX_OLDER_TRAINED}`)
      fix.push(`${who}: its ${a} count ${n} is more than any critter learns, so it’s read as ${MAX_OLDER_TRAINED}.`)
      n = MAX_OLDER_TRAINED
    }
    for (let i = 0; i < n; i++) out.push(def({ uid: `${e.getAttribute('uid') ?? ''}-${what}-${i + 1}`, what, taught: yes(e, 'tamed') }))
  }
  if (out.length)
    fix?.push(
      `${e.getAttribute('name') || 'A critter'}: its ${out.length} trained commands and special training had no names, so they’re kept unnamed (pick which they are on the Critters tab).`,
    )
  return out
}

/** A vehicle's slotShifts (`chassis>powertrain …`, Double Clutch p. 120); one that names no category pair is left out, noted. */
function readShifts(e: Element, fix?: string[]): SlotShift[] | undefined {
  const out: SlotShift[] = []
  for (const w of str(e, 'slotShifts')?.split(/\s+/).filter(Boolean) ?? []) {
    const [from, to] = w.split('>')
    if ((SHIFT_KINDS as string[]).includes(from) && (SHIFT_KINDS as string[]).includes(to) && from !== to) out.push({ from, to } as SlotShift)
    else if (fix) fix.push(`${e.getAttribute('name') || 'A vehicle'}: the mod slot shift “${w}” isn’t between two categories, so it’s left out.`)
    else throw new Error(`mod slot shift “${w}” (not category>category)`)
  }
  return out.length ? out : undefined
}

/** A host's GM-added slots (`id` or `id:value`, space-separated); an empty id is left out. */
function readAddedSlots(e: Element): { id: string; value?: string }[] | undefined {
  const out: { id: string; value?: string }[] = []
  for (const w of str(e, 'addedSlots')?.split(/\s+/).filter(Boolean) ?? []) {
    const i = w.indexOf(':'),
      id = i < 0 ? w : w.slice(0, i),
      value = i < 0 ? undefined : w.slice(i + 1)
    if (id) out.push(value ? { id, value } : { id })
  }
  return out.length ? out : undefined
}

const readKnowledge = (e: Element): Sr6Knowledge =>
  def({
    uid: e.getAttribute('uid') ?? '',
    name: e.textContent ?? '',
    kind: oneOf(e.getAttribute('kind'), ['knowledge', 'language'] as const, 'knowledge kind')!,
    native: yes(e, 'native'),
    payment: e.hasAttribute('payment') ? oneOf(e.getAttribute('payment'), ['nuyen'] as const, 'knowledge payment') : undefined,
    points: num(e, 'points', 0),
    karma: num(e, 'karma', 0),
  })
const readQuality = (e: Element): Sr6Quality =>
  def({
    uid: e.getAttribute('uid') ?? '',
    id: e.getAttribute('id') ?? '',
    level: num(e, 'level', 1),
    karma: num(e, 'karma'),
    free: yes(e, 'free'),
    note: str(e, 'note'),
    name: str(e, 'name'),
    boughtOff: num(e, 'boughtOff'),
  })
const readPick = (e: Element): Sr6Pick =>
  def({
    uid: e.getAttribute('uid') ?? '',
    kind: oneOf(e.getAttribute('kind'), PICK_KINDS, 'pick kind')!,
    id: e.getAttribute('id') ?? '',
    level: num(e, 'level'),
    bonuses: readBonuses(e),
    name: str(e, 'name'),
    note: str(e, 'note'),
  })
const readTechnique = (e: Element) => def({ uid: e.getAttribute('uid') ?? '', id: e.getAttribute('id') ?? '', name: str(e, 'name') })
const readMartial = (e: Element, fix?: string[]): Sr6MartialArt =>
  def({
    uid: e.getAttribute('uid') ?? '',
    id: e.getAttribute('id') ?? '',
    name: str(e, 'name'),
    techniques: each(kids(e, 'technique'), readTechnique, label, fix),
  })
const readContact = (e: Element): Sr6Contact => {
  const types = (e.getAttribute('types') ?? '').split(/\s+/).filter(t => (CONTACT_TYPES as string[]).includes(t)) as ContactType[]
  return def({
    uid: e.getAttribute('uid') ?? '',
    name: e.getAttribute('name') ?? '',
    archetype: e.getAttribute('archetype') ?? '',
    connection: num(e, 'connection', 0),
    loyalty: num(e, 'loyalty', 0),
    types: types.length ? types : undefined,
  })
}

function readBuild(b: Element, fix?: string[]): Sr6Build {
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
    e => ({ id: e.getAttribute('id') ?? '', choices: Object.fromEntries(kids(e, 'choice').map(c => [num(c, 'index', 0), c.getAttribute('pick') ?? ''])) }),
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
  return out
}
/** (every licence rated as its SIN, an older file's another rating too: owner 2026-10-16) */
function readSin(e: Element): Sr6Sin {
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
    }),
  )
}
const readLifestyle = (e: Element) => ({ uid: e.getAttribute('uid') ?? '', id: e.getAttribute('id') ?? '', months: num(e, 'months', 0) })

/** An older file's one lifestyle (<build><lifestyle>) goes on the first SIN, and its ledger's lifestyle spends naming no
 *  SIN replay there (career.ts); a runner with either and no SIN gets an unnamed placeholder SIN (free; Review asks the
 *  player to name it or move the lifestyle: rules.ts sin.placeholder). */
function migrateLifestyle(ch: Sr6Character, old: Element | undefined) {
  const b = ch.build
  if (!old && !ch.ledger.some(e => e.type === 'advance' && e.advance.op === 'lifestyle' && !e.advance.sin)) return
  if (!b.sins.length) b.sins.push({ uid: `${ch.id}-sin`, name: '', kind: 'real', licences: [], placeholder: true })
  const sin = b.sins[0],
    id = old?.getAttribute('id') ?? ''
  if (old) sin.lifestyles = [{ uid: `${sin.uid}-${id}`, id, months: num(old, 'months', 0) }, ...(sin.lifestyles ?? [])]
}

// ---- the ledger and the NPC block ----
/** An attribute that must be there. */
const req = (e: Element, a: string) => {
  const v = e.getAttribute(a)
  if (v == null) throw new Error(`no ${a}`)
  return v
}
/** The entry's line element, read; `need`: missing throws. */
function line<T>(e: Element, name: string, read: (x: Element) => T, need: true): T
function line<T>(e: Element, name: string, read: (x: Element) => T): T | undefined
function line<T>(e: Element, name: string, read: (x: Element) => T, need?: true) {
  const x = kid(e, name)
  if (!x && need) throw new Error(`no <${name}> inside the entry`)
  return x ? read(x) : undefined
}

function readAdvance(e: Element, karma: number, fix?: string[]): Sr6Advance {
  const op = oneOf(e.getAttribute('op'), SR6_ADVANCE_OPS, 'advance op')!
  const purchase = (x: Element) => readPurchase(x, fix)
  switch (op) {
    case 'attribute':
      return { op, target: oneOf(e.getAttribute('target'), SR6_ATTRS, 'attribute')! }
    case 'skill':
      return { op, target: req(e, 'target') }
    case 'spec':
    case 'expertise':
      return { op, target: req(e, 'target'), name: req(e, 'name') }
    case 'knowledge':
      return { op, line: line(e, 'knowledge', readKnowledge, true) }
    case 'quality': {
      const m = e.getAttribute('magic')
      return def({
        op,
        line: line(e, 'quality', readQuality, true),
        target: str(e, 'target'),
        magic: m == null ? undefined : oneOf(m, MAGIC_KINDS, 'magic kind an Infected type gives', undefined, fix),
      })
    }
    case 'buyoff':
      return def({ op, target: req(e, 'target'), line: line(e, 'quality', readQuality), part: num(e, 'part') })
    case 'pick':
      return def({ op, line: line(e, 'pick', readPick, true), target: str(e, 'target') })
    case 'martialart':
      return { op, line: line(e, 'martialart', x => readMartial(x, fix), true) }
    case 'technique':
      return { op, target: req(e, 'target'), line: line(e, 'technique', readTechnique, true) }
    case 'initiate':
      return def({ op, line: line(e, 'pick', readPick), target: str(e, 'target') })
    case 'purchase':
      return { op, line: line(e, 'purchase', purchase, true) }
    case 'drop':
      return def({ op, target: req(e, 'target'), line: line(e, 'purchase', purchase), refund: num(e, 'refund') })
    case 'upgrade':
    case 'fit':
      return { op, target: req(e, 'target'), line: line(e, 'purchase', purchase, true) }
    case 'unfit':
      return def({ op, target: req(e, 'target'), line: line(e, 'purchase', purchase), refund: num(e, 'refund') })
    case 'shift':
      return {
        op,
        target: req(e, 'target'),
        from: oneOf(e.getAttribute('from'), SHIFT_KINDS, 'mod slot category')!,
        to: oneOf(e.getAttribute('to'), SHIFT_KINDS, 'mod slot category')!,
      }
    case 'move':
      return { op, target: req(e, 'target'), mount: req(e, 'mount') }
    case 'teach':
      return { op, target: req(e, 'target'), line: line(e, 'trained', readTrained, true) }
    case 'bond': {
      // (the bought quality, and the negative taken with it)
      const [q, w] = kids(e, 'quality').map(readCritterQuality)
      if (!q) throw new Error('no <quality> inside the entry')
      return def({ op, target: req(e, 'target'), line: q, with: w })
    }
    case 'contact':
      return { op, line: line(e, 'contact', readContact, true) }
    case 'sin':
      return { op, line: line(e, 'sin', readSin, true) }
    case 'lifestyle':
      return def({ op, id: req(e, 'lifestyle'), months: num(e, 'months', 0), sin: str(e, 'sin'), uid: str(e, 'uid') })
    case 'convert':
      return { op, karma }
    case 'awakened': {
      const v = e.getAttribute('awakened') // (xs:boolean; absent: derived again)
      return v == null ? { op } : { op, value: oneOf(v, ['true', 'false', '1', '0'] as const, 'Awakened override')! === 'true' || v === '1' }
    }
    case 'licensed':
      // (an older entry's rating is not read: the licence is rated as its SIN)
      return def({ op, target: req(e, 'target'), sin: req(e, 'sin'), name: str(e, 'name') })
    case 'powerpoint':
    case 'other':
      return { op }
  }
}

function readEntry(e: Element, fix?: string[]): Sr6LedgerEntry {
  const head = { id: req(e, 'id'), at: e.getAttribute('at') ?? '' }
  const type = oneOf(e.getAttribute('type'), SR6_LEDGER_TYPES, 'entry type')!
  const karma = num(e, 'karma', 0),
    nuyen = num(e, 'nuyen', 0),
    body = e.textContent ?? ''
  switch (type) {
    case 'finalize':
      return { ...head, type, karma, nuyen }
    case 'earn':
      return { ...head, type, karma, nuyen, run: body, date: e.getAttribute('date') ?? '' }
    case 'note':
      return { ...head, type, text: body }
    case 'void':
      return { ...head, type, eventId: req(e, 'event'), reason: body }
    case 'advance':
      return { ...head, type, advance: readAdvance(e, karma, fix), label: e.getAttribute('label') ?? '', karma, nuyen }
  }
}

const CATALOG_KINDS = Object.keys(SR6_KINDS) as Sr6Kind[]
const KIND_OF_TAG = new Map(CATALOG_KINDS.map(k => [SR6_KINDS[k].tag, k]))
/** <house>'s entries; one of an unknown kind throws (repair drops it). */
const readHouse = (h: Element, fix?: string[]): Sr6Entry[] =>
  each(
    [...h.children],
    e => {
      const kind = KIND_OF_TAG.get(e.localName)
      if (!kind) throw new Error(`a <${e.localName}> isn’t a catalog entry`)
      return toEntry(e, kind)
    },
    label,
    fix,
  )
function readNpc(n: Element, fix?: string[]): Sr6Npc {
  const fk = n.getAttribute('fromKind')
  const stats = each(
    kids(n, 'stat'),
    e => {
      const key = e.getAttribute('key') ?? '',
        value = e.getAttribute('value') ?? ''
      if (!/^[a-z]{1,20}$/.test(key)) throw new Error(`the key “${key.slice(0, 40)}” isn’t 1 to 20 letters a to z`)
      if (value.length > 80) throw new Error(`the ${key} value is longer than 80 characters`)
      return [key, value] as const
    },
    label,
    fix,
  )
  return def({
    kind: oneOf(n.getAttribute('kind'), SR6_NPC_KINDS, 'NPC kind', 'grunt', fix)!,
    rating: num(n, 'rating'),
    group: str(n, 'group'),
    from:
      fk == null
        ? undefined
        : {
            kind: oneOf(fk, CATALOG_KINDS, 'NPC catalog kind')!,
            id: n.getAttribute('fromId') ?? '',
            name: n.getAttribute('fromName') ?? '',
            source: n.getAttribute('fromSource') ?? '',
            page: num(n, 'fromPage', 0),
          },
    stats: Object.fromEntries(stats),
    lines: each(kids(n, 'line'), e => ({ part: oneOf(e.getAttribute('part'), SR6_NPC_PARTS, 'line part')!, text: e.textContent ?? '' }), label, fix),
    design: yes(n, 'designed') && {
      powers: each(kids(n, 'power'), readCritterPower, label, fix),
      weaknesses: each(kids(n, 'weakness'), readCritterPower, label, fix),
      skills: each(
        kids(n, 'skill'),
        e => def({ id: str(e, 'id'), name: e.getAttribute('name') ?? '', rank: num(e, 'rank', 0), spec: str(e, 'spec') }),
        label,
        fix,
      ),
      dice: num(n, 'dice', 1),
    },
  })
}
const readCritterPower = (e: Element) => def({ id: str(e, 'id'), name: e.getAttribute('name') ?? '', level: num(e, 'level'), note: str(e, 'note') })

function readDesign(d: Element, fix?: string[]): Sr6Design {
  return def({
    kind: oneOf(d.getAttribute('kind'), ['vehicle', 'drone'] as const, 'design kind', 'vehicle', fix)!,
    chassis: str(d, 'chassis'),
    powertrain: str(d, 'powertrain'),
    console: str(d, 'console'),
    options: each(
      kids(d, 'option'),
      o => {
        const level = num(o, 'level', 1)
        if (!Number.isInteger(level)) throw new Error(`level="${level}" isn’t a whole number`)
        const road = str(o, 'road') === undefined ? undefined : oneOf(o.getAttribute('road'), ['on', 'off'] as const, 'Improved Handling road', undefined, fix)
        return def({ id: o.getAttribute('id') ?? '', level, road })
      },
      label,
      fix,
    ),
    mods: each(kids(d, 'purchase'), x => readPurchase(x, fix), label, fix),
    diy: yes(d, 'diy'),
    approved: yes(d, 'approved'),
  })
}

export type Sr6Parsed = { ok: true; character: Sr6Character; rev?: number } | { ok: false; reason: string }

/** Never throws; a bad file comes back with a reason saying what and where. With `opts.repair`, what can be read is
 *  kept and each thing dropped or fixed is noted there. */
export function xmlToSr6(xml: string, opts: ReadOpts = {}): Sr6Parsed {
  const fix = opts.repair
  const parsed = readDoc(xml, fix)
  if (!parsed.ok) return parsed
  const r = parsed.root
  if (r.localName === 'character' && r.namespaceURI === 'urn:chummer-anarchy2:character:1')
    return { ok: false, reason: 'This is a Shadowrun Anarchy runner. Import it on the Anarchy side.' }
  if (r.localName !== 'character' || r.namespaceURI !== SR6_CHAR_NS) return { ok: false, reason: 'Not a Shadowrun 6 runner file.' }
  const v = Number(r.getAttribute('formatVersion'))
  if (!v) return { ok: false, reason: 'The <character> element has no formatVersion.' }
  if (v > FORMAT_VERSION) return { ok: false, reason: `This file is from a newer version of the app (format ${v}).` }
  if (!r.getAttribute('id')) return { ok: false, reason: 'The <character> element has no id.' }
  const b = kid(r, 'build')
  if (!b) return { ok: false, reason: 'The file has no <build> element.' }
  try {
    const build = readBuild(b, fix)
    build.metatype = str(r, 'metatype') ?? ''
    const t = (name: string) => kid(r, name)?.textContent ?? undefined
    const backdrop = str(r, 'backdrop') as Backdrop | undefined
    const fk = num(r, 'finalKarma'),
      fn = num(r, 'finalNuyen'),
      npc = kid(r, 'npc'),
      design = kid(r, 'design'),
      ledger = kid(r, 'ledger'),
      house = kid(r, 'house')
    const printed = kid(r, 'printed'),
      rules = kid(r, 'rules')
    const ch: Sr6Character = def({
      formatVersion: 1 as const,
      id: r.getAttribute('id')!,
      identity: def({
        name: str(r, 'name') ?? '',
        streetName: str(r, 'streetName') ?? '',
        gender: str(r, 'gender'),
        metatype: build.metatype,
        portrait: t('portrait'),
        token: t('token'),
        backdrop: backdrop && BACKDROPS.includes(backdrop) ? backdrop : undefined,
        background: t('background') ?? '',
        notes: t('notes') ?? '',
      }),
      build,
      finalizedAt: str(r, 'finalizedAt'),
      campaign: str(r, 'campaign'),
      final: fk === undefined && fn === undefined ? undefined : { karma: fk ?? 0, nuyen: fn ?? 0 },
      debtPercent: num(r, 'debtPercent'),
      ledger: ledger
        ? each(
            kids(ledger, 'entry'),
            e => readEntry(e, fix),
            (_, i) => `ledger entry ${i + 1}`,
            fix,
          )
        : [],
      npc: npc ? readNpc(npc, fix) : undefined,
      design: design ? readDesign(design, fix) : undefined,
      sampleKey: str(r, 'sampleKey'),
      house: house?.children.length ? readHouse(house, fix) : undefined,
      printed: printed
        ? {
            source: str(printed, 'source') ?? '',
            page: num(printed, 'page', 0),
            values: Object.fromEntries(kids(printed, 'value').map(v => [v.getAttribute('key') ?? '', v.getAttribute('value') ?? ''])),
          }
        : undefined,
      rules:
        rules && kids(rules, 'setting').length
          ? kids(rules, 'setting').map(x =>
              def({
                key: x.getAttribute('key') ?? '',
                value: x.getAttribute('value') ?? '',
                assumed: x.getAttribute('assumed') === 'true' ? (true as const) : undefined,
                source: str(x, 'source'),
                page: num(x, 'page'),
              }),
            )
          : undefined,
      overrides: kids(r, 'override').map(o => ({ code: o.getAttribute('code') ?? '', path: o.getAttribute('path') ?? '', note: o.textContent ?? '' })),
      migrated: kids(r, 'migrated').length
        ? kids(r, 'migrated').map(m => ({ from: m.getAttribute('from') ?? '', to: m.getAttribute('to') ?? '', at: m.getAttribute('at') ?? '' }))
        : undefined,
      updatedAt: str(r, 'updatedAt') ?? new Date().toISOString(),
      lastExportedAt: str(r, 'lastExportedAt'),
    })
    migrateLifestyle(ch, kid(b, 'lifestyle'))
    return def({ ok: true as const, character: ch, rev: num(r, 'rev') })
  } catch (e) {
    return { ok: false, reason: `Couldn’t read ${(e as Error).message}.` }
  }
}
