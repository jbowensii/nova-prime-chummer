// Where SR6 runners are saved (the server's /api/sr6/characters, server only in S2) and the runners page's file helpers:
// export (with a snapshot of every catalog line, so the file still reads where the entry is gone), import (an Anarchy
// file is refused with where it belongs; a taken id gets a new one) and repair (the changes listed before saving).
import { newId } from '../../model/types'
import { serverRepo } from '../../ui/repo'
import { entryKey } from '../engine/load'
import { sr6Codec, sr6ToXml, xmlToSr6 } from '../engine/charxml'
import type { Sr6Character, Sr6Purchase } from '../model/character'
import type { Sr6Catalog } from '../model/types'

export const sr6Repo = (base = './') => serverRepo<Sr6Character>(base, 'sr6/characters', sr6Codec)

/** A copy of the runner whose catalog lines (and their accessories) carry the entry as it is now (or the snapshot they had). */
export function snapshotSr6(c: Sr6Catalog, ch: Sr6Character): Sr6Character {
  const snap = (x: Sr6Purchase): Sr6Purchase => {
    const live = x.id ? c.entries[x.kind]?.get(x.id) ?? c.original.get(entryKey(x.kind, x.id)) : undefined
    return { ...x, accessories: x.accessories.map(snap), ...(live ? { snapshot: live } : {}) }
  }
  return { ...ch, build: { ...ch.build, purchases: ch.build.purchases.map(snap) } }
}

/** Download the runner as its XML file. Returns it stamped as exported (with the snapshots). */
export function exportSr6(c: Sr6Catalog, ch: Sr6Character): Sr6Character {
  const out = { ...snapshotSr6(c, ch), lastExportedAt: new Date().toISOString() }
  const url = URL.createObjectURL(new Blob([sr6ToXml(out)], { type: 'application/xml' }))
  Object.assign(document.createElement('a'), { href: url, download: `${(ch.identity.streetName || ch.identity.name || 'runner').replace(/[^\w\- ]+/g, '')}.xml` }).click()
  URL.revokeObjectURL(url)
  return out
}

/** A file to import: the runner (a new id when `taken` has its id), or why it can't be (an Anarchy runner: where it belongs). */
export function readSr6Import(xml: string, taken: Set<string>): { ok: true; ch: Sr6Character } | { ok: false; reason: string } {
  const r = xmlToSr6(xml)
  if (!r.ok) return r
  return { ok: true, ch: { ...r.character, id: taken.has(r.character.id) ? newId() : r.character.id, lastExportedAt: new Date().toISOString() } }
}

/** A saved file that can't be read, read again with repair: the runner and what was changed, or why it still can't be. */
export function repairSr6(xml: string): { ok: true; ch: Sr6Character; changes: string[] } | { ok: false; reason: string } {
  const changes: string[] = []
  const r = xmlToSr6(xml, { repair: changes })
  return r.ok ? { ok: true, ch: r.character, changes } : r
}
