// Ask the rules (server/books.mjs /api/ask, SR6's /api/sr6/ask): one question, one answer from the game's own books, with
// its sources. Each game has its own AI (its own settings, provider and books); `game` picks which is asked. A bar at the
// top of the builder and a campaign's runner list, the header's "?" drawer on any page, and the AI search on Rules and Game
// data (AskSearch: its sources are links to the entries). Only shown when the server says that game's AI is set up.
// Nothing is kept: no history, no browser storage; asking again or closing clears the answer.
// The answer and sources are model output: rendered as plain text only (React text nodes), never HTML or markdown. A
// search's links are made by its page from a source's kind and id, only for an entry its catalog holds.
import { IconButton } from './icons'
import { useEffect, useId, useState, type ReactNode } from 'react'
import { because, sentence, UNREACHABLE, useMe } from './auth'
import { Modal } from './bits'

export const MAX_QUESTION = 500 // server/books.mjs MAX_QUESTION
export type AskGame = 'ca2' | 'sr6'
export interface AskStatus {
  available: boolean
  limit: number | null
  used: number
}
/** kind and id: the entry's tag (rule, item, weapon…) and id; empty for a house rule */
export interface Source {
  source: string
  page: string
  title: string
  kind?: string
  id?: string
}
export interface Answer {
  answer: string
  sources: Source[]
  covered: boolean
  used: number
  limit: number | null
}

const api = (game: AskGame) => (game === 'sr6' ? './api/sr6/ask' : './api/ask')
/** each game's example question, in its own words */
const EXAMPLE: Record<AskGame, string> = { ca2: 'how does armor work?', sr6: 'how does Edge work?' }

/** "CRB p.61 · QREF Base": each source's book, and its page (or the entry's title when there is no page). */
export const sourceLine = (sources: Source[]) =>
  [...new Set(sources.map(s => [s.source, s.page ? `p.${s.page}` : s.title].filter(Boolean).join(' ')).filter(Boolean))].join(' · ')

// each game's status is shared by every bar, drawer and search on the page: an answer's used/limit updates them all
const shared: Record<AskGame, AskStatus | null> = { ca2: null, sr6: null }
const listeners = new Set<{ game: AskGame; set: (s: AskStatus | null) => void }>()
const publish = (game: AskGame, s: AskStatus | null) => {
  shared[game] = s
  for (const l of listeners) if (l.game === game) l.set(s)
}

/** GET the game's /api/ask on mount (fresh per page), shared: null while loading and without a server or a sign-in (then
 *  nothing shows). */
