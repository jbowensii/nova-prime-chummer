// Contacts at creation: the contact points Charisma gives, and the expanded rules' karma.
import type { Sr6Build } from '../../../formats/domain/character'
import { flag, n0, num, type CreationRules } from '../../../table-setup/domain/creation'
import type { Sr6Data } from '../../../catalog/domain/data'
import { contactSpend, pool, type Budget, type Provider } from './providers'
import { augmentedRating } from './attributes'

/** Charisma × contactPointsPerCha points for connection and loyalty, each up to Charisma (CRB Hong Kong p. 67). With
 *  expandedContacts on, the Sixth World Companion's optional expanded rules (SWC p. 161): contactKarma karma buys each
 *  point past the pool, and each past a contact's connection + loyalty of contactPairPerCha × Charisma; no rating above
 *  contactRatingMax. */
export function contactPoints(b: Sr6Build, data: Sr6Data, cr: CreationRules, p: Provider): Budget & { ratingCap: number; karma?: number } {
  if (p.contactPoints) return p.contactPoints(b)
  const cha = augmentedRating(b, data, 'cha', p),
    max = cha * n0(cr, 'contactPointsPerCha'),
    spend = contactSpend(b),
    price = num(cr, 'contactKarma')
  if (price === undefined || !flag(cr, 'expandedContacts')) return { ...pool(max, spend), ratingCap: cha }
  const pair = num(cr, 'contactPairPerCha'),
    soft = pair === undefined ? Infinity : cha * pair,
    past = Math.max(0, spend - max)
  const pairs = b.contacts.reduce((t, c) => t + Math.max(0, c.connection + c.loyalty - soft), 0)
  return { ...pool(max, spend - past), ratingCap: num(cr, 'contactRatingMax') ?? cha, karma: (past + pairs) * price }
}
