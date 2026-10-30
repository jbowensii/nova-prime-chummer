// Where SR6 runners are saved (the server's /api/sr6/characters, server only in S2) and the runners page's file helpers:
// export (with a snapshot of every catalog line, so the file still reads where the entry is gone), import (an Anarchy
// file is refused with where it belongs; a taken id gets a new one) and repair (the changes listed before saving).
import { useEffect, useState } from 'react'
import { useMe } from '../../../core/ui-kit/auth'
import { downloadFile } from '../../../core/ui-kit/download'
import { newId } from '../../../core/shared/types'
import type { Codec } from '../../../core/shared/types'
import { serverRepo } from '../../../features/runner-store/repo'
import { keepSr6House } from '../domain/career/house'
import { resolveEntry } from '../../catalog/domain/load'
import { entryKey } from '../../catalog/domain/names'
import { sr6LedgerToXml, sr6ToXml, xmlToSr6, xmlToSr6Ledger } from '../../formats/domain/charxml'
import type { Sr6Character, Sr6LedgerEntry, Sr6Purchase } from '../../formats/domain/character'
import type { Sr6Catalog } from '../../formats/domain/types'

/** The repo codec (src/features/runner-store/repo.ts serverRepo). */
export const sr6Codec: Codec<Sr6Character> = { tag: 'sr6:character', toXml: sr6ToXml, fromXml: xmlToSr6 }
export const sr6Repo = (base = './') => serverRepo(sr6Codec, base, 'sr6/characters')
/** SR6 NPCs (the server's /api/sr6/npcs, GMs only): SR6 runner files with an <npc> block. */
export const sr6NpcRepo = (base = './') => serverRepo(sr6Codec, base, 'sr6/npcs')
/** SR6 vehicle and drone designs (the server's /api/sr6/designs, every account its own): SR6 files with a <design> block. */
export const sr6DesignRepo = (base = './') => serverRepo(sr6Codec, base, 'sr6/designs')

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
  downloadFile(`${(ch.identity.streetName || ch.identity.name || 'runner').replace(/[^\w\- ]+/g, '')}.xml`, sr6ToXml(out), 'application/xml')
  return out
}

/** Download just the career ledger (with its purchase snapshots) as its own file. */
export function exportSr6Ledger(c: Sr6Catalog, ch: Sr6Character): void {
  const name = (ch.identity.streetName || ch.identity.name || 'runner').replace(/[^\w\- ]+/g, '')
  downloadFile(`${name}-ledger.xml`, sr6LedgerToXml(snapshotSr6(c, ch).ledger), 'application/xml')
}

/** Read a ledger-only file (exportSr6Ledger): its entries, or why it can't be read. */
export function readSr6LedgerImport(xml: string): { ok: true; ledger: Sr6LedgerEntry[] } | { ok: false; reason: string } {
  return xmlToSr6Ledger(xml)
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

/** Your own designs (for buying one on a runner): none while they load or when the server can't list them. */
export function useSr6Designs(): Sr6Character[] {
  const me = useMe()
  const [list, setList] = useState<Sr6Character[]>([])
  useEffect(() => {
    sr6DesignRepo()
      .list()
      .then(
        r => setList(r.filter(s => s.ch.design && !s.ch.itemDesign && (!s.owner || s.owner === me?.username)).map(s => s.ch)),
        () => setList([]),
      )
  }, [me?.username])
  return list
}

/** Every saved weapon or cyberware design the server lists (shared, owner ruling 2: anyone buys anyone's), of `kind`. */
export function useItemDesigns(kind: 'weapon' | 'cyberware'): Sr6Character[] {
  const [list, setList] = useState<Sr6Character[]>([])
  useEffect(() => {
    sr6DesignRepo()
      .list()
      .then(
        r => setList(r.filter(s => s.ch.itemDesign?.kind === kind).map(s => s.ch)),
        () => setList([]),
      )
  }, [kind])
  return list
}
