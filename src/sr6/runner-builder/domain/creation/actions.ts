// Build actions, the editor's mutators (a port of SR6 Forge's ChargenEngine setters and spend). Each one changes the
// build (or the runner) in place: the editor works on a copy. The character-level setters (method, letters, metatype,
// magic kind) take the runner so identity.metatype stays build.metatype; apply() takes the build and answers
// { ok: false, reason } without changing anything when the step isn't allowed. Rule numbers come from the catalog and
// the creation rules; a refusal here is only what can't be stored at all (Review's rules flag the rest). A prerequisite
// the runner lacks never refuses a step (owner, 2026-10-09): it is taken, and Review's error stands until a GM approves it.
import { stampOrder } from './cyberadept'
import type { Sr6Build } from '../../../formats/domain/character'
import type { CreationRules } from '../../../table-setup/domain/creation'
import type { Sr6Data } from '../../../catalog/domain/data'
import { type Op, type Result } from './actions-helpers'
import { applyAttributes } from './actions-attributes'
import { applyQualities } from './actions-qualities'
import { applyPurchases } from './actions-purchases'
import { applyVehicles } from './actions-vehicles'
import { applyContacts } from './actions-contacts'

export type { Op, Result } from './actions-helpers'
export { deep, unfit, adeptBars, sameChoice, opposite, accessoryProblem, setPart } from './actions-helpers'
export { setMethod, setPriority, setMetatype, setMagic, infectedTo, reconcile } from './actions-setters'

/** Apply one editor step to the build. */
export function apply(b: Sr6Build, op: Op, data: Sr6Data, cr: CreationRules): Result {
  const r = applyOp(b, op, data, cr)
  stampOrder(b) // (the order lines are taken in: cyberadept.ts)
  return r
}

function applyOp(b: Sr6Build, op: Op, data: Sr6Data, cr: CreationRules): Result {
  switch (op.op) {
    case 'attribute':
    case 'skill':
    case 'specs':
    case 'spec':
    case 'expertise':
    case 'infected':
    case 'awakened':
    case 'dracoform':
    case 'collective':
    case 'shifterForm':
      return applyAttributes(b, op, data, cr)
    case 'quality':
    case 'pick':
    case 'pickNote':
    case 'powerLevel':
    case 'martialart':
    case 'technique':
    case 'powerPoints':
      return applyQualities(b, op, data, cr)
    case 'purchase':
    case 'pack':
    case 'design':
    case 'custom':
    case 'quantity':
    case 'lineOptions':
    case 'purchaseNote':
    case 'accessory':
    case 'ammoType':
    case 'gmprice':
    case 'diy':
    case 'material':
    case 'wear':
    case 'itemFlag':
    case 'rate':
    case 'bonus':
    case 'situational':
    case 'licensed':
      return applyPurchases(b, op, data, cr)
    case 'vehicledp':
    case 'mount':
    case 'shift':
    case 'slot':
    case 'builtin':
    case 'derive':
    case 'part':
    case 'critter':
    case 'critterTrained':
    case 'critterQuality':
    case 'seats':
      return applyVehicles(b, op, data, cr)
    case 'contact':
    case 'knowledge':
    case 'knowledgePayment':
    case 'knowledgeRank':
    case 'cp':
    case 'lifemodule':
    case 'bestAttr':
    case 'lifestyle':
    case 'sin':
    case 'licence':
    case 'karmaToNuyen':
    case 'karmaToDeck':
    case 'mentor':
    case 'transhuman':
    case 'initiation':
    case 'submersion':
      return applyContacts(b, op, data, cr)
  }
}
