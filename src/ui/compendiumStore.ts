// The GMs' compendiums on the server (server/compendiums.mjs), per game: Anarchy's at /api/compendiums, SR6's at
// /api/sr6/compendiums (src/sr6/ui/compendiumStore.ts), never mixed. The ones this account can read, saved and deleted with
// the NPC store's rev/If-Match rules. Their files join that game's GM catalog as overlays (App.tsx Main, Sr6App.tsx); a
// player's catalog gets the shared ones (listShared), read only.
import { compendiumXml, readCompendium, type SourceFile } from '../engine'
import type { Compendium } from '../model/types'
import { track, UNREACHABLE } from './auth'
import type { Game } from './game'
import type { SaveResult } from './repo'

export interface CompendiumRow {
  id: string
  file: string
  rev: number
  xml: string
  owner: string
  ownerName: string
}
/** A readable compendium as the page uses it: owner, ownerName and rev from the server's row. */
export type Stored<C> = C & { rev: number; owner: string; ownerName: string }
export type StoredCompendium = Stored<Compendium>
/** A game's compendium reader (readCompendium, readSr6Compendium). */
export type CompReader<C> = (xml: string) => { ok: true; compendium: C } | { ok: false; error: string }

const api = (game: Game) => (game === 'sr6' ? 'api/sr6/compendiums' : 'api/compendiums')

/** The compendiums this account can read in `game`. A player (403) has none: that's not an error. shared: only the table's
 *  and the account's campaigns' ones, without their NPCs (GET .../shared: what players' runners use). */
export async function listCompendiums(base = './', game: Game = 'ca2', shared = false): Promise<CompendiumRow[]> {
  const r = await fetch(`${base}${api(game)}${shared ? '/shared' : ''}`, { cache: 'no-store' }).catch(() => {
    throw new Error(UNREACHABLE)
  })
  if (r.status === 403) return []
  if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? `the server answered ${r.status}`)
  return r.json()
}

/** The compendiums a player's runners may use in `game` (see listCompendiums). */
export const listShared = (base = './', game: Game = 'ca2') => listCompendiums(base, game, true)

/** The rows as catalog overlay files (loadCatalog's `extra`), in owner then id order. */
export const readable = (rows: CompendiumRow[]): SourceFile[] =>
  [...rows]
    .sort((a, b) => a.owner.localeCompare(b.owner) || a.id.localeCompare(b.id))
    .map(r => ({ file: `compendiums/${r.owner}/${r.id}.xml`, xml: r.xml, overlay: true, publisher: r.ownerName, owner: r.owner }))

/** The rows read with the game's reader (Anarchy's by default); a file that can't be read comes back with why (the catalog
 *  load reports it too). */
export function parseRows<C = Compendium>(
  rows: CompendiumRow[],
  read = readCompendium as unknown as CompReader<C>,
): { comps: Stored<C>[]; bad: { row: CompendiumRow; error: string }[] } {
  const comps: Stored<C>[] = [],
    bad: { row: CompendiumRow; error: string }[] = []
  for (const row of rows) {
    const p = read(row.xml)
    if (p.ok) comps.push({ ...p.compendium, rev: row.rev, owner: row.owner, ownerName: row.ownerName })
    else bad.push({ row, error: p.error })
  }
  return { comps, bad }
}

/** The file `xml` saved as compendium `id` of `game`. rev: the stored one (none for a new compendium). 409 with error
 *  "conflict": changed elsewhere; any other refusal: error. */
export const putCompendium = (game: Game, id: string, xml: string, rev?: number): Promise<SaveResult> =>
  track(
    (async (): Promise<SaveResult> => {
      try {
        const r = await fetch(`./${api(game)}/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: xml,
          headers: { 'Content-Type': 'application/xml', ...(rev != null ? { 'If-Match': String(rev) } : {}) },
        })
        const res = await r.json().catch(() => ({}))
        if (r.status === 409 && res.error === 'conflict') return { ok: false, conflict: { rev: res.rev, file: res.file, updatedAt: res.updatedAt } }
        if (!r.ok) return { ok: false, error: res.error ?? `the server answered ${r.status}` }
        return { ok: true, rev: res.rev, file: res.file }
      } catch (e) {
        return { ok: false, error: `Couldn’t reach the server: ${(e as Error).message}` }
      }
    })(),
  )

/** An Anarchy compendium saved (see putCompendium). */
export const saveCompendium = (comp: Compendium, rev?: number): Promise<SaveResult> => putCompendium('ca2', comp.id, compendiumXml(comp), rev)

/** To the owner's compendium trash; a refusal rejects with the server's reason. */
export const deleteCompendium = (id: string, game: Game = 'ca2'): Promise<void> =>
  track(
    (async () => {
      const r = await fetch(`./${api(game)}/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {
        throw new Error(UNREACHABLE)
      })
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? `the server answered ${r.status}`)
    })(),
  )
