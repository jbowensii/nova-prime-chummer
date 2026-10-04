// Vehicles: vehicles and drones with their stats as the catalog prints them, and what's fitted to them (any gear or
// electronics: S1 has no vehicle mods kind).
import { entryOf } from '../../engine/budgets'
import { useSr6Editor } from '../editor'
import { PurchaseSection } from '../Picker'

const STATS: [string, string][] = [['handling', 'Handling'], ['accel', 'Accel'], ['interval', 'Speed interval'], ['topSpeed', 'Top speed'],
  ['body', 'Body'], ['armor', 'Armor'], ['pilot', 'Pilot'], ['sensor', 'Sensor'], ['seats', 'Seats']]

export function VehiclesTab() {
  const { data } = useSr6Editor()
  return (
    <div className="stack">
      <h2>Vehicles</h2>
      <PurchaseSection kind="vehicles" title="Vehicles and drones" one="a vehicle or drone" accessories={{ kinds: ['gear', 'electronics'] }}
        detail={x => { const a = entryOf(x, data)?.attrs ?? {}; return STATS.filter(([k]) => a[k]).map(([k, l]) => `${l} ${a[k]}`).join(' · ') }} />
    </div>
  )
}
