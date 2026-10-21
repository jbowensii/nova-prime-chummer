// The runner's own creation rules (Creation method tab): the optional rules a runner may choose for itself, over the
// table's (the server's, or its campaign's own). Each row shows the value
// the runner is built with and where it comes from (server, campaign, the runner, or locked by the campaign's GM); a
// locked one can't be changed here. Stored on the runner (Sr6Character.rules, creation.ts runnerRules); none: the table's.
import { useState } from 'react'
import { aboutOf, blockedBy, CREATION_KEYS, isOn, keyType, RUNNER_RULE_KEYS, type CreationRules, type CreationSetting } from '../table-setup/domain/creation'
import { RuleWhy } from '../table-setup/ui/Creation'
import { ruleKind, splitLabel } from '../table-setup/ui/creationLayout'
import { RuleSearch, RuleSections, type RuleItem } from '../table-setup/ui/RuleSections'
import type { Sr6Character } from '../formats/domain/character'
import { useSr6Editor } from './editor'

const META = new Map(CREATION_KEYS.map(k => [k.key, k])),
  LABEL = new Map(CREATION_KEYS.map(k => [k.key, k.label])),
  labelOf = (k: string) => LABEL.get(k) ?? k
// the optional rules, in the same sections as Table setup (creationLayout.ts), a nested one under its parent (creation.ts RULE_DEPS)
const ITEMS: RuleItem[] = RUNNER_RULE_KEYS.filter(k => keyType(k.key)).map(({ key }) => ({
  key,
  label: labelOf(key),
  group: META.get(key)?.group ?? 'General',
}))
const shown = (s: CreationSetting | undefined) => (s === undefined ? 'Off' : s.value === true ? 'On' : s.value === false ? 'Off' : String(s.value))
const FROM = { server: 'Server (Table setup)', campaign: 'Campaign' }

/** The runner's rules list with `key` set to `value` (undefined: the table's again). */
function withRule(rules: Sr6Character['rules'], key: string, value: string | undefined): Sr6Character['rules'] {
  const rest = (rules ?? []).filter(r => r.key !== key)
  const next = value === undefined ? rest : [...rest, { key, value }]
  return next.length ? next : undefined
}

