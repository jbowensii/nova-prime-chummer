// Critter-only equipment: an entry whose class starts with CRITTERWARE/ (importer/sr6/classes/section_prefix.json: Body
// Shop's "Taming the Wild" chapter, CRITTERWARE/AUGMENTATION, a deliberate extra class that is not Commlink6's) is in the
// catalog and the data browser but is never offered to a player's character, nor accepted for it.
// Infected: an entry whose class starts with INFECTED (the Sixth World Companion's Infected qualities, Commlink6's type
// INFECTED, and its Infected optional powers, INFECTED/OPTIONAL_POWER, pp. 109-114) is offered and accepted only while the
// table's optional rule infectedAllowed is on (SWC p. 104: Infected player characters are an optional rule).
import type { Sr6Entry } from '../../../formats/domain/types'
import { flag, type CreationRules } from '../../../table-setup/domain/creation'

export const CRITTER_ONLY = 'CRITTERWARE/'

export const critterOnly = (e: Pick<Sr6Entry, 'attrs'> | undefined): boolean => !!e?.attrs.class?.toUpperCase().startsWith(CRITTER_ONLY)

/** An Infected quality or optional power (its class INFECTED or INFECTED/…). */
export const infectedQuality = (e: Pick<Sr6Entry, 'attrs'> | undefined): boolean => /^INFECTED(\/|$)/i.test(e?.attrs.class ?? '')

/** An Infected quality or optional power while the table doesn't allow Infected player characters. */
export const infectedOff = (e: Pick<Sr6Entry, 'attrs'> | undefined, cr: CreationRules): boolean => infectedQuality(e) && !flag(cr, 'infectedAllowed')
