// Shadowrun 6 runner XML: writing a runner and its ledger to XML (see charxml.ts).
import { attrs, el, esc, text } from '../../../core/shared/xml'
import {
  CP_POOLS,
  PRIORITY_COLUMNS,
  SR6_ATTRS,
  type Bonus,
  type Sr6Advance,
  type Sr6Build,
  type Sr6Character,
  type Sr6BoundSpirit,
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
  type Sr6Lifestyle,
  type Sr6Sin,
} from './character'
import { type Sr6Entry } from './types'
import { sr6EntryXml } from './entryxml'
import { FORMAT_VERSION, SR6_CHAR_NS, sitText } from './charxml-common'
import { optionsText } from './charxml-read'

export const bonusXml = (x: Bonus) =>
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
export const bonusesXml = (xs?: Bonus[]) => (xs ?? []).map(bonusXml).join('')
export function purchaseXml(p: Sr6Purchase): string {
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
      slots: p.slots,
      dp: p.dp,
      essence: p.essence,
      rating: p.rating,
      qty: p.qty,
      grade: p.grade,
      worn: p.worn,
      flags: p.flags?.length ? p.flags.join(' ') : undefined,
      seq: p.seq,
      sit: sitText(p.sit),
      note: p.note,
      seatsRemoved: p.seatsRemoved,
      mount: p.mount,
      diy: p.diy,
      material: p.material,
      options: optionsText(p.options),
      design: p.design,
      approved: p.approved,
      pack: p.pack,
      slotShifts: p.slotShifts?.length ? p.slotShifts.map(t => `${t.from}>${t.to}`).join(' ') : undefined,
      addedSlots: p.addedSlots?.length ? p.addedSlots.map(s => (s.value ? `${s.id}:${s.value}` : s.id)).join(' ') : undefined,
      removedBuiltins: p.removedBuiltins?.length ? p.removedBuiltins.join(' ') : undefined,
      removedParts: p.removedParts?.length ? p.removedParts.join(' ') : undefined,
      derivedFrom: p.derived?.from,
      derivedKind: p.derived?.kind,
      derivedHook: p.derived?.hook,
      derivedSize: p.derived?.size,
      derivedReview: p.derived?.review,
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
export const critterQualityXml = (q: Sr6CritterQuality) => el('quality', { uid: q.uid, id: q.id, level: q.level, name: q.name, how: q.how })
export const trainedXml = (t: Sr6CritterTrained) => el('trained', { uid: t.uid, what: t.what, id: t.id, name: t.name, taught: t.taught })

// one writer per line kind: the build's lines and a ledger entry's line are the same element
export const knowledgeXml = (k: Sr6Knowledge) =>
  `<knowledge${attrs({ uid: k.uid, kind: k.kind, native: k.native, points: k.points, karma: k.karma, payment: k.payment })}>${esc(k.name)}</knowledge>`
export const qualityXml = (q: Sr6Quality) =>
  el('quality', {
    uid: q.uid,
    id: q.id,
    level: q.level,
    karma: q.karma,
    free: q.free,
    note: q.note,
    name: q.name,
    boughtOff: q.boughtOff,
    seq: q.seq,
    options: optionsText(q.options),
    sit: sitText(q.sit),
  })
export const pickXml = (p: Sr6Pick) =>
  el('pick', { uid: p.uid, kind: p.kind, id: p.id, level: p.level, name: p.name, note: p.note, sit: sitText(p.sit) }, bonusesXml(p.bonuses))
export const techniqueXml = (t: Sr6MartialArt['techniques'][number]) => el('technique', { uid: t.uid, id: t.id, name: t.name })
export const martialXml = (m: Sr6MartialArt) => el('martialart', { uid: m.uid, id: m.id, name: m.name }, m.techniques.map(techniqueXml).join(''))
export const contactXml = (c: Sr6Contact) =>
  el('contact', {
    uid: c.uid,
    name: c.name,
    archetype: c.archetype,
    connection: c.connection,
    loyalty: c.loyalty,
    types: c.types?.length ? c.types.join(' ') : undefined,
  })
export const spiritXml = (s: Sr6BoundSpirit) => el('spirit', { uid: s.uid, name: s.name, force: s.force, services: s.services, note: s.note })
export const lifestyleXml = (l: Sr6Lifestyle, sin?: string) => el('lifestyle', { uid: l.uid, id: l.id, months: l.months, pack: l.pack, sin })
export const sinXml = (s: Sr6Sin) =>
  el(
    'sin',
    { uid: s.uid, name: s.name, kind: s.kind, rating: s.rating, gender: s.gender, placeholder: s.placeholder, pack: s.pack },
    s.licences.map(l => el('licence', { ...l })).join('') + (s.lifestyles ?? []).map(l => lifestyleXml(l)).join(''),
  )

export function buildXml(b: Sr6Build): string {
  const rows = [
    ...PRIORITY_COLUMNS.map(column => el('priority', { column, letter: b.priorities[column] })),
    ...CP_POOLS.map(pool => el('cp', { pool, points: b.cp[pool] })),
    ...b.lifepath.map(m =>
      el(
        'lifemodule',
        { id: m.id },
        Object.entries(m.choices)
          .map(([index, pick]) => el('choice', { index, pick, line: m.lines?.[Number(index)] }))
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
    ...b.boundSpirits.map(spiritXml),
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
      surgeCollective: b.surgeCollective,
      surgeChoice: b.surgeChoice,
      dracoform:
        b.dracoform && Object.keys(b.dracoform).length
          ? Object.entries(b.dracoform)
              .map(([k, v]) => `${k}:${v}`)
              .join(' ')
          : undefined,
      karmaToNuyen: b.karmaToNuyen,
      ...(b.karmaToDeck ? { karmaToDeck: b.karmaToDeck } : {}),
      bestAttr: b.bestAttr,
      bestExtra: b.bestExtra,
    },
    `\n    ${rows.join('\n    ')}\n  `,
  )
}

/** An advance's attributes and its one line (convert's karma is the entry's). */
export function advanceXml(a: Sr6Advance): [Record<string, unknown>, string] {
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
      return [{ target: a.target, magic: a.magic, single: a.single }, qualityXml(a.line)]
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
    case 'pack':
      return [
        { packId: a.id, packUid: a.uid, packName: a.name, cost: a.cost },
        a.lines.map(purchaseXml).join('') + a.sins.map(sinXml).join('') + a.lifestyles.map(l => lifestyleXml(l.line, l.sin)).join(''),
      ]
    case 'drop':
      return [{ target: a.target, refund: a.refund }, a.line ? purchaseXml(a.line) : '']
    case 'quantity':
      return [{ target: a.target, qty: a.qty }, '']
    case 'upgrade':
    case 'fit':
      return [{ target: a.target }, purchaseXml(a.line)]
    case 'unfit':
      return [{ target: a.target, refund: a.refund }, a.line ? purchaseXml(a.line) : '']
    case 'shift':
      return [{ target: a.target, from: a.from, to: a.to }, '']
    case 'move':
      return [{ target: a.target, mount: a.mount }, '']
    case 'part':
      return [{ target: a.target, partId: a.part, restore: a.restore ? 'true' : undefined, detach: a.detach?.length ? a.detach.join(' ') : undefined }, '']
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
    case 'assign':
      return [{ target: a.target, sin: a.sin }, '']
    case 'powerpoint':
    case 'convert':
    case 'other':
      return [{}, '']
  }
}
export function entryXml(e: Sr6LedgerEntry): string {
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
export const ledgerXml = (l: Sr6LedgerEntry[]) => (l.length ? `<ledger>\n    ${l.map(entryXml).join('\n    ')}\n  </ledger>` : '')

/** The career ledger alone, as its own file (import/export of the history without the runner). */
export const sr6LedgerToXml = (ledger: Sr6LedgerEntry[]) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<sr6:ledger xmlns:sr6="${SR6_CHAR_NS}" formatVersion="${FORMAT_VERSION}">\n    ${ledger.map(entryXml).join('\n    ')}\n  </sr6:ledger>\n`

export const houseXml = (h?: Sr6Entry[]) => (h?.length ? `<house>${h.map(e => sr6EntryXml(e, true)).join('')}</house>` : '')

export function npcXml(n?: Sr6Npc): string {
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
export const designXml = (d?: Sr6Design) =>
  d
    ? el(
        'design',
        {
          kind: d.kind,
          base: d.base,
          removedParts: d.removedParts?.length ? d.removedParts.join(' ') : undefined,
          chassis: d.chassis,
          powertrain: d.powertrain,
          console: d.console,
          diy: d.diy,
          approved: d.approved,
        },
        (d.customChassis ? el('customChassis', d.customChassis) : '') +
          (d.customPowertrain ? el('customPowertrain', d.customPowertrain) : '') +
          d.options.map(o => el('option', o)).join('') +
          (d.hardpoints ?? []).map(h => el('hardpoint', { ...h })).join('') +
          d.mods.map(purchaseXml).join(''),
      )
    : ''

export const rulesXml = (rs?: Sr6Character['rules']) =>
  rs?.length ? el('rules', {}, rs.map(r => el('setting', { key: r.key, value: r.value, assumed: r.assumed, source: r.source, page: r.page })).join('')) : ''
export const printedXml = (p?: Sr6Printed) =>
  p
    ? el(
        'printed',
        { source: p.source, page: p.page },
        Object.entries(p.values)
          .map(([key, value]) => el('value', { key, value }))
          .join(''),
      )
    : ''

export const pathProgressXml = (ps: Sr6Character['pathProgress']) =>
  (ps ?? [])
    .map(p =>
      el(
        'pathProgress',
        { pathId: p.pathId, currentStepId: p.currentStepId },
        p.visitedStepIds.map(step => el('visited', { step })).join('') +
          Object.entries(p.choicesByStepId)
            .map(([step, c]) => el('choice', { step, optionRef: c.optionRef, subOptionRef: c.subOptionRef }))
            .join(''),
      ),
    )
    .join('\n  ')

/** Serialize a runner. `rev` is the server's revision counter (omitted for exports). */
export function sr6ToXml(ch: Sr6Character, rev?: number): string {
  const id = ch.identity
  const body = [
    npcXml(ch.npc),
    designXml(ch.design),
    ch.itemDesign ? el('itemDesign', { kind: ch.itemDesign.kind, approved: ch.itemDesign.approved }, purchaseXml(ch.itemDesign.line)) : '',
    text('portrait', id.portrait) + text('token', id.token),
    text('background', id.background),
    text('notes', id.notes),
    printedXml(ch.printed),
    rulesXml(ch.rules),
    pathProgressXml(ch.pathProgress),
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
