// Where SR6 runners are saved (the server's /api/sr6/characters, server only in S2) and the runners page's file helpers:
// export (with a snapshot of every catalog line, so the file still reads where the entry is gone), import (an Anarchy
// file is refused with where it belongs; a taken id gets a new one) and repair (the changes listed before saving).
import { newId } from '../../model/types'
import { serverRepo, type Codec } from '../../ui/repo'
import { keepSr6House } from '../engine/house'
import { resolveEntry } from '../engine/load'
import { entryKey } from '../engine/names'
import { sr6ToXml, xmlToSr6 } from '../engine/charxml'
import type { Sr6Character, Sr6LedgerEntry, Sr6Purchase } from '../model/character'
import type { Sr6Catalog } from '../model/types'

/** The repo codec (src/ui/repo.ts serverRepo). */
export const sr6Codec: Codec<Sr6Character> = { tag: 'sr6:character', toXml: sr6ToXml, fromXml: xmlToSr6 }
export const sr6Repo = (base = './') => serverRepo<Sr6Character>(base, 'sr6/characters', sr6Codec)
/** SR6 NPCs (the server's /api/sr6/npcs, GMs only): SR6 runner files with an <npc> block. */
export const sr6NpcRepo = (base = './') => serverRepo<Sr6Character>(base, 'sr6/npcs', sr6Codec)
/** SR6 vehicle and drone designs (the server's /api/sr6/designs, every account its own): SR6 files with a <design> block. */
export const sr6DesignRepo = (base = './') => serverRepo<Sr6Character>(base, 'sr6/designs', sr6Codec)

/** A copy of the runner whose catalog lines (and their accessories, and the ledger's purchase lines) carry the entry as it
 *  is now (or the snapshot they had), with its compendium entries' copies up to date. */
export function snapshotSr6(c: Sr6Catalog, runner: Sr6Character): Sr6Character {
  const ch = keepSr6House(c, runner)
  const snap = (x: Sr6Purchase): Sr6Purchase => {
    const live = x.id ? (resolveEntry(c, x.kind, x.id) ?? c.original.get(entryKey(x.kind, x.id))) : undefined
    return { ...x, accessories: x.accessories.map(snap), ...(live ? { snapshot: live } : {}) }
  }
  const ledger = ch.ledger.map((e): Sr6LedgerEntry => {
    if (e.type !== 'advance') return e
    const a = e.advance
    return a.op === 'purchase'
      ? { ...e, advance: { ...a, line: snap(a.line) } }
      : a.op === 'drop' && a.line
        ? { ...e, advance: { ...a, line: snap(a.line) } }
        : e
  })
  return { ...ch, build: { ...ch.build, purchases: ch.build.purchases.map(snap) }, ledger }
}

/** Download the runner as its XML file. Returns it stamped as exported (with the snapshots). */
export function exportSr6(c: Sr6Catalog, ch: Sr6Character): Sr6Character {
  const out = { ...snapshotSr6(c, ch), lastExportedAt: new Date().toISOString() }
  const url = URL.createObjectURL(new Blob([sr6ToXml(out)], { type: 'application/xml' }))
  Object.assign(document.createElement('a'), {
    href: url,
    download: `${(ch.identity.streetName || ch.identity.name || 'runner').replace(/[^\w\- ]+/g, '')}.xml`,
  }).click()
  URL.revokeObjectURL(url)
  return out
}

/** A file to import: the runner (a new id when `taken` has its id), or why it can't be (an Anarchy runner: where it belongs). */
export function readSr6Import(xml: string, taken: Set<string>): { ok: true; ch: Sr6Character } | { ok: false; reason: string } {
  const r = xmlToSr6(xml)
  if (!r.ok) return r
  if (r.character.npc) return { ok: false, reason: 'This is an NPC. Import it on NPCs & Critters.' }
  if (r.character.design) return { ok: false, reason: 'This is a vehicle or drone design. Import it in the Designer.' }
  return { ok: true, ch: { ...r.character, id: taken.has(r.character.id) ? newId() : r.character.id, lastExportedAt: new Date().toISOString() } }
}

/** The mirror for the NPC page: the NPC (a new id when taken; a ledger, finalize stamp and campaign left behind), or why
 *  not (a runner, or an Anarchy file: where it belongs). */
export function readSr6NpcImport(xml: string, taken: Set<string>): { ok: true; ch: Sr6Character } | { ok: false; reason: string } {
  const r = xmlToSr6(xml)
  if (!r.ok) return r
  if (!r.character.npc) return { ok: false, reason: 'This is a runner, not an NPC. Import it on Your runners.' }
  const { finalizedAt: _f, final: _k, campaign: _c, ...ch } = r.character
  return { ok: true, ch: { ...ch, ledger: [], id: taken.has(ch.id) ? newId() : ch.id, lastExportedAt: new Date().toISOString() } }
}

/** The mirror for the Designer: the design (a new id when taken), or why not (a runner or NPC, or an Anarchy file). */
export function readSr6DesignImport(xml: string, taken: Set<string>): { ok: true; ch: Sr6Character } | { ok: false; reason: string } {
  const r = xmlToSr6(xml)
  if (!r.ok) return r
  if (!r.character.design) return { ok: false, reason: 'This is a runner or NPC, not a vehicle or drone design.' }
  return { ok: true, ch: { ...r.character, id: taken.has(r.character.id) ? newId() : r.character.id, lastExportedAt: new Date().toISOString() } }
}

/** A saved file that can't be read, read again with repair: the runner and what was changed, or why it still can't be. */
export function repairSr6(xml: string): { ok: true; ch: Sr6Character; changes: string[] } | { ok: false; reason: string } {
  const changes: string[] = []
  const r = xmlToSr6(xml, { repair: changes })
  return r.ok ? { ok: true, ch: r.character, changes } : r
}
