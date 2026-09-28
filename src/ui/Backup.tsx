// Settings → Backup (server only): download everything the server keeps as one zip, or replace it all from one.
// Restore is two steps: upload + check (a preview with a token), then apply; the page reloads after (server/books.mjs).
import { useEffect, useRef, useState } from 'react'
import { api, sendFile } from './Books'
import { useRepo } from './repo'

interface Manifest { app: string; created: string; keys: boolean; files: number; bytes: number; folders: Record<string, { files: number; bytes: number }> }
type Step = { at: 'idle' } | { at: 'uploading'; pct: number } | { at: 'preview'; token: string; m: Manifest } | { at: 'restoring' } | { at: 'done' }

const UNREACHABLE = 'the server can’t be reached'
const FOLDERS: [string, string][] = [['characters', 'Runners'], ['custom', 'House rules, edits and imported books'], ['library', 'Uploaded PDFs and AI settings']]
const size = (b: number) => b < 1024 ** 2 ? `${Math.max(1, Math.round(b / 1024))} KB` : b < 1024 ** 3 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${(b / 1024 ** 3).toFixed(2)} GB`
const files = (n: number) => `${n} ${n === 1 ? 'file' : 'files'}`
const plain = (why?: string) => !why ? 'Something went wrong. Try again.'
  : why === UNREACHABLE ? 'The server can’t be reached. Check it’s running, then try again.' : `${why[0].toUpperCase()}${why.slice(1).replace(/\.$/, '')}.`

export function BackupSettings() {
  const repo = useRepo()
  const [keys, setKeys] = useState(false)
  const [step, setStep] = useState<Step>({ at: 'idle' })
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null)
  const [zipping, setZipping] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null), headRef = useRef<HTMLHeadingElement>(null), prev = useRef(step.at)
  // the focused picker or button unmounts as the step changes: focus the preview's heading, or the picker again
  useEffect(() => {
    if (step.at === 'preview') headRef.current?.focus()
    else if (step.at === 'idle' && prev.current !== 'idle') fileRef.current?.focus()
    prev.current = step.at
  }, [step.at])
  if (repo.mode !== 'server') return null

  /** Two steps: the server makes the zip (its refusals and failures show here), then the browser fetches it by token
   *  as a plain download, straight to disk with the browser's own progress. */
  const download = async () => {
    setMsg(null)
    setZipping(true)
    try {
      const { token } = await api<{ token: string }>(`backup${keys ? '?keys=1' : ''}`, { method: 'POST' })
      const a = document.createElement('a')
      a.href = `./api/backup/${token}`
      a.download = '' // the server's name: chummer-anarchy2-backup-<date>.zip
      a.click()
      setMsg({ text: 'The backup is ready. Your browser is saving it; its downloads list shows the progress.' })
    } catch (e) { setMsg({ text: `Couldn’t make the backup. ${plain((e as Error).message)}`, err: true }) }
    setZipping(false)
  }

  const pick = async (file: File | undefined) => {
    if (!file) return
    setMsg(null)
    setStep({ at: 'uploading', pct: 0 })
    try {
      const r = JSON.parse(await sendFile('restore?preview=1', file, { 'Content-Type': 'application/zip' }, pct => setStep({ at: 'uploading', pct })))
      setStep({ at: 'preview', token: r.token, m: r.manifest })
    } catch (e) {
      setStep({ at: 'idle' })
      const why = (e as Error).message, status = (e as { status?: number }).status
      setMsg({ err: true, text: status === 413 ? 'This file is larger than 20 GB, the most a restore can take. Choose a backup made by this app.'
        : (status === 400 || status === 415) && why ? `This file can’t be restored: ${why.replace(/\.$/, '')}.` : plain(why) })
    }
  }

  const restore = async (token: string) => {
    setStep({ at: 'restoring' })
    try {
      await api(`restore/${token}`, { method: 'POST' })
      setStep({ at: 'done' })
      setTimeout(() => location.reload(), 1500) // the catalog, the runner list and any open runner all come from the server again
    } catch (e) {
      setStep({ at: 'idle' })
      const why = (e as Error).message // a lost connection doesn't stop the server's restore
      setMsg({ err: true, text: why === UNREACHABLE ? 'Lost contact with the server. The restore may still be running — reload in a minute to check.'
        : `The restore didn’t run: ${plain(why)}` })
    }
  }

  return (
    <fieldset className="backup">
      <legend>Backup</legend>
      <p className="muted">Everything this server keeps: runners, house rules and edits, imported books, uploaded PDFs and AI settings.</p>
      <div className="row">
        <button className="btn" disabled={zipping || step.at === 'restoring'} onClick={() => void download()}>Download backup</button>
        <label className="check inline"><input type="checkbox" checked={keys} aria-describedby={keys ? 'backup-keys-warning' : undefined}
          onChange={e => setKeys(e.target.checked)} />Include my API keys</label>
      </div>
      {keys && <p id="backup-keys-warning" className="err small">Anyone with the file can use your keys, and pay with them. Keep it private.</p>}
      {zipping && <p>Making the backup… a big library takes a while. <progress /></p>}

      {step.at === 'idle' && (
        <label className="btn file">Restore from backup…
          <input ref={fileRef} type="file" accept=".zip,application/zip" aria-label="Restore from backup" onChange={e => { void pick(e.target.files?.[0]); e.target.value = '' }} />
        </label>
      )}
      {step.at === 'uploading' && <p>Uploading the backup: {step.pct}% <progress max={100} value={step.pct} /></p>}
      {step.at === 'preview' && (
        <div className="restore-preview">
          <h3 ref={headRef} tabIndex={-1}>Restore this backup?</h3>
          <dl>
            {([['Made', new Date(step.m.created).toLocaleString()], ['App version', step.m.app],
              ...FOLDERS.filter(([f]) => step.m.folders[f]).map(([f, label]) => [label, files(step.m.folders[f].files) + (step.m.folders[f].bytes > 0 ? `, ${size(step.m.folders[f].bytes)}` : '')]),
              ['API keys', step.m.keys ? 'Included' : 'Not included (the server keeps its own, except for a provider whose address the backup changes)']] as [string, string][])
              .map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
          <p className="err">This replaces every runner, house rule, imported book and setting on the server with the backup’s.
            Anything changed since the backup was made is lost.</p>
          <p className="muted">The server’s current data is saved first as a safety backup in its Library (library/.backups; the newest 3 are kept).</p>
          <div className="row">
            <button className="btn" onClick={() => setStep({ at: 'idle' })}>Cancel</button>
            <button className="btn danger" onClick={() => void restore(step.token)}>Replace everything on the server</button>
          </div>
        </div>
      )}
      {step.at === 'restoring' && <p>Restoring. This can take a few minutes; keep this page open. <progress /></p>}
      <div role="status" aria-live="polite">
        {step.at === 'done' && <p className="banner">Restored. Reloading the app…</p>}
        {msg && !msg.err && <p className="banner">{msg.text}</p>}
      </div>
      <div role="alert">{msg?.err && <p className="banner err">{msg.text}</p>}</div>
    </fieldset>
  )
}
