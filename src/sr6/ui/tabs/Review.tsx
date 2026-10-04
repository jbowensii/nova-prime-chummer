// Review: every broken creation rule and note, with its page and a link to the tab where it's fixed. (Task 14 adds GM
// approval, the derived summary and Finalize.)
import { SR6_TABS } from '../EditorView'
import { sr6EditHref, useSr6Editor } from '../editor'

export function ReviewTab() {
  const { ch, v } = useSr6Editor()
  const sorted = [...v].sort((a, b) => Number(!!a.approved) - Number(!!b.approved) || (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1))
  const tabOf = (path: string) => SR6_TABS.find(([k]) => k === path.split('.')[0])?.[0]
  return (
    <div className="stack">
      <h2>Review</h2>
      <p className="muted">Rule problems block finalizing until they’re fixed. Notes never block.</p>
      {sorted.length === 0 && <p className="ok">No rule problems and nothing to note.</p>}
      <div>{sorted.map((x, i) => {
        const tab = tabOf(x.path)
        return <div key={i} className={`viol${x.approved ? ' approved' : ''}`}>
          <span className={`sev ${x.approved ? 'ok' : x.severity === 'error' ? 'err' : 'warn'}`}>{x.approved ? 'Approved' : x.severity === 'error' ? 'Problem' : 'Note'}</span>
          <span className="msg">{x.message} {x.page && <span className="cite">{x.source} p.{x.page}</span>}</span>
          <span className="row">{tab && !x.approved && <a className="btn small quiet" href={sr6EditHref(ch.id, tab)}>Fix</a>}</span>
        </div>
      })}</div>
    </div>
  )
}
