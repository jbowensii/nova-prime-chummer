// The runner's own creation rules (Creation method tab): the optional rules a runner may choose for itself, over the
// table's (the server's, or its campaign's own), as Commlink6 lets a character pick its options. Each row shows the value
// the runner is built with and where it comes from (server, campaign, the runner, or locked by the campaign's GM); a
// locked one can't be changed here. Stored on the runner (Sr6Character.rules, creation.ts runnerRules); none: the table's.
import { CREATION_KEYS, keyType, RUNNER_RULE_KEYS, type CreationRules, type CreationSetting } from '../engine/creation'
import type { Sr6Character } from '../model/character'
import { useSr6Editor } from './editor'

const LABEL = new Map(CREATION_KEYS.map(k => [k.key, k.label]))
const shown = (s: CreationSetting | undefined) => (s === undefined ? 'Off' : s.value === true ? 'Yes' : s.value === false ? 'No' : String(s.value))
const FROM = { server: 'Server (Table setup)', campaign: 'Campaign' }

/** The runner's rules list with `key` set to `value` (undefined: the table's again). */
function withRule(rules: Sr6Character['rules'], key: string, value: string | undefined): Sr6Character['rules'] {
  const rest = (rules ?? []).filter(r => r.key !== key)
  const next = value === undefined ? rest : [...rest, { key, value }]
  return next.length ? next : undefined
}

export function RunnerRules() {
  const { ch, cr, table, locks, update, ro, career, npc } = useSr6Editor()
  if (npc) return null
  const own = new Map((ch.rules ?? []).map(r => [r.key, r]))
  const locked = new Map(locks.map(l => [l.key, l.by]))
  const set = (key: string, value: string | undefined) => update(d => { d.rules = withRule(d.rules, key, value) })
  const fixed = ro || career
  return (
    <section className="stack" aria-labelledby="runner-rules">
      <h3 id="runner-rules">Creation rules</h3>
      <p className="muted">The optional rules this runner is built and checked with. Each comes from the server (Table setup), its
        campaign, or this runner’s own choice; a campaign’s GM can lock one for its runners.{fixed && ' Read only here.'}</p>
      <div className="scroll-x"><table className="data runner-rules">
        <thead><tr><th>Rule</th><th>Value</th><th>From</th><th /></tr></thead>
        <tbody>{RUNNER_RULE_KEYS.filter(k => keyType(k.key)).map(({ key, about }) => {
          const label = LABEL.get(key) ?? key, eff = cr.get(key), mine = own.get(key), lock = locked.get(key)
          const from = lock ? `Locked by ${lock}` : mine ? mine.assumed ? 'This runner (assumed from the book’s numbers; the book doesn’t say)' : 'This runner'
            : eff ? FROM[eff.from === 'campaign' ? 'campaign' : 'server'] : table.has(key) ? FROM.server : 'Not set'
          return <tr key={key}>
            <td>{label}<div className="muted small">{about}</div></td>
            <td>{fixed || lock ? <span>{shown(eff)}</span> : <Control k={key} label={label} eff={eff} table={table} mine={mine?.value} set={v => set(key, v)} />}</td>
            <td>{from}</td>
            <td>{!fixed && !lock && mine && <button type="button" className="btn small" aria-label={`Use the table’s ${label}`} onClick={() => set(key, undefined)}>Use the table’s</button>}</td>
          </tr>
        })}</tbody></table></div>
    </section>
  )
}

/** A rule's control: the table's value, off, or the runner's own (a number, or yes/no). */
function Control({ k, label, eff, table, mine, set }: { k: string; label: string; eff?: CreationSetting; table: CreationRules; mine?: string; set: (v: string | undefined) => void }) {
  const type = keyType(k), base = table.get(k)
  const mode = mine === undefined ? 'table' : mine.trim() === '' ? 'off' : 'own'
  if (type === 'bool') return <select aria-label={label} value={mine === undefined ? '' : mine.trim() === '' ? 'off' : mine} onChange={e => set(e.target.value === '' ? undefined : e.target.value === 'off' ? '' : e.target.value)}>
    <option value="">The table’s: {shown(base)}</option><option value="true">Yes</option><option value="false">No</option><option value="off">Off</option>
  </select>
  return <span className="row">
    <select aria-label={`${label}: choice`} value={mode} onChange={e => set(e.target.value === 'table' ? undefined : e.target.value === 'off' ? '' : String(eff?.value ?? base?.value ?? 0))}>
      <option value="table">The table’s: {shown(base)}</option><option value="own">This runner’s</option><option value="off">Off</option>
    </select>
    {mode === 'own' && (type === 'letters' ? <input aria-label={label} value={mine} maxLength={5} size={6} onChange={e => set(e.target.value.toUpperCase())} />
      : <input type="number" step="any" aria-label={label} value={mine} onChange={e => set(e.target.value)} />)}
  </span>
}
