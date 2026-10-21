// What a creation method still needs from the table's creation settings, and the list that says so (the runners page and a
// runner's Method tab share it).
import { expandKeys, missingFor, type CreationRules } from '../engine/creation'
import type { Sr6Data } from '../engine/data'
import { SR6_METHOD_LABELS, SR6_METHODS, type Sr6Method } from '../model/character'

/** What `method` still needs, in the Game data form's words. */
export function missingLabels(method: Sr6Method, cr: CreationRules, data: Sr6Data): string[] {
  const labels = new Map(expandKeys(data).map(k => [k.key, k.label]))
  // the Karma build option's own label is a long sentence that starts with the method's name: say the reason short
  return missingFor(method, cr, data).map(k =>
    k === 'karmaBuildMethod' ? 'the option is switched off' : k === 'restrictMethods' ? 'the table doesn’t allow it' : (labels.get(k) ?? k),
  )
}

/** Each method that can't be picked yet, with the settings it still needs. */
export function MissingList({ missing }: { missing: Record<Sr6Method, string[]> }) {
  const blocked = SR6_METHODS.filter(m => missing[m].length)
  if (!blocked.length) return null
  return (
    <div className="missing">
      <p className="muted">These need creation settings first (Table setup → Creation rules):</p>
      <ul>
        {blocked.map(m => (
          <li key={m}>
            <b>{SR6_METHOD_LABELS[m]}</b>: {missing[m].join(', ')}
          </li>
        ))}
      </ul>
    </div>
  )
}
