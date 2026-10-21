// Export for the Foundry importer module (jbowensii/chummer-anarchy2-foundry): Anarchy 2.0 export v1 files
// (docs/export-format.md). Runners from the editor and the runner list; book data on Game data (GMs).
import { useState } from 'react'
import { exportBooks, exportRunners, type ExportOpts } from '../domain/export'
import type { Catalog, Character, Compendium } from '../../formats/domain/types'
import { NonCanon } from '../../../core/ui-kit/bits'
import { downloadJson, fileDate, runnersStem } from '../../../features/foundry-kit/foundryKit'
import { loadTableRules, tableRulesForExport } from '../../table-rules/ui/TableRules'
import { bookNpcs, bookSamples, readSample } from '../../runner-builder/ui/samples'

export const exportOpts = (descriptions: boolean): ExportOpts => ({ descriptions, now: new Date().toISOString(), appVersion: __APP_VERSION__ })
export const runnersFileName = (now: Date, stem = 'runners') => `${stem}-${fileDate(now)}.ca2foundry.json`
export const booksFileName = (now: Date) => `books-${fileDate(now)}.ca2foundry.json`

/** One or more runners as a runners file. Runner descriptions are the amps' own text, always included. */
export const downloadRunners = (c: Catalog, chs: Character[]) =>
  downloadJson(runnersFileName(new Date(), runnersStem(chs)), exportRunners(c, chs, exportOpts(true)))

/** A GM's compendium as a books file of one book (marked compendium): its own text always, its NPCs, no table rules. */
export const downloadCompendium = (c: Catalog, comp: Compendium) =>
  downloadJson(
    `compendium-${comp.source}-${fileDate(new Date())}.ca2foundry.json`,
    exportBooks(c, [comp.source], [], exportOpts(true), {}, { [comp.source]: comp.npcs }),
  )

/** Game data (admin and editors): tick books, choose descriptions, download. */
export function ExportBooksPanel({ c }: { c: Catalog }) {
  const all = [...c.sources.values()]
  const [picked, setPicked] = useState<Set<string>>(() => new Set(all.map(s => s.id)))
  const [desc, setDesc] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [skipped, setSkipped] = useState<string[]>([])
  const download = async () => {
    setBusy(true)
    setErr('')
    setSkipped([])
    try {
      const rules = tableRulesForExport(c, await loadTableRules({ strict: true }))
      const ids = all.filter(s => picked.has(s.id)).map(s => s.id)
      // the ticked books' own sample characters and NPCs (source matched case-insensitively); one that can't be read is
      // left out and named
      const byLower = new Map(ids.map(id => [id.toLowerCase(), id])),
        bad: string[] = []
      const read = async (rows: { url: string; name: string; source?: string }[]) => {
        const out: Record<string, Character[]> = {}
        for (const s of rows) {
          const id = byLower.get((s.source ?? '').toLowerCase())
          if (!id) continue
          const r = await readSample(s.url)
          if (r.ok) (out[id] ??= []).push(r.character)
          else bad.push(`${s.name || s.url.split('/').pop()} (${id}): ${r.reason}`)
        }
        return out
      }
      const characters = await read(await bookSamples(() => undefined)),
        npcs = await read(await bookNpcs())
      downloadJson(booksFileName(new Date()), exportBooks(c, ids, rules, exportOpts(desc), characters, npcs))
      setSkipped(bad)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section aria-label="Export book data for Foundry" className="stack">
      {/* (its heading is the fold's, GameData.tsx) */}
      <p className="muted">
        For the Nova Prime Chummer — Anarchy 2 Importer in Foundry VTT. The books go out as this app sees them, with your corrections, house rules and the table
        rules switched on.
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
        <button className="btn primary" disabled={!picked.size || busy} onClick={() => void download()}>
          Download book data
        </button>
      </div>
      {err && (
        <p className="err" role="alert">
          Couldn’t build the book data: {err}
        </p>
      )}
      {skipped.length > 0 && (
        <div role="status">
          <p>Downloaded without these sample characters and NPCs:</p>
          <ul>
            {skipped.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
