// The GMs' compendiums on the server (/api/compendiums, server/compendiums.mjs): the ones this account can read, saved
// and deleted with the NPC store's rev/If-Match rules. Their files join this GM's catalog as overlays (App.tsx Main).
import { compendiumXml, readCompendium, type SourceFile } from '../engine'
import type { Compendium } from '../model/types'
import { track, UNREACHABLE } from './auth'
import type { SaveResult } from './repo'

export interface CompendiumRow { id: string; file: string; rev: number; xml: string; owner: string; ownerName: string }
/** A readable compendium as the page uses it: owner, ownerName and rev from the server's row. */
export type StoredCompendium = Compendium & { rev: number; owner: string; ownerName: string }

/** The compendiums this account can read. A player (403) has none: that's not an error. */
export async function listCompendiums(base = './'): Promise<CompendiumRow[]> {
  const r = await fetch(`${base}api/compendiums`, { cache: 'no-store' }).catch(() => { throw new Error(UNREACHABLE) })
  if (r.status === 403) return []
  if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? `the server answered ${r.status}`)
  return r.json()
}

/** The rows as catalog overlay files (loadCatalog's `extra`), in owner then id order. */
export const readable = (rows: CompendiumRow[]): SourceFile[] =>
  [...rows].sort((a, b) => a.owner.localeCompare(b.owner) || a.id.localeCompare(b.id))
    .map(r => ({ file: `compendiums/${r.owner}/${r.id}.xml`, xml: r.xml, overlay: true, publisher: r.ownerName, owner: r.owner }))

/** The rows read; a file that can't be read comes back with why (the catalog load reports it too). */
export function parseRows(rows: CompendiumRow[]): { comps: StoredCompendium[]; bad: { row: CompendiumRow; error: string }[] } {
  const comps: StoredCompendium[] = [], bad: { row: CompendiumRow; error: string }[] = []
  for (const row of rows) {
    const p = readCompendium(row.xml)
    if (p.ok) comps.push({ ...p.compendium, rev: row.rev, owner: row.owner, ownerName: row.ownerName })
    else bad.push({ row, error: p.error })
  }
  return { comps, bad }
}

/** rev: the stored one (none for a new compendium). 409 with error "conflict": changed elsewhere; any other refusal: error. */
export const saveCompendium = (comp: Compendium, rev?: number): Promise<SaveResult> => track((async (): Promise<SaveResult> => {
  try {
    const r = await fetch(`./api/compendiums/${encodeURIComponent(comp.id)}`, { method: 'PUT', body: compendiumXml(comp),
      headers: { 'Content-Type': 'application/xml', ...(rev != null ? { 'If-Match': String(rev) } : {}) } })
    const res = await r.json().catch(() => ({}))
    if (r.status === 409 && res.error === 'conflict') return { ok: false, conflict: { rev: res.rev, file: res.file, updatedAt: res.updatedAt } }
    if (!r.ok) return { ok: false, error: res.error ?? `the server answered ${r.status}` }
    return { ok: true, rev: res.rev, file: res.file }
  } catch (e) {
    return { ok: false, error: `Couldn’t reach the server: ${(e as Error).message}` }
  }
})())

/** To the owner's compendium trash; a refusal rejects with the server's reason. */
export const deleteCompendium = (id: string): Promise<void> => track((async () => {
  const r = await fetch(`./api/compendiums/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => { throw new Error(UNREACHABLE) })
  if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? `the server answered ${r.status}`)
})())
