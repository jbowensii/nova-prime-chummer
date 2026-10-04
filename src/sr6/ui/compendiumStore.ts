// The SR6 compendiums on the server (/api/sr6/compendiums): Anarchy's store (src/ui/compendiumStore.ts) with SR6's file
// format (src/sr6/engine/compendium.ts). An Anarchy file never reads as an SR6 one. NPCs move between a compendium and
// the SR6 NPC area with two calls (no server route of their own); a failed second call undoes the first.
import { newId } from '../../model/types'
import { listCompendiums, parseRows, putCompendium, type CompendiumRow, type Stored } from '../../ui/compendiumStore'
import type { SaveResult } from '../../ui/repo'
import { readSr6Compendium, sr6CompendiumXml } from '../engine/compendium'
import type { Sr6Character } from '../model/character'
import type { Sr6Compendium } from '../model/types'

export const listSr6Compendiums = () => listCompendiums('./', 'sr6')
export const saveSr6Compendium = (comp: Sr6Compendium, rev?: number) => putCompendium('sr6', comp.id, sr6CompendiumXml(comp), rev)
export const parseSr6Rows = (rows: CompendiumRow[]) => parseRows(rows, readSr6Compendium)

type Save = (comp: Sr6Compendium, rev?: number) => Promise<SaveResult>
const why = (comp: Sr6Compendium, r: SaveResult) => r.ok ? '' : r.conflict ? `${comp.name} changed elsewhere; reload the page` : r.error ?? 'the server refused it'

/** NPCs into a compendium: saved there first (campaign sharing dropped), then deleted from the NPC area (to its trash). A
 *  failed compendium save moves nothing; left: the ones saved there but not taken out of the NPC area. */
export async function moveNpcsIn(comp: Stored<Sr6Compendium>, chs: Sr6Character[], remove: (id: string) => Promise<unknown>, save: Save = saveSr6Compendium):
  Promise<{ ok: true; left: Sr6Character[] } | { ok: false; error: string }> {
  const moved = chs.map(({ campaign: _, ...ch }) => ch), ids = new Set(moved.map(ch => ch.id))
  const r = await save({ ...comp, npcs: [...comp.npcs.filter(n => !ids.has(n.id)), ...moved] }, comp.rev)
  if (!r.ok) return { ok: false, error: why(comp, r) }
  const left: Sr6Character[] = []
  for (const ch of moved) await remove(ch.id).catch(() => left.push(ch))
  return { ok: true, left }
}

/** One of the compendium's NPCs out to the NPC area under a new id (the old one may still be in the NPC trash), then the
 *  compendium saved without it; a failed compendium save takes the new NPC back out. */
export async function moveNpcOut(comp: Stored<Sr6Compendium>, id: string, npcs: { save(ch: Sr6Character): Promise<SaveResult>; remove(id: string): Promise<unknown> },
  save: Save = saveSr6Compendium): Promise<{ ok: true; ch: Sr6Character } | { ok: false; error: string }> {
  const { campaign: _, ...was } = comp.npcs.find(n => n.id === id)!
  const ch: Sr6Character = { ...was, id: newId() }
  const put = await npcs.save(ch)
  if (!put.ok) return { ok: false, error: put.error ?? 'the NPC area refused it' }
  const r = await save({ ...comp, npcs: comp.npcs.filter(n => n.id !== id) }, comp.rev)
  if (r.ok) return { ok: true, ch }
  await npcs.remove(ch.id).catch(() => {})
  return { ok: false, error: why(comp, r) }
}
