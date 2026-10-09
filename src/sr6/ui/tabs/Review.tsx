// Review: every broken creation rule and note with its page, each linked to the tab where it's fixed (a violation's path
// starts with the tab id), GM approval as Anarchy's, the derived values, and Finalize. In career: the career checks
// (validateCareer, already in the context), the derived values of the runner as it stands, the ledger's balances, and Back
// to draft only while the ledger holds nothing live to undo.
import { useState } from 'react'
import type { Violation } from '../../../model/types'
import { Modal } from '../../../ui/bits'
import { balances, canDraft } from '../../engine/career'
import { draftAgain, finalizeSr6 } from '../../engine/finalize'
import { canFinalizeSr6 } from '../../engine/rules'
import { sr6Tabs } from '../EditorView'
import { ATTR_NAMES, n, sr6EditHref, useSr6Editor } from '../editor'

export function ReviewTab() {
  const { ch, v, d, budgets, replace, career, ro, approve: approveAll } = useSr6Editor()
  const gm = !!approveAll // GM approval is for GMs (editors) and the admin: on a player's runner, in a campaign they run
  const [approving, setApproving] = useState<Violation | null>(null)
  const [note, setNote] = useState('')
  const [asking, setAsking] = useState<'finalize' | 'draft' | null>(null)
  const sorted = [...v].sort((a, b) => Number(!!a.approved) - Number(!!b.approved) || (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1))
  const tabs = sr6Tabs(ch.build.magic, career)
  const bal = balances(ch), drafting = canDraft(ch)
  // a pick left on a runner that's no longer awakened is fixed on Creation method (its Magic tab is gone)
  const tabOf = (path: string) => { const head = path.split('.')[0]; return tabs.some(([k]) => k === head) ? head : head === 'magic' ? 'method' : undefined }
  const ready = canFinalizeSr6(v)
  const name = ch.identity.streetName || ch.identity.name || 'this runner'

  const [err, setErr] = useState('')
  const done = (r: string | null) => { setErr(r ?? ''); return !r }
  const approve = async () => {
    const x = approving!
    if (done(await approveAll!([...ch.overrides, { code: x.code, path: x.path, note: note.trim() }]))) { setApproving(null); setNote('') }
  }
  const revoke = async (x: Violation) => done(await approveAll!(ch.overrides.filter(o => !(o.code === x.code && o.path === x.path))))
  const finalize = () => { const next = finalizeSr6(ch, budgets, v); if (next) replace(next); setAsking(null) }
  const draft = () => { const next = draftAgain(ch); if (next) replace(next); setAsking(null) }

  const dl = (rows: [string, string | number | null | undefined][]) => <dl className="sr6-derived">
    {rows.filter(([, x]) => x !== undefined).map(([k, x]) => <div key={k}><dt>{k}</dt><dd>{x === null ? '—' : typeof x === 'number' ? n(x) : x}</dd></div>)}</dl>
  const init = (i?: { base: number; dice: number | null }) => i && `${i.base} + ${i.dice ?? '?'}D6`

  return (
    <div className="stack">
      <h2>Review</h2>
      <p className="muted">Rule problems block finalizing until they’re fixed or a GM approves them. Notes never block.</p>
      {sorted.length === 0 && <p className="ok">No rule problems and nothing to note.</p>}
      <div>{sorted.map((x, i) => {
        const tab = tabOf(x.path), o = ch.overrides.find(o => o.code === x.code && o.path === x.path)
        return <div key={i} className={`viol${x.approved ? ' approved' : ''}`}>
          <span className={`sev ${x.approved ? 'ok' : x.severity === 'error' ? 'err' : 'warn'}`}>{x.approved ? 'Approved' : x.severity === 'error' ? 'Problem' : 'Note'}</span>
          <span className="msg">{tab ? <a href={sr6EditHref(ch.id, tab)}>{x.message}</a> : x.message} {x.page && <span className="cite">{x.source} p.{x.page}</span>}</span>
          {!career && <span className="row">
            {gm && x.severity === 'error' && !x.approved && <button className="btn small" onClick={() => setApproving(x)}>GM approve</button>}
            {gm && x.approved && <button className="btn small quiet" onClick={() => revoke(x)}>Revoke</button>}
          </span>}
          {o && <span className="note">GM: {o.note || 'approved'}</span>}
        </div>
      })}</div>

      <hr className="sep" />
      <h2>Derived values</h2>
      {dl([...(['bod', 'agi', 'rea', 'str', 'wil', 'log', 'int', 'cha', 'edg', 'mag', 'res'] as const)
        .filter(a => (a !== 'mag' && a !== 'res') || d.attrs[a].natural > 0)
        .map(a => [ATTR_NAMES[a], d.attrs[a].augmented !== d.attrs[a].natural ? `${d.attrs[a].natural} (${d.attrs[a].augmented})` : d.attrs[a].natural] as [string, string | number]),
        ['Essence', d.essence], ['Initiative', init(d.initiative)], ['Astral initiative', init(d.astralInit)],
        ['Physical monitor', d.monitors.physical], ['Stun monitor', d.monitors.stun], ['Overflow', d.monitors.overflow],
        ['Defense Rating', d.defenseRating], ['Social Rating', d.socialRating], ['Unarmed Attack Rating', d.attackRatings.unarmed], ['Composure', d.composure],
        ['Judge Intentions', d.judgeIntentions], ['Memory', d.memory], ['Lift/Carry', d.liftCarry], ['Drain', d.drain], ['Fading', d.fading],
        ['Karma left', career ? bal.karma : d.karmaLeft], ['Nuyen left', `${n(career ? bal.nuyen : d.nuyenLeft)}¥`],
        // an item's own values from its accessories (a cyberlimb's Strength): the item's, not the runner's
        ...d.hosts.map(h => [h.name, h.text] as [string, string])])}
      {d.unset.length > 0 && <p className="muted">A dash: a setting it needs isn’t set (Table setup → Creation rules).</p>}

      {err && <p className="banner err" role="alert">{err}</p>}
      {!ro && <><hr className="sep" />
      <h2>Finalize</h2>
      {!career ? <>
        <p>Finalizing is the last check of creation. It records the karma and nuyen left; the build is then read only.</p>
        <div><button className="btn primary" disabled={!ready} onClick={() => setAsking('finalize')}>Finalize runner</button>
          {!ready && <span className="muted"> Fix or approve the problems above first.</span>}</div>
      </> : <>
        <p>Finalized{ch.finalizedAt ? ` on ${ch.finalizedAt.slice(0, 10)}` : ''} with {n(ch.final?.karma ?? 0)} karma and {n(ch.final?.nuyen ?? 0)}¥ left.
          {' '}<a href={sr6EditHref(ch.id, 'ledger')}>The ledger</a> now holds {n(bal.karma)} karma and {n(bal.nuyen)}¥.
          {' '}<a href={sr6EditHref(ch.id, 'print')}>Print it</a> or export a copy.</p>
        <div><button className="btn" disabled={!drafting} onClick={() => setAsking('draft')}>Back to draft</button>
          {!drafting && <span className="muted"> Void the ledger’s earnings and spends first (newest first).</span>}</div>
      </>}</>}

      <Modal open={!!approving} onClose={() => setApproving(null)} title="GM approval"
        actions={<><button className="btn" onClick={() => setApproving(null)}>Cancel</button><button className="btn primary" disabled={!note.trim()} onClick={approve}>Approve</button></>}>
        <p>{approving?.message}</p>
        <label>Why the GM allows it<input autoFocus value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Street-legend campaign, agreed at session zero" /></label>
      </Modal>
      <Modal open={asking === 'finalize'} onClose={() => setAsking(null)} title={`Finalize ${name}?`}
        actions={<><button className="btn" onClick={() => setAsking(null)}>Not yet</button><button className="btn primary" onClick={finalize}>Finalize</button></>}>
        <p>The build becomes read only, with {n(budgets.karma.left)} karma and {n(budgets.nuyen.left)}¥ left. Back to draft undoes it.</p>
      </Modal>
      <Modal open={asking === 'draft'} onClose={() => setAsking(null)} title={`Put ${name} back to draft?`}
        actions={<><button className="btn" onClick={() => setAsking(null)}>Cancel</button><button className="btn primary" onClick={draft}>Back to draft</button></>}>
        <p>The build can be changed again and the creation checks apply. The ledger keeps its history; finalizing again starts its balances anew.</p>
      </Modal>
    </div>
  )
}
