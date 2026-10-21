// Game data's page, one layout for both games (0.12.0): the catalog browser first (opening on the kind last looked at in
// this browser, else the game's main one: Amps, Qualities; the kinds down the left with their counts, the chosen kind's
// categories across the top, its entries; the book a filter: CatalogBrowser.tsx), then the sources and the Foundry export
// folded away (each opens with a click; the export also from its icon in row 1 of the header, beside the game switch, for
// those who may export), the catalog edits, the problems and what a game adds. Each game passes its own rows
// (src/ui/tabs/Data.tsx, src/sr6/ui/Data.tsx).
import { useEffect, type ReactNode } from 'react'
import { CatalogBrowser, type Book, type BrowseKind } from './CatalogBrowser'
import { STATE_TEXT } from '../../core/shared/ui'
import { FOUNDRY, PageHeader, showFoundry } from '../../core/chrome/nav'

export interface SourceRow {
  id: string
  name: string
  publisher: string
  status: ReactNode
  entries: number
  texts: ReactNode
  file?: string
  sha256?: string
  hash?: string
}
export interface EditRow {
  key: string
  name: string
  source: ReactNode
  kind: string
  state: keyof typeof STATE_TEXT
  action: ReactNode
}
export interface LoadError {
  file: string
  line?: number
  message: string
}

/** the last kind looked at on Game data, per game (`chummer.gamedata.kind.ca2`, `….sr6`): this browser only */
export const KIND_KEY = 'chummer.gamedata.kind'
export function GameDataPage({
  game,
  kinds,
  books,
  banner,
  sourcesIntro,
  sources,
  foundry,
  edits,
  errors,
  docs,
  children,
}: {
  /** classes: `sr6-browse`, `sr6-sources`, `sr6-edits` (Anarchy: `edits`); the Foundry link's address */
  game: 'ca2' | 'sr6'
  kinds: BrowseKind[]
  books: Book[]
  /** above the browser: an empty catalog's banner, a save message */
  banner?: ReactNode
  sourcesIntro: ReactNode
  sources: SourceRow[]
  /** the export panel (a section labelled "Export book data for Foundry"); absent: no export and no link */
  foundry?: ReactNode
  /** the catalog edits (editors): what goes above the table (how, Add buttons, the override files), then its rows */
  edits?: { intro: ReactNode; rows: EditRow[] }
  errors: LoadError[]
  /** the file format's pointer, last */
  docs: ReactNode
  /** after Problems: the game's own sections */
  children?: ReactNode
}) {
  const sr6 = game === 'sr6',
    href = `#/${sr6 ? 'sr6/' : ''}data/foundry`
  const atFoundry = /\/data\/foundry$/.test(location.hash)
  useEffect(() => {
    if (atFoundry) showFoundry()
  }, [atFoundry])
  const lines = errors.some(e => e.line != null)
  return (
    <main className="lib gamedata">
      <PageHeader title="Game data" />
      {foundry && (
        <p>
          <a className="btn" href={href} onClick={showFoundry}>
            Export to Foundry VTT
          </a>
        </p>
      )}
      {banner}
      <CatalogBrowser
        kinds={kinds}
        books={books}
        tableClass={sr6 ? 'sr6-browse' : undefined}
        main={sr6 ? 'qualities' : 'amps'}
        remember={`${KIND_KEY}.${game}`}
        ai={game}
      />

      <details className="fold">
        <summary>
          <h2>Sources</h2>{' '}
          <span className="muted">
            {sources.length} {sources.length === 1 ? 'book' : 'books'}
          </span>
        </summary>
        {sourcesIntro}
        <div className="scroll-x">
          <table className={`data${sr6 ? ' sr6-sources' : ''}`}>
            <thead>
              <tr>
                <th>Source</th>
                <th>Publisher</th>
                <th>Status</th>
                <th className="num">Entries</th>
                <th>Descriptions</th>
                <th>File</th>
                <th>Checksum (SHA-256)</th>
              </tr>
            </thead>
            <tbody>
              {sources.map(s => (
                <tr key={s.id}>
                  <td>
                    <b>{s.id}</b> {s.name}
                  </td>
                  <td>{s.publisher}</td>
                  <td>{s.status}</td>
                  <td className="num">{s.entries}</td>
                  <td>{s.texts}</td>
                  <td>{s.file}</td>
                  <td className="hash" title={s.sha256}>
                    {s.hash}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      {foundry && (
        <details className="fold" id={FOUNDRY}>
          <summary>
            <h2>Export book data for Foundry</h2>
          </summary>
          {foundry}
        </details>
      )}

      {edits && (
        <>
          <h2 style={{ marginTop: '1.5rem' }}>Your catalog edits</h2>
          {edits.intro}
          {edits.rows.length === 0 ? (
            <p className="muted">No edits yet.</p>
          ) : (
            <div className="scroll-x">
              <table className={`data ${sr6 ? 'sr6-edits' : 'edits'}`}>
                <thead>
                  <tr>
                    <th>Entry</th>
                    <th>Kind</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {edits.rows.map(r => (
                    <tr key={r.key}>
                      <td>
                        <b>{r.name}</b> {r.source}
                      </td>
                      <td>{r.kind}</td>
                      <td className={r.state === 'orphan' ? 'warn' : undefined}>{STATE_TEXT[r.state]}</td>
                      <td className="num">{r.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <h2 style={{ marginTop: '1.5rem' }}>Problems</h2>
      {errors.length === 0 ? (
        <p className="ok">Every file loaded cleanly.</p>
      ) : (
        <div className="scroll-x">
          <table className="data">
            <thead>
              <tr>
                <th>File</th>
                {lines && <th>Line</th>}
                <th>Problem</th>
              </tr>
            </thead>
            <tbody>
              {errors.map((e, i) => (
                <tr key={i}>
                  <td>{e.file}</td>
                  {lines && <td className="num">{e.line ?? ''}</td>}
                  <td className="err">{e.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {children}
      <p className="muted" style={{ marginTop: '1rem' }}>
        {docs}
      </p>
    </main>
  )
}
