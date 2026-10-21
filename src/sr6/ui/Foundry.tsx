// Export for the Nova Prime Chummer — SR6 Importer in Foundry VTT (jbowensii/chummer-sr6-foundry, system shadowrun6-eden): SR6
// export v1 files (docs/sr6-export-format.md). Runners and NPCs from their lists and editors (Anarchy's dialog), book data on
// Game data (GMs), a compendium from its page.
import { useState } from 'react'
import { NonCanon } from '../../ui/bits'
import { downloadJson, fileDate, runnersStem } from '../../ui/foundryKit'
import type { CreationRules } from '../engine/creation'
import type { Sr6Data } from '../engine/data'
import { exportSr6Books, exportSr6Compendium, exportSr6Runners, type Sr6ExportOpts } from '../engine/export'
import type { Sr6Character } from '../model/character'
import type { Sr6Catalog } from '../model/types'
import type { Sr6Compendium } from '../model/character'

/** ExportRunnersDialog's line for SR6 */
export const SR6_FOUNDRY_ABOUT = 'For the Nova Prime Chummer — SR6 Importer in Foundry VTT (shadowrun6-eden): upload the file there with Import from Chummer.'
export const sr6ExportOpts = (descriptions: boolean): Sr6ExportOpts => ({ descriptions, now: new Date().toISOString(), appVersion: __APP_VERSION__ })
export const sr6RunnersFileName = (now: Date, stem = 'runners') => `${stem}-${fileDate(now)}.sr6foundry.json`
export const sr6BooksFileName = (now: Date) => `books-${fileDate(now)}.sr6foundry.json`
export const sr6CompendiumFileName = (source: string, now: Date) => `compendium-${source}-${fileDate(now)}.sr6foundry.json`

/** One or more runners (or NPCs) as a runners file; their things' text always (the runner's own, as Anarchy's). */
export const downloadSr6Runners = (c: Sr6Catalog, data: Sr6Data, cr: CreationRules | ((ch: Sr6Character) => CreationRules), chs: Sr6Character[]) =>
  downloadJson(sr6RunnersFileName(new Date(), runnersStem(chs)), exportSr6Runners(c, data, cr, chs, sr6ExportOpts(true)))
/** A GM's compendium as a books file of one book marked compendium: its own text always, its NPCs. */
export const downloadSr6Compendium = (c: Sr6Catalog, data: Sr6Data, cr: CreationRules, comp: Sr6Compendium) =>
  downloadJson(sr6CompendiumFileName(comp.source, new Date()), exportSr6Compendium(c, data, cr, comp, sr6ExportOpts(true)))

/** Game data (admin and editors): tick SR6 books, choose descriptions, download. Compendiums export from their own page. */
export function Sr6ExportBooksPanel({ c, data }: { c: Sr6Catalog; data: Sr6Data }) {
  const all = [...c.sources.values()].filter(s => s.origin !== 'user')
  const [picked, setPicked] = useState<Set<string>>(() => new Set(all.map(s => s.id)))
  const [desc, setDesc] = useState(true)
  const [err, setErr] = useState('')
  const download = () => {
    setErr('')
    try {
      downloadJson(
        sr6BooksFileName(new Date()),
        exportSr6Books(
          c,
          data,
          all.filter(s => picked.has(s.id)).map(s => s.id),
          sr6ExportOpts(desc),
        ),
      )
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }
  return (
    <section aria-label="Export book data for Foundry" className="stack">
      {/* (its heading is the fold's, src/ui/GameData.tsx) */}
      <p className="muted">
        For the Nova Prime Chummer — SR6 Importer in Foundry VTT (shadowrun6-eden). The books go out as this app sees them, with your corrections. Compendiums
        export from their own page.
      </p>
      <div className="row">
        <button className="btn small quiet" onClick={() => setPicked(new Set(all.map(s => s.id)))}>
          All
        </button>
        <button className="btn small quiet" onClick={() => setPicked(new Set())}>
          None
        </button>
      </div>
      <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
        {all.map(s => (
          <li key={s.id}>
            <label className="check">
              <input
                type="checkbox"
                checked={picked.has(s.id)}
                onChange={e => {
                  const n = new Set(picked)
                  if (e.target.checked) n.add(s.id)
                  else n.delete(s.id)
                  setPicked(n)
                }}
              />
              <span>
                <b>{s.id}</b> {s.name} {s.canon ? <span className="muted">Canon</span> : <NonCanon />}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <label className="check">
        <input type="checkbox" checked={desc} onChange={e => setDesc(e.target.checked)} />
        <span>
          Include book descriptions <span className="muted">For your own Foundry only. Don’t share this file.</span>
        </span>
      </label>
      <div>
        <button className="btn primary" disabled={!picked.size} onClick={download}>
          Download book data
        </button>
      </div>
      {err && (
        <p className="err" role="alert">
          Couldn’t build the book data: {err}
        </p>
      )}
    </section>
  )
}
