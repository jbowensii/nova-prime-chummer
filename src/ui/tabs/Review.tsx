import { useState } from 'react'
import { activeEvents, canFinalize, effectLines, finalize, optionOn, reopen, sinnerFree } from '../../engine'
import type { Violation } from '../../model/types'
import { fmt, Modal } from '../bits'
import { editHref, useEditor } from '../editor'
import { NpcBlock } from '../NpcBlock'
import { AnarchyRef, entryOfPath } from '../AnarchyRef'
import { HOUSE_RULES, ruleHelp, seeds } from '../TableRules'
import { SourceLabel } from '../SourceLabel'

/** The books' optional rules for this runner: the table's choice (Table setup) unless the runner sets its own. */
function OptionalRules() {
  const { c, ch, ro, table, update } = useEditor()
  // the books' optional rules (off unless switched on) and the app's house rules (on unless switched off)
  const rules = [
    ...seeds(c).map(r => ({
      id: r.id,
      title: r.title,
      help: ruleHelp(c, { name: r.title, text: r.text, rule: r }),
      rule: r,
      tableOn: table?.optional?.includes(r.id) ?? false,
      inPlay: optionOn(r.id, ch, table),
    })),
    ...HOUSE_RULES.map(h => ({
      id: h.id,
      title: h.name,
      help: ruleHelp(c, { name: h.name, text: h.text }),
      rule: undefined,
      tableOn: table?.freeSinner ?? true,
      inPlay: sinnerFree(ch, table),
    })),
  ]
  if (ch.npc) return null
  const set = (id: string, v: string) =>
    update(d => {
      const own = { ...d.optionalRules }
      if (v === '') delete own[id]
      else own[id] = v === 'on'
      if (Object.keys(own).length) d.optionalRules = own
      else delete d.optionalRules
    })
  return (
    <section aria-labelledby="review-optional">
      <h3 id="review-optional">Optional rules</h3>
      <p className="muted small">
        The books’ optional rules and the house rules play as your GM set them on Table setup, unless this runner sets its own; a rule the GM locked plays as
        the table has it.
      </p>
      <ul className="optional-rules">
        {rules.map(({ id, title, help, rule: r, tableOn, inPlay }) => {
          const own = ch.optionalRules?.[id],
            locked = table?.locked?.includes(id) ?? false
          return (
            <li key={id}>
              <label title={`${help} Choose On or Off for this runner, or leave it as the table has it.`}>
                {title} {r ? <SourceLabel c={c} source={r.source} page={r.page} id={r.id} /> : <span className="muted">House rule</span>}{' '}
                <select
                  value={locked || own === undefined ? '' : own ? 'on' : 'off'}
                  disabled={ro || locked}
                  onChange={e => set(id, e.target.value)}
                  aria-label={`${title} for this runner`}
                >
                  <option value="">As the table: {tableOn ? 'on' : 'off'}</option>
                  <option value="on">On</option>
                  <option value="off">Off</option>
                </select>
              </label>{' '}
              <span className="muted">
                {inPlay ? 'in play' : 'not in play'}
                {locked && ' (locked by the GM)'}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

const tabFor = (path: string) => {
  const head = path.split('.')[0]
  return (
    { attributes: 'attributes', skills: 'skills', amps: 'amps', items: 'gear', narrative: 'concept', identity: 'concept', level: 'concept' } as Record<
      string,
      string
    >
  )[head]
}

export function ReviewTab() {
  const { c, ch, d, v, p, balance, replace, career, ro, table, approve: approveAll } = useEditor()
  const gm = !!approveAll // GM approval is for GMs (editors) and the admin: on a player's runner, in a campaign they run
  const [approving, setApproving] = useState<Violation | null>(null)
  const [note, setNote] = useState('')
  const [finalizing, setFinalizing] = useState(false)
  const sorted = [...v].sort((a, b) => Number(!!a.approved) - Number(!!b.approved) || (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1))
  const ready = canFinalize(v)
  const earned = activeEvents(ch).some(e => e.type === 'earn')

  const [err, setErr] = useState('')
  const done = (r: string | null) => {
    setErr(r ?? '')
    return !r
  }
  const approve = async () => {
    const x = approving!
    if (done(await approveAll!([...ch.overrides, { code: x.code, path: x.path, note: note.trim() }]))) {
      setApproving(null)
      setNote('')
    }
  }
  const revoke = async (x: Violation) => done(await approveAll!(ch.overrides.filter(o => !(o.code === x.code && o.path === x.path))))

  return (
    <div className="stack">
      <h2>Review</h2>
      <NpcBlock c={c} ch={ch} d={d} />
      <p className="muted">
        {ch.npc
          ? 'An NPC skips the creation checks (budget, caps); what’s left are problems with the build itself.'
          : 'Rule problems block finalizing until they’re fixed or a GM approves them. Notes never block.'}
      </p>
      {sorted.length === 0 && <p className="ok">No rule problems and nothing to note.</p>}
      <div>
        {sorted.map((x, i) => {
          const o = ch.overrides.find(o => o.code === x.code && o.path === x.path)
          const tab = tabFor(x.path),
            at = entryOfPath(c, ch, x.path) // (the entry it names, with its card)
          return (
            <div key={i} className={`viol${x.approved ? ' approved' : ''}`}>
              <span className={`sev ${x.approved ? 'ok' : x.severity === 'error' ? 'err' : 'warn'}`}>
                {x.approved ? 'Approved' : x.severity === 'error' ? 'Problem' : 'Note'}
              </span>
              <span className="msg">
                {x.message}{' '}
                {x.page && (
                  <span className="cite">
                    {x.source} p.{x.page}
                  </span>
                )}
                {at && (
                  <>
                    {' '}
                    <AnarchyRef kind={at.kind} id={at.id}>
                      <span className="muted small">{at.name}</span>
                    </AnarchyRef>
                  </>
                )}
              </span>
              <span className="row">
                {tab && !x.approved && (
                  <a className="btn small quiet" href={editHref(ch, tab)}>
                    Fix
                  </a>
                )}
                {gm && x.severity === 'error' && !x.approved && (
                  <button className="btn small" onClick={() => setApproving(x)}>
                    GM approve
                  </button>
                )}
                {gm && x.approved && (
                  <button className="btn small quiet" onClick={() => revoke(x)}>
                    Revoke
                  </button>
                )}
              </span>
              {o && <span className="note">GM: {o.note || 'approved'}</span>}
            </div>
          )
        })}
      </div>

      {(d.effects.length > 0 || effectLines(d).length > 0) && (
        <section aria-labelledby="review-effects">
          <h3 id="review-effects">What its effects do</h3>
          <ul className="effects">
            {effectLines(d).map((x, i) => (
              <li key={`l${i}`}>{x}</li>
            ))}
            {d.effects
              .filter(e => e.type !== 'item' && e.type !== 'metatype')
              .map((e, i) => (
                <li key={i} className={e.applied ? undefined : 'muted'}>
                  {e.text}{' '}
                  <span className="muted">
                    ({e.from}
                    {e.how ? `, ${e.how}` : ''})
                  </span>
                </li>
              ))}
          </ul>
          <p className="muted small">
            A switchable effect, or one that holds only sometimes, counts in the bracketed totals, `1 (2)`; one read from a sentence the importer isn’t sure of
            is listed but not counted: change it in the Amp Builder (or on the Gear tab for an item) to count it.
          </p>
        </section>
      )}

      <OptionalRules />

      {err && (
        <p className="banner err" role="alert">
          {err}
        </p>
      )}
      {!ch.npc && !ro && (
        <>
          <hr className="sep" />
          <h2>Finalize</h2>
          {!career ? (
            <>
              <p>
                Finalizing is the last check of creation. It locks nothing: afterwards you can still add, change or remove anything. Adding charges its price to
                your nuyen and removing gives the book price back; every change is logged in the ledger for your GM. The level-of-play creation caps no longer
                apply.
                {p.remaining > 0 && <> The {fmt(p.remaining)} left over carries into the ledger.</>}
              </p>
              <div>
                <button className="btn primary" disabled={!ready} onClick={() => setFinalizing(true)}>
                  Finalize runner
                </button>
                {!ready && <span className="muted"> Fix or approve the problems above first.</span>}
              </div>
            </>
          ) : (
            <>
              <p>
                Finalized{ch.finalizedAt ? ` on ${ch.finalizedAt.slice(0, 10)}` : ''}. Balance {fmt(balance)}. Nothing is locked: every change is logged in the{' '}
                <a href={editHref(ch, 'ledger')}>ledger</a>, charged or refunded at the book price.
              </p>
              {earned ? (
                <p className="muted">Creation can’t be reopened: the ledger has earnings.</p>
              ) : (
                <div>
                  <button className="btn" onClick={() => replace(reopen(c, ch))}>
                    Reopen creation
                  </button>
                  <span className="muted"> Back to creation (its caps apply again). Possible until the first earnings are recorded.</span>
                </div>
              )}
            </>
          )}
        </>
      )}

      <Modal
        open={!!approving}
        onClose={() => setApproving(null)}
        title="GM approval"
        actions={
          <>
            <button className="btn" onClick={() => setApproving(null)}>
              Cancel
            </button>
            <button className="btn primary" disabled={!note.trim()} onClick={approve}>
              Approve
            </button>
          </>
        }
      >
        <p>{approving?.message}</p>
        <label>
          Why the GM allows it
          <input autoFocus value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Street-legend campaign, agreed at session zero" />
        </label>
      </Modal>
      <Modal
        open={finalizing}
        onClose={() => setFinalizing(false)}
        title={`Finalize ${ch.identity.streetName || ch.identity.name || 'this runner'}?`}
        actions={
          <>
            <button className="btn" onClick={() => setFinalizing(false)}>
              Not yet
            </button>
            <button
              className="btn primary"
              onClick={() => {
                replace(finalize(c, ch, table))
                setFinalizing(false)
                location.hash = `#/c/${ch.id}/ledger`
              }}
            >
              Finalize
            </button>
          </>
        }
      >
        <p>The ledger starts with “Creation finished” and what is left. Until you record earnings, you can reopen creation here.</p>
      </Modal>
    </div>
  )
}
