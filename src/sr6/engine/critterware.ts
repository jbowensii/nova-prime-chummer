// Critter-only equipment: an entry whose class starts with CRITTERWARE/ (importer/sr6/classes/section_prefix.json: Body
// Shop's "Taming the Wild" chapter, CRITTERWARE/AUGMENTATION, a deliberate extra class that is not Commlink6's) is in the
// catalog and the data browser but is never offered to a player's character, nor accepted for it.
import type { Sr6Entry } from '../model/types'

export const CRITTER_ONLY = 'CRITTERWARE/'

export const critterOnly = (e: Pick<Sr6Entry, 'attrs'> | undefined): boolean => !!e?.attrs.class?.toUpperCase().startsWith(CRITTER_ONLY)