export function RunnerRules() {
  const { ch, cr, table, locks, update, ro, career, npc } = useSr6Editor()
  const [q, setQ] = useState('')
  if (npc) return null
  const own = new Map((ch.rules ?? []).map(r => [r.key, r]))
  const locked = new Map(locks.map(l => [l.key, l.by]))
  const set = (key: string, value: string | undefined) =>
    update(d => {
      d.rules = withRule(d.rules, key, value)
    })
  const resetKeys = (keys: string[]) =>
    update(d => {
      const rest = (d.rules ?? []).filter(r => !keys.includes(r.key))
      d.rules = rest.length ? rest : undefined
    })
  const fixed = ro || career
  return (
    <section className="stack runner-rules" aria-labelledby="runner-rules">
      <h3 id="runner-rules">Creation rules</h3>
      <p className="muted">
        The optional rules this runner is built and checked with. Each comes from the server (Table setup), its campaign, or this runner’s own choice; a
        campaign’s GM can lock one for its runners.{fixed && ' Read only here.'}
      </p>
      <RuleSearch q={q} setQ={setQ} label="Search the rules" />
      <RuleSections
        items={ITEMS}
        q={q}
        changed={k => own.has(k.key) && !locked.has(k.key)}
        onReset={fixed ? undefined : resetKeys}
        head={
          <div className="cr-head" aria-hidden>
            <span>Rule</span>
            <span>Value</span>
            <span />
          </div>
        }
        row={({ key }, depth) => {
          const label = labelOf(key),
            eff = cr.get(key),
            mine = own.get(key),
            lock = locked.get(key),
            off = !!blockedBy(cr, key),
            kind = ruleKind(key)
          const { title, hint } = splitLabel(label),
            bool = keyType(key) === 'bool',
            id = `rr-${key}`
          const from = lock
            ? `Locked by ${lock}`
            : mine
              ? mine.assumed
                ? 'This runner (assumed from the book’s numbers; the book doesn’t say)'
                : 'This runner'
              : eff
                ? FROM[eff.from === 'campaign' ? 'campaign' : 'server']
                : table.has(key)
                  ? FROM.server
                  : 'Not set'
          const name = (
            <>
              {depth > 0 && hint ? (
                <b>{hint[0].toUpperCase() + hint.slice(1)}</b>
              ) : (
                <>
                  <b>{title}</b>
                  {hint && <span className="hint">: {hint}</span>}
                </>
              )}
              {kind && <span className="tag">{kind === 'option' ? 'option' : 'house rule'}</span>}
            </>
          )
          return (
            <div className={['cr-row', bool ? 'bool' : '', depth ? 'nested' : '', off ? 'blocked' : '', mine && !lock ? 'changed' : 'at-std'].join(' ')}>
              <div className="cr-name" title={aboutOf(key) || undefined}>
                {bool ? <label htmlFor={id}>{name}</label> : <span>{name}</span>}
                <RuleWhy k={key} eff={cr} label={labelOf} />
                <div className="muted small">{from}</div>
              </div>
              <div className="cr-val">
                {bool ? (
                  <Switch id={id} label={label} on={isOn(eff)} tableOn={isOn(table.get(key))} disabled={fixed || !!lock || off} set={v => set(key, v)} />
                ) : fixed || lock ? (
                  <span>{shown(eff)}</span>
                ) : (
                  <Control k={key} label={label} eff={eff} table={table} mine={mine?.value} off={off} set={v => set(key, v)} />
                )}
              </div>
              <div className="cr-book">
                {!fixed && !lock && mine && (
                  <button type="button" className="btn small" aria-label={`Use the table’s ${label}`} onClick={() => set(key, undefined)}>
                    Use the table’s
                  </button>
                )}
              </div>
            </div>
          )
        }}
      />
    </section>
  )
}

/** A yes/no rule's switch: it shows what the runner is built with. Switched to what the table has, the runner follows the
 *  table again; else the runner's own choice, on or off. */
function Switch({
  id,
  label,
  on,
  tableOn,
  disabled,
  set,
}: {
  id: string
  label: string
  on: boolean
  tableOn: boolean
  disabled: boolean
  set: (v: string | undefined) => void
}) {
  return (
    <label className="tgl">
      <input
        id={id}
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={on}
        disabled={disabled}
        onChange={e => set(e.target.checked === tableOn ? undefined : e.target.checked ? 'true' : 'false')}
      />
      <span className="track" aria-hidden />
    </label>
  )
}

/** A rule's control: the table's value, off, or the runner's own (a number, letters or a quality). */
function Control({
  k,
  label,
  eff,
  table,
  mine,
  off,
  set,
}: {
  k: string
  label: string
  eff?: CreationSetting
  table: CreationRules
  mine?: string
  off: boolean
  set: (v: string | undefined) => void
}) {
  const type = keyType(k),
    base = table.get(k)
  const mode = mine === undefined ? 'table' : mine.trim() === '' ? 'off' : 'own'
  return (
    <span className="row">
      <select
        aria-label={`${label}: choice`}
        disabled={off}
        value={mode}
        onChange={e => set(e.target.value === 'table' ? undefined : e.target.value === 'off' ? '' : String(eff?.value ?? base?.value ?? 0))}
      >
        <option value="table">The table’s: {shown(base)}</option>
        <option value="own">This runner’s</option>
        <option value="off">Off</option>
      </select>
      {mode === 'own' &&
        (type === 'letters' ? (
          <input aria-label={label} disabled={off} value={mine} maxLength={5} size={6} onChange={e => set(e.target.value.toUpperCase())} />
        ) : type === 'quality' ? (
          <input aria-label={label} disabled={off} value={mine} maxLength={80} placeholder="a catalog id" onChange={e => set(e.target.value.trim())} />
        ) : (
          <input type="number" step="any" aria-label={label} disabled={off} value={mine} onChange={e => set(e.target.value)} />
        ))}
    </span>
  )
}