function useAskStatus(game: AskGame): [AskStatus | null, (s: AskStatus) => void] {
  const me = useMe()
  const [status, setStatus] = useState<AskStatus | null>(shared[game])
  useEffect(() => {
    const l = { game, set: setStatus }
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [game])
  useEffect(() => {
    if (!me) return
    fetch(api(game), { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(
        s => publish(game, s),
        () => {},
      )
  }, [me, game])
  return [status, s => publish(game, s)]
}

/** One question to the game's AI (scope "rules": the rules only); the answer, or a message to show (a 429's own words:
 *  the daily limit, or busy). */
export async function askRules(question: string, game: AskGame = 'ca2', scope?: 'rules'): Promise<Answer | { error: string }> {
  const r = await fetch(api(game), {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(scope ? { question, scope } : { question }),
  }).catch(() => null)
  if (!r) return { error: UNREACHABLE }
  if (r.ok) return r.json()
  const why = String((await r.json().catch(() => null))?.error ?? '')
  if (r.status === 429 && why) return { error: sentence(why) }
  return { error: because('Couldn’t ask the rules', why || `the server answered ${r.status}`) }
}

/** A page's AI search (Rules, Game data): its label, its example, its scope, and each source as a link (null: its title as text). */
export interface Search {
  label: string
  placeholder: string
  scope?: 'rules'
  link: (s: Source) => ReactNode
}

type State = { at: 'idle' } | { at: 'asking' } | { at: 'answer'; a: Answer } | { at: 'error'; msg: string }

function AskForm({
  game,
  status,
  onStatus,
  drawer,
  search,
}: {
  game: AskGame
  status: AskStatus
  onStatus: (s: AskStatus) => void
  drawer?: boolean
  search?: Search
}) {
  const [q, setQ] = useState('')
  const [st, setSt] = useState<State>({ at: 'idle' })
  const id = useId()
  const label = search?.label ?? 'Ask the rules'
  const go = async (e: React.FormEvent) => {
    e.preventDefault()
    const question = q.trim()
    if (!question || st.at === 'asking') return
    setSt({ at: 'asking' }) // the last answer goes
    const r = await askRules(question, game, search?.scope)
    if ('error' in r) return setSt({ at: 'error', msg: r.error })
    onStatus({ available: true, limit: r.limit, used: r.used })
    setSt({ at: 'answer', a: r })
  }
  const left = status.limit == null ? null : Math.max(0, status.limit - status.used)
  return (
    <div className={`ask${drawer ? ' in-drawer' : ''}${search ? ' ask-search' : ''}`}>
      <form className="ask-row" onSubmit={e => void go(e)} role="search" aria-label={label}>
        <label htmlFor={id} className={drawer ? undefined : 'sr-only'}>
          {label}
        </label>
        {/* autoComplete off: the browser keeps no list of past questions either */}
        <input
          id={id}
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          maxLength={MAX_QUESTION}
          autoComplete="off"
          placeholder={search?.placeholder ?? `Ask the rules, e.g. ${EXAMPLE[game]}`}
          autoFocus={drawer}
        />
        <button className="btn primary" disabled={st.at === 'asking' || !q.trim()}>
          {st.at === 'asking' ? 'Asking…' : search ? 'Search' : 'Ask'}
        </button>
      </form>
      <div aria-live="polite">
        {st.at === 'asking' && <p className="muted ask-note">Asking…</p>}
        {st.at === 'error' && (
          <p className="err ask-note" role="alert">
            {st.msg}
          </p>
        )}
        {st.at === 'answer' && (
          <div className="ask-answer">
            <p className={st.a.covered ? undefined : 'muted'}>{st.a.answer}</p>
            {st.a.sources.length > 0 &&
              (search ? (
                <ul className="ask-hits" aria-label="Found">
                  {st.a.sources.map((s, i) => (
                    <li key={i}>
                      {search.link(s) ?? s.title} <span className="src">{[s.source, s.page && `p.${s.page}`].filter(Boolean).join(' ')}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="src">Sources: {sourceLine(st.a.sources)}</p>
              ))}
            {!drawer && (
              <button type="button" className="btn small quiet" onClick={() => setSt({ at: 'idle' })}>
                Clear
              </button>
            )}
          </div>
        )}
      </div>
      {left != null && <p className="muted ask-left">{left === 0 ? 'No questions left today.' : `${left} question${left === 1 ? '' : 's'} left today.`}</p>}
      {drawer && <p className="muted ask-left">Answers come from the books on this server, through the admin’s AI provider. Nothing you ask is saved.</p>}
    </div>
  )
}

/** The compact bar (builder, campaign page); nothing when the game's Ask the rules isn't set up. */
export function AskRules({ game = 'ca2' }: { game?: AskGame }) {
  const [status, setStatus] = useAskStatus(game)
  return status?.available ? <AskForm game={game} status={status} onStatus={setStatus} /> : null
}

/** A page's AI search (Rules, Game data): a question in plain words, the answer, and its sources as links to the entries;
 *  nothing when the game's AI isn't set up. */
export function AskSearch({ game, ...search }: { game: AskGame } & Search) {
  const [status, setStatus] = useAskStatus(game)
  return status?.available ? <AskForm game={game} status={status} onStatus={setStatus} search={search} /> : null
}

/** The header's "?" button: the same form in a drawer (a modal dialog: focus stays in it, Esc closes, closing clears it). */
export function AskButton({ game = 'ca2' }: { game?: AskGame }) {
  const [status, setStatus] = useAskStatus(game)
  const [open, setOpen] = useState(false)
  if (!status?.available) return null
  return (
    <>
      <IconButton icon="ask" label="Ask the rules" onClick={() => setOpen(true)} />
      <Modal open={open} onClose={() => setOpen(false)} title="Ask the rules" className="drawer">
        <AskForm game={game} status={status} onStatus={setStatus} drawer />
      </Modal>
    </>
  )
}
