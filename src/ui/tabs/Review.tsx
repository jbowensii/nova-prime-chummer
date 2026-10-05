import { useState } from 'react'
import { activeEvents, canFinalize, finalize, reopen } from '../../engine'
import type { Violation } from '../../model/types'
import { fmt, Modal } from '../bits'
import { editHref, useEditor } from '../editor'
import { NpcBlock } from '../NpcBlock'

const tabFor = (path: string) => {
  const head = path.split('.')[0]
  return ({ attributes: 'attributes', skills: 'skills', amps: 'amps', items: 'gear', narrative: 'concept', identity: 'concept', level: 'concept' } as Record<string, string>)[head]
}

export function ReviewTab() {
  const { c, ch, d, v, p, balance, replace, career, ro, approve: approveAll } = useEditor()
  const gm = !!approveAll // GM approval is for GMs (editors) and the admin: on a player's runner, in a campaign they run
  const [approving, setApproving] = useState<Violation | null>(null)
  const [note, setNote] = useState('')
  const [finalizing, setFinalizing] = useState(false)
  const sorted = [...v].sort((a, b) => Number(!!a.approved) - Number(!!b.approved) || (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1))
  const ready = canFinalize(v)
  const earned = activeEvents(ch).some(e => e.type === 'earn')

  const [err, setErr] = useState('')
  const done = (r: string | null) => { setErr(r ?? ''); return !r }
  const approve = async () => {
    const x = approving!
    if (done(await approveAll!([...ch.overrides, { code: x.code, path: x.path, note: note.trim() }]))) { setApproving(null); setNote('') }
  }
  const revoke = async (x: Violation) => done(await approveAll!(ch.overrides.filter(o => !(o.code === x.code && o.path === x.path))))

  return (
    <div className="stack">
      <h2>Review</h2>
      <NpcBlock c={c} ch={ch} d={d} />
      <p className="muted">{ch.npc ? 'An NPC skips the creation checks (budget, caps); what’s left are problems with the build itself.'
        : 'Rule problems block finalizing until they’re fixed or a GM approves them. Notes never block.'}</p>
      {sorted.length === 0 && <p className="ok">No rule problems and nothing to note.</p>}
      <div>
        {sorted.map((x, i) => {
          const o = ch.overrides.find(o => o.code === x.code && o.path === x.path)
          const tab = tabFor(x.path)
          return (
            <div key={i} className={`viol${x.approved ? ' approved' : ''}`}>
              <span className={`sev ${x.approved ? 'ok' : x.severity === 'error' ? 'err' : 'warn'}`}>{x.approved ? 'Approved' : x.severity === 'error' ? 'Problem' : 'Note'}</span>
              <span className="msg">{x.message} {x.page && <span className="cite">{x.source} p.{x.page}</span>}</span>
              <span className="row">
                {tab && !x.approved && <a className="btn small quiet" href={editHref(ch, tab)}>Fix</a>}
                {gm && x.severity === 'error' && !x.approved && <button className="btn small" onClick={() => setApproving(x)}>GM approve</button>}
                {gm && x.approved && <button className="btn small quiet" onClick={() => revoke(x)}>Revoke</button>}
              </span>
              {o && <span className="note">GM: {o.note || 'approved'}</span>}
            </div>
          )
        })}
      </div>

      {err && <p className="banner err" role="alert">{err}</p>}
      {!ch.npc && !ro && <><hr className="sep" />
      <h2>Finalize</h2>
      {!career ? <>
        <p>Finalizing is the last check of creation. It locks nothing: afterwards you can still add, change or remove anything.
          Adding charges its price to your nuyen and removing gives the book price back; every change is logged in the ledger
          for your GM. The level-of-play creation caps no longer apply.
          {p.remaining > 0 && <> The {fmt(p.remaining)} left over carries into the ledger.</>}</p>
        <div><button className="btn primary" disabled={!ready} onClick={() => setFinalizing(true)}>Finalize runner</button>
          {!ready && <span className="muted"> Fix or approve the problems above first.</span>}</div>
      </> : <>
        <p>Finalized{ch.finalizedAt ? ` on ${ch.finalizedAt.slice(0, 10)}` : ''}. Balance {fmt(balance)}. Nothing is locked: every change is logged in the
          {' '}<a href={editHref(ch, 'ledger')}>ledger</a>, charged or refunded at the book price.</p>
        {earned
          ? <p className="muted">Creation can’t be reopened: the ledger has earnings.</p>
          : <div><button className="btn" onClick={() => replace(reopen(c, ch))}>Reopen creation</button>
            <span className="muted"> Back to creation (its caps apply again). Possible until the first earnings are recorded.</span></div>}
      </>}</>}

      <Modal open={!!approving} onClose={() => setApproving(null)} title="GM approval"
        actions={<><button className="btn" onClick={() => setApproving(null)}>Cancel</button><button className="btn primary" disabled={!note.trim()} onClick={approve}>Approve</button></>}>
        <p>{approving?.message}</p>
        <label>Why the GM allows it<input autoFocus value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Street-legend campaign, agreed at session zero" /></label>
      </Modal>
      <Modal open={finalizing} onClose={() => setFinalizing(false)} title={`Finalize ${ch.identity.streetName || ch.identity.name || 'this runner'}?`}
        actions={<><button className="btn" onClick={() => setFinalizing(false)}>Not yet</button>
          <button className="btn primary" onClick={() => { replace(finalize(c, ch)); setFinalizing(false); location.hash = `#/c/${ch.id}/ledger` }}>Finalize</button></>}>
        <p>The ledger starts with “Creation finished” and what is left. Until you record earnings, you can reopen creation here.</p>
      </Modal>
    </div>
  )
}
