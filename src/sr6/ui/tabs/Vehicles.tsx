// Vehicles: vehicles and drones with their stats as the catalog prints them, and what's fitted to them (any gear or
// electronics: S1 has no vehicle mods kind).
import { Stepper } from '../../../ui/bits'
import { cargoFactor, entryOf, seatsOf } from '../../engine/budgets'
import { flag } from '../../engine/creation'
import { useSr6Editor } from '../editor'
import { PurchaseSection } from '../Picker'

const STATS: [string, string][] = [
  ['handling', 'Handling'],
  ['accel', 'Accel'],
  ['interval', 'Speed interval'],
  ['topSpeed', 'Top speed'],
  ['body', 'Body'],
  ['armor', 'Armor'],
  ['pilot', 'Pilot'],
  ['sensor', 'Sensor'],
  ['seats', 'Seats'],
]

export function VehiclesTab() {
  const { data, cr, act } = useSr6Editor()
  // the option cargoWithoutSeats (Double Clutch p. 126): seats taken out add to the Cargo Factor
  const cargo = !!flag(cr, 'cargoWithoutSeats')
  return (
    <div className="stack">
      <h2>Vehicles</h2>
      <PurchaseSection
        kind="vehicles"
        title="Vehicles and drones"
        one="a vehicle or drone"
        accessories={{ kinds: ['gear', 'electronics', 'programs'] }}
        detail={x => {
          const e = entryOf(x, data),
            a = e?.attrs ?? {},
            cf = cargo ? cargoFactor(x, e) : null
          return (
            <>
              {STATS.filter(([k]) => a[k])
                .map(([k, l]) => `${l} ${a[k]}`)
                .join(' · ')}
              {cf && (
                <span className="row">
                  Seats removed{' '}
                  <Stepper
                    label={`${e!.name} seats removed`}
                    value={x.seatsRemoved ?? 0}
                    min={0}
                    max={seatsOf(e)}
                    onChange={removed => act({ op: 'seats', uid: x.uid, removed })}
                  />{' '}
                  Seats {cf.seats} · Cargo Factor {cf.cargo}
                </span>
              )}
            </>
          )
        }}
      />
    </div>
  )
}
