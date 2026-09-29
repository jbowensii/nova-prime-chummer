// Ask the rules (server/books.mjs /api/ask): one question, one answer from the server's books, with its sources. A bar at the
// top of the builder and a campaign's runner list, and the header's "?" drawer on any page. Only shown when the server says
// an AI provider is set up. Nothing is kept: no history, no browser storage; asking again or closing clears the answer.
// The answer and sources are model output: rendered as plain text only (React text nodes), never HTML, markdown or links.
import { useEffect, useId, useState } from 'react'
import { because, sentence, UNREACHABLE, useMe } from './auth'
import { Modal } from './bits'

export const MAX_QUESTION = 500 // server/books.mjs MAX_QUESTION
export interface AskStatus { available: boolean; limit: number | null; used: number }
export interface Source { source: string; page: string; title: string }
export interface Answer { answer: string; sources: Source[]; covered: boolean; used: number; limit: number | null }

/** "CRB p.61 · QREF Base": each source's book, and its page (or the entry's title when there is no page). */
export const sourceLine = (sources: Source[]) =>
  [...new Set(sources.map(s => [s.source, s.page ? `p.${s.page}` : s.title].filter(Boolean).join(' ')).filter(Boolean))].join(' · ')

// the status is shared by every bar and drawer on the page: an answer's used/limit updates them all
let shared: AskStatus | null = null
const listeners = new Set<(s: AskStatus | null) => void>()
const publish = (s: AskStatus | null) => { shared = s; for (const f of listeners) f(s) }

/** GET /api/ask on mount (fresh per page), shared: null while loading and without a server or a sign-in (then nothing shows). */
function useAskStatus(): [AskStatus | null, (s: AskStatus) => void] {
  const me = useMe()
  const [status, setStatus] = useState<AskStatus | null>(shared)
  useEffect(() => {
    listeners.add(setStatus)
    return () => { listeners.delete(setStatus) }
  }, [])
  useEffect(() => {
    if (!me) return
    fetch('./api/ask', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(publish, () => {})
  }, [me])
  return [status, publish]
}

/** One question: POST /api/ask; the answer, or a message to show (a 429's own words: the daily limit, or busy). */
export async function askRules(question: string): Promise<Answer | { error: string }> {
  const r = await fetch('./api/ask', { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }) }).catch(() => null)
  if (!r) return { error: UNREACHABLE }
  if (r.ok) return r.json()
  const why = String((await r.json().catch(() => null))?.error ?? '')
  if (r.status === 429 && why) return { error: sentence(why) }
  return { error: because('Couldn’t ask the rules', why || `the server answered ${r.status}`) }
}

type State = { at: 'idle' } | { at: 'asking' } | { at: 'answer'; a: Answer } | { at: 'error'; msg: string }

function AskForm({ status, onStatus, drawer }: { status: AskStatus; onStatus: (s: AskStatus) => void; drawer?: boolean }) {
  const [q, setQ] = useState('')
  const [st, setSt] = useState<State>({ at: 'idle' })
  const id = useId()
  const go = async (e: React.FormEvent) => {
    e.preventDefault()
    const question = q.trim()
    if (!question || st.at === 'asking') return
    setSt({ at: 'asking' }) // the last answer goes
    const r = await askRules(question)
    if ('error' in r) return setSt({ at: 'error', msg: r.error })
    onStatus({ available: true, limit: r.limit, used: r.used })
    setSt({ at: 'answer', a: r })
  }
  const left = status.limit == null ? null : Math.max(0, status.limit - status.used)
  return (
    <div className={`ask${drawer ? ' in-drawer' : ''}`}>
      <form className="ask-row" onSubmit={e => void go(e)} role="search" aria-label="Ask the rules">
        <label htmlFor={id} className={drawer ? undefined : 'sr-only'}>Ask the rules</label>
        {/* autoComplete off: the browser keeps no list of past questions either */}
        <input id={id} type="text" value={q} onChange={e => setQ(e.target.value)} maxLength={MAX_QUESTION} autoComplete="off"
          placeholder="Ask the rules, e.g. how does armor work?" autoFocus={drawer} />
        <button className="btn primary" disabled={st.at === 'asking' || !q.trim()}>{st.at === 'asking' ? 'Asking…' : 'Ask'}</button>
      </form>
      <div aria-live="polite">
        {st.at === 'asking' && <p className="muted ask-note">Asking…</p>}
        {st.at === 'error' && <p className="err ask-note" role="alert">{st.msg}</p>}
        {st.at === 'answer' && <div className="ask-answer">
          <p className={st.a.covered ? undefined : 'muted'}>{st.a.answer}</p>
          {st.a.sources.length > 0 && <p className="src">Sources: {sourceLine(st.a.sources)}</p>}
          {!drawer && <button type="button" className="btn small quiet" onClick={() => setSt({ at: 'idle' })}>Clear</button>}
        </div>}
      </div>
      {left != null && <p className="muted ask-left">{left === 0 ? 'No questions left today.' : `${left} question${left === 1 ? '' : 's'} left today.`}</p>}
      {drawer && <p className="muted ask-left">Answers come from the books on this server, through the admin’s AI provider. Nothing you ask is saved.</p>}
    </div>
  )
}

/** The compact bar (builder, campaign page); nothing when Ask the rules isn't set up. */
export function AskRules() {
  const [status, setStatus] = useAskStatus()
  return status?.available ? <AskForm status={status} onStatus={setStatus} /> : null
}

/** The header's "?" button: the same form in a drawer (a modal dialog: focus stays in it, Esc closes, closing clears it). */
export function AskButton() {
  const [status, setStatus] = useAskStatus()
  const [open, setOpen] = useState(false)
  if (!status?.available) return null
  return (
    <>
      <button className="btn quiet ask-btn" aria-label="Ask the rules" title="Ask the rules" onClick={() => setOpen(true)}>?</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Ask the rules" className="drawer">
        <AskForm status={status} onStatus={setStatus} drawer />
      </Modal>
    </>
  )
}
