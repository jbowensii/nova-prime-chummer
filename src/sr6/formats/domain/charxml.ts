// Shadowrun 6 runner <-> XML (docs/sr6-character-format.md, public/data/sr6/schema/character.xsd): the file a runner is
// saved as in /api/sr6/characters and what Export writes. Summary fields sit on the root as Anarchy's
// (src/ca2/formats/domain/charxml.ts), with the writing and reading helpers both games share (src/core/shared/xml.ts).
import { each, kid, kids, readDoc, type ReadOpts } from '../../../core/shared/xml'
import { BACKDROPS, type Backdrop } from '../../../core/shared/types'
import { type Sr6Character, type Sr6LedgerEntry } from './character'
import { upgradeSr6 } from './migrations'
import { FORMAT_VERSION, SR6_CHAR_NS } from './charxml-common'
import { def, num, oneOf, readPurchase, str, yes } from './charxml-read'
import { migrateLifestyle, readBuild } from './charxml-read-build'
import { readDesign, readEntry, readHouse, readNpc } from './charxml-read-ledger'
export { SR6_CHAR_NS } from './charxml-common'
export { sr6ToXml, sr6LedgerToXml } from './charxml-write'

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
  if (!Number.isInteger(v) || v < 1) return { ok: false, reason: 'The <character> element has no formatVersion.' }
  if (v > FORMAT_VERSION) return { ok: false, reason: `This file is from a newer version of the app (format ${v}).` }
  upgradeSr6(r, v)
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
      itemDesign = kid(r, 'itemDesign'),
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
      itemDesign: ((p: Element | null) =>
        itemDesign && p
          ? def({
              kind: oneOf(itemDesign.getAttribute('kind'), ['weapon', 'cyberware'] as const, 'item design kind', 'weapon', fix)!,
              line: readPurchase(p, fix),
              approved: yes(itemDesign, 'approved'),
            })
          : undefined)(itemDesign && kid(itemDesign, 'purchase')),
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
