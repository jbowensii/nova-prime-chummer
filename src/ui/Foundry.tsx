// Export for the Foundry importer module (jbowensii/chummer-anarchy2-foundry): Chummer Anarchy export v1 files
// (docs/export-format.md). Runners from the editor and the runner list; book data on Game data (GMs).
import { useState } from 'react'
import { exportRunners, type ExportOpts } from '../engine'
import type { Catalog, Character } from '../model/types'
import { Modal } from './bits'
import type { Campaign } from './Campaigns'

export const exportOpts = (descriptions: boolean): ExportOpts => ({ descriptions, now: new Date().toISOString(), appVersion: __APP_VERSION__ })
export const runnersFileName = (now: Date) => `runners-${now.toISOString().slice(0, 10)}.ca2foundry.json`

/** Saves data as a .json download. */
export function downloadJson(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }))
  Object.assign(document.createElement('a'), { href: url, download: name }).click()
  URL.revokeObjectURL(url)
}
/** One or more runners as a runners file. Runner descriptions are the amps' own text, always included. */
export const downloadRunners = (c: Catalog, chs: Character[]) =>
  downloadJson(runnersFileName(new Date()), exportRunners(c, chs, exportOpts(true)))

const label = (ch: Character) => ch.identity.streetName || ch.identity.name || 'Unnamed runner'

/** The runner list's dialog: tick runners (or a whole campaign), download one file. */
export function ExportRunnersDialog({ c, runners, campaigns, open, onClose }: {
  c: Catalog; runners: Character[]; campaigns: Campaign[]; open: boolean; onClose: () => void
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [camp, setCamp] = useState('')
  const set = (ids: string[]) => setPicked(new Set(ids))
  const n = runners.filter(r => picked.has(r.id)).length
  return (
    <Modal open={open} onClose={onClose} title="Export runners for Foundry"
      actions={<><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!n} onClick={() => { downloadRunners(c, runners.filter(r => picked.has(r.id))); onClose() }}>
          Download {n} runner{n === 1 ? '' : 's'}</button></>}>
      <p className="muted">For the Chummer Anarchy 2.0 importer in Foundry VTT (sra2): upload the file there with Import from Chummer.</p>
      <div className="row">
        <button className="btn small quiet" onClick={() => set(runners.map(r => r.id))}>All</button>
        <button className="btn small quiet" onClick={() => set([])}>None</button>
        {campaigns.length > 0 && <label>Tick a campaign
          <select value={camp} onChange={e => { setCamp(e.target.value); if (e.target.value) set(runners.filter(r => r.campaign === e.target.value).map(r => r.id)) }}>
            <option value="">…</option>
            {campaigns.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select></label>}
      </div>
      <ul className="stack" style={{ listStyle: 'none', padding: 0, maxHeight: '50vh', overflow: 'auto' }}>
        {runners.map(r => <li key={r.id}><label className="check"><input type="checkbox" checked={picked.has(r.id)}
          onChange={e => { const s = new Set(picked); if (e.target.checked) s.add(r.id); else s.delete(r.id); setPicked(s) }} /> {label(r)}</label></li>)}
      </ul>
    </Modal>
  )
}
