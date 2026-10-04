// The SR6 compendiums on the server (/api/sr6/compendiums): Anarchy's store (src/ui/compendiumStore.ts) with SR6's file
// format (src/sr6/engine/compendium.ts). An Anarchy file never reads as an SR6 one.
import { listCompendiums, parseRows, putCompendium, type CompendiumRow } from '../../ui/compendiumStore'
import { readSr6Compendium, sr6CompendiumXml } from '../engine/compendium'
import type { Sr6Compendium } from '../model/types'

export const listSr6Compendiums = () => listCompendiums('./', 'sr6')
export const saveSr6Compendium = (comp: Sr6Compendium, rev?: number) => putCompendium('sr6', comp.id, sr6CompendiumXml(comp), rev)
export const parseSr6Rows = (rows: CompendiumRow[]) => parseRows(rows, readSr6Compendium)
