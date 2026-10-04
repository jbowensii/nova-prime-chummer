// Augmentations: cyberware and bioware with rating and grade (only grades whose factors the table has set), Essence,
// the player's bonuses, and accessories (R: no mount data, so a cyberlimb's options are gear from any accessory category).
import { num } from '../../engine/creation'
import { MAGIC_KINDS } from '../../engine/data'
import { n, useSr6Editor } from '../editor'
import { gradesSet, isAccessory, PurchaseSection } from '../Picker'

export function AugmentationsTab() {
  const { ch, cr, budgets } = useSr6Editor()
  const es = budgets.essence, k = MAGIC_KINDS[ch.build.magic]
  return (
    <div className="stack">
      <h2>Augmentations</h2>
      <p className="muted">Essence: <b className={es.left < 0 ? 'err' : ''}>{n(es.left)} left</b> of {n(es.max)}.
        {es.magicLoss > 0 && (k.spells || k.powers || k.resonance) && ` It costs ${es.magicLoss} ${k.resonance ? 'Resonance' : 'Magic'}.`}
        {num(cr, 'essence') === undefined && ' Essence isn’t set: Rules → Creation rules.'}
        {gradesSet(cr).length === 0 && ' No grades are set up yet (Rules → Creation rules), so ware is bought without one.'}</p>
      <PurchaseSection kind="augmentations" title="Cyberware and bioware" one="an augmentation" grades bonuses
        accessories={{ kinds: ['gear'], filter: isAccessory }} />
    </div>
  )
}
