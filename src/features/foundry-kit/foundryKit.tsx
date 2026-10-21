// What both games' Foundry exports share: file names, the .json download, and the runner-picking export dialog.
import { useState } from 'react'
import { Modal } from '../../core/ui-kit/bits'
import { downloadFile } from '../../core/ui-kit/download'
import type { Campaign } from '../campaigns/campaignsStore'
import type { Character } from '../../ca2/formats/domain/types'

export const fileDate = (now: Date) => now.toLocaleDateString('en-CA') // local YYYY-MM-DD
/** A file name's lead: one runner or NPC's street name (else name) as a slug, so several downloads tell apart; several
 *  together are "runners-N". */
export const runnersStem = (chs: { identity: { name: string; streetName: string } }[]) => {
  const slug =
    chs.length === 1
      ? (chs[0].identity.streetName || chs[0].identity.name)
          .normalize('NFKD')
          .replace(/[^\w\s-]/g, '')
          .trim()
          .replace(/\s+/g, '-')
          .slice(0, 60)
      : ''
  return slug || (chs.length === 1 ? 'runner' : `runners-${chs.length}`)
}
/** Saves data as a .json download. */
export function downloadJson(name: string, data: unknown) {
  downloadFile(name, JSON.stringify(data, null, 1), 'application/json')
}
type Exportable = Pick<Character, 'id' | 'identity' | 'campaign'>
const label = (ch: Exportable) => ch.identity.streetName || ch.identity.name || 'Unnamed runner'

/** The runner list's dialog: tick runners (or a whole campaign), download one file. The NPC area's too (`noun` 'NPC'):
 *  the same runners file, each with its npc block. Either game: `download` writes the file, `about` names the importer. */
export function ExportRunnersDialog<R extends Exportable>({
  runners,
  campaigns,
  open,
  onClose,
  noun = 'runner',
  download,
  about = 'For the Nova Prime Chummer — Anarchy 2 Importer in Foundry VTT: upload the file there with Import from Chummer.',
}: {
  runners: R[]
  campaigns: Campaign[]
  open: boolean
  onClose: () => void
  noun?: 'runner' | 'NPC'
  download: (picked: R[]) => void
  about?: string
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [camp, setCamp] = useState('')
  // opening starts from nothing ticked (state adjusted while rendering: https://react.dev/learn/you-might-not-need-an-effect)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setPicked(new Set())
      setCamp('')
    }
  }
  const set = (ids: string[]) => {
    setPicked(new Set(ids))
    setCamp('')
  }
  const n = runners.filter(r => picked.has(r.id)).length
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Export ${noun}s for Foundry`}
      actions={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={!n}
            onClick={() => {
              download(runners.filter(r => picked.has(r.id)))
              onClose()
            }}
          >
            Download {n} {noun}
            {n === 1 ? '' : 's'}
          </button>
        </>
      }
    >
      <p className="muted">{about}</p>
      <p className="muted">The file includes the text of the {noun}s’ amps and gear. Share it only with people who own the books.</p>
      <div className="row">
        <button className="btn small quiet" onClick={() => set(runners.map(r => r.id))}>
          All
        </button>
        <button className="btn small quiet" onClick={() => set([])}>
          None
        </button>
        {campaigns.length > 0 && (
          <label>
            Tick a campaign
            <select
              value={camp}
              onChange={e => {
                setCamp(e.target.value)
                if (e.target.value) {
                  setPicked(new Set(runners.filter(r => r.campaign === e.target.value).map(r => r.id)))
                }
              }}
            >
              <option value="">Choose a campaign</option>
              {campaigns.map(x => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <ul className="stack" style={{ listStyle: 'none', padding: 0, maxHeight: '50vh', overflow: 'auto' }}>
        {runners.map(r => (
          <li key={r.id}>
            <label className="check">
              <input
                type="checkbox"
                checked={picked.has(r.id)}
                onChange={e => {
                  const s = new Set(picked)
                  if (e.target.checked) s.add(r.id)
                  else s.delete(r.id)
                  setPicked(s)
                }}
              />{' '}
              {label(r)}
            </label>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
