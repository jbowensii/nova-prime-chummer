// Augmentations: cyberware, bioware, geneware, nanoware, symbionts and transgenics with rating and grade (cyberware and bioware) (only grades whose factors the table has set), Essence,
// the player's bonuses, and accessories (R: no mount data, so a cyberlimb's options are gear from any accessory category).
import { num } from '../../../table-setup/domain/creation'
import { augmentationRoom } from '../../domain/creation/budgets'
import { MAGIC_KINDS } from '../../../catalog/domain/data'
import { useSr6Editor } from '../editor'
import { Left } from '../Budgets'
import { gradesFor } from '../../domain/creation/grades'
import { ACCESSORY_KINDS, isAccessory, PurchaseSection } from '../Picker'

export function AugmentationsTab() {
  const { ch, cr, data, budgets } = useSr6Editor()
  const es = budgets.essence,
    k = MAGIC_KINDS[ch.build.magic]
  return (
    <div className="stack">
      <h2>Augmentations</h2>
      <p className="muted">
        Essence: <Left x={es} />.
        {es.magicLoss > 0 && (k.spells || k.powers || k.resonance) && ` It costs ${es.magicLoss} ${k.resonance ? 'Resonance' : 'Magic'}.`}
        {num(cr, 'essence') === undefined && ' Essence isn’t set: Table setup → Creation rules.'}
        {gradesFor(cr, data).length === 0 && ' No grades are set up yet (Table setup → Creation rules), so ware is bought without one.'}
      </p>
      {/* (owner's decision 9: an augmentation the runner has isn't offered again; a limb one a side) */}
      <PurchaseSection
        kind="augmentations"
        title="Augmentations"
        one="an augmentation"
        grades
        bonuses
        offer={e => augmentationRoom(ch.build, data, e) > 0}
        accessories={{ kinds: ACCESSORY_KINDS, filter: isAccessory }}
      />
    </div>
  )
}
