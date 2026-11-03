// Ledger: the catalog picker the Spend row opens, and the confirm, void and edit dialogs.
// Moved out of Ledger.tsx unchanged; the state lives in LedgerForm.ts.
import { Modal } from '../../../../core/ui-kit/bits'
import { entryOf, isDrone } from '../../domain/creation/budgets'
import { ledgerLabel } from '../../domain/career/career'
import { picksFor } from '../../../catalog/domain/data'
import { type PickKind } from '../../../formats/domain/character'
import { ACCESSORY_KINDS, CatalogPicker, isAccessory } from '../Picker'
import { offeredOn } from '../../../catalog/domain/categories'
import { techniqueFits } from '../../domain/creation/martial'
import { critterWearable } from './Critters'
import { buyKinds, LEARN, whole, type LedgerForm } from './LedgerForm'

export function LedgerDialogs({ L }: { L: LedgerForm }) {
  const {
    data,
    b,
    op,
    f,
    setPicked,
    picking,
    setPicking,
    confirm,
    setConfirm,
    voiding,
    setVoiding,
    why,
    setWhy,
    editing,
    setEditing,
    ef,
    setEf,
    set,
    host,
    kindName,
    an,
    styleOf,
    upgradable,
    above,
    priceLine,
    spend,
    doVoid,
    saveEdit,
  } = L
  return (
    <>
      <CatalogPicker
        open={picking}
        onClose={() => setPicking(false)}
        grades={op === 'purchase'}
        title={
          op === 'quality'
            ? 'Buy a quality'
            : op in LEARN || op === 'martialart' || op === 'technique'
              ? 'Learn'
              : op === 'upgrade'
                ? 'Upgrade to'
                : op === 'fit'
                  ? 'Fit'
                  : op === 'derive'
                    ? 'Derive a mod from'
                    : op === 'critter'
                      ? 'Buy a critter'
                      : op === 'vehicle'
                        ? 'Buy a vehicle'
                        : op === 'drone'
                          ? 'Buy a drone'
                          : 'Buy gear'
        }
        critter={(op === 'fit' && host?.kind === 'critters') || undefined}
        kinds={
          op === 'quality'
            ? ['qualities']
            : op in LEARN
              ? [LEARN[op]]
              : op === 'martialart'
                ? ['martialarts']
                : op === 'technique'
                  ? ['martialtechniques']
                  : op === 'upgrade'
                    ? [upgradable.find(x => x.uid === f.target)?.kind ?? 'gear']
                    : op === 'derive'
                      ? ['gear', 'electronics', 'programs', 'armor']
                      : op === 'fit'
                        ? host?.kind === 'critters'
                          ? ['augmentations', 'gear', 'electronics']
                          : host?.kind === 'vehicles'
                            ? ['gear', 'weapons', 'electronics', 'programs']
                            : ACCESSORY_KINDS // cyberware/bioware/gear host: the accessory kinds, filtered to what fits it
                        : op === 'critter'
                          ? ['critters']
                          : buyKinds(op)
        }
        filter={
          op === 'vehicle' || op === 'drone'
            ? e => isDrone(e) === (op === 'drone')
            : op === 'quality'
              ? e => !!data.qualities[e.id]
              : op === 'upgrade'
                ? above(upgradable.find(x => x.uid === f.target))
                : op === 'fit'
                  ? host?.kind === 'critters'
                    ? critterWearable
                    : host?.kind === 'vehicles'
                      ? e => e.kind !== 'weapons' || !isAccessory(e)
                      : e => offeredOn(data.categories, e, entryOf(host!, data), undefined, isAccessory, host!.addedSlots) // only accessories that fit the implant/host
                  : undefined
        }
        note={
          op in LEARN
            ? e => (picksFor(b.magic)[e.kind as PickKind] ? undefined : `not for ${an(kindName)} ${kindName}`)
            : op === 'technique'
              ? e => (techniqueFits(styleOf(f.target), e) ? undefined : 'not taught by this style')
              : undefined
        }
        onAdd={x => {
          setPicked(x)
          set({ note: '' })
          return null
        }}
      />
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Record this spend?"
        actions={
          <>
            <button className="btn" onClick={() => setConfirm(false)}>
              Cancel
            </button>
            <button className="btn primary" onClick={spend}>
              Record it
            </button>
          </>
        }
      >
        <p>{priceLine}</p>
        <p className="muted">It goes in the ledger; Void takes it back while it’s the newest spend.</p>
      </Modal>
      <Modal
        open={!!voiding}
        onClose={() => setVoiding(null)}
        title="Void this entry?"
        actions={
          <>
            <button className="btn" onClick={() => setVoiding(null)}>
              Cancel
            </button>
            <button className="btn primary" disabled={!why.trim()} onClick={doVoid}>
              Void
            </button>
          </>
        }
      >
        <p>{voiding && ledgerLabel(voiding)}</p>
        <label>
          Why
          <input autoFocus value={why} onChange={e => setWhy(e.target.value)} placeholder="e.g. Picked the wrong one" />
        </label>
      </Modal>
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Edit this line"
        actions={
          <>
            <button className="btn" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button className="btn primary" onClick={saveEdit}>
              Save
            </button>
          </>
        }
      >
        {editing && (
          <div className="stack">
            {(editing.type === 'finalize' || editing.type === 'earn' || editing.type === 'advance') && (
              <div className="row">
                <label>
                  Karma
                  <input
                    type="number"
                    step={1}
                    value={ef.karma ?? 0}
                    onChange={e => setEf({ ...ef, karma: whole(e.target.value) || 0 })}
                    style={{ width: '7rem' }}
                  />
                </label>
                <label>
                  Nuyen
                  <input
                    type="number"
                    step={100}
                    value={ef.nuyen ?? 0}
                    onChange={e => setEf({ ...ef, nuyen: whole(e.target.value) || 0 })}
                    style={{ width: '9rem' }}
                  />
                </label>
              </div>
            )}
            {editing.type === 'earn' && (
              <div className="row">
                <label style={{ flex: 1 }}>
                  Run
                  <input value={ef.run ?? ''} onChange={e => setEf({ ...ef, run: e.target.value })} />
                </label>
                <label>
                  Date
                  <input type="date" value={ef.date ?? ''} onChange={e => setEf({ ...ef, date: e.target.value })} />
                </label>
              </div>
            )}
            {editing.type === 'advance' && (
              <label>
                What it was
                <input value={ef.label ?? ''} onChange={e => setEf({ ...ef, label: e.target.value })} />
              </label>
            )}
            {editing.type === 'note' && (
              <label>
                Note
                <input autoFocus value={ef.text ?? ''} onChange={e => setEf({ ...ef, text: e.target.value })} />
              </label>
            )}
            <p className="muted">A spend’s amounts are a plus taken off; a plus here spends more, a minus gives back. The balances re-total from the line.</p>
          </div>
        )}
      </Modal>
    </>
  )
}
