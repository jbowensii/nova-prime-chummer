// Per-browser display settings: theme, texture level, print style (docs/design-system.md); on a server, also AI settings (a
// link to the page under Books), Sign-in and Backup (admin).
import { useState } from 'react'
import { isAdmin, useMe } from './auth'
import { BackupSettings } from './Backup'
import { SignInSettings } from './SignInSettings'
import { Modal } from './bits'

export interface Settings { theme: 'light' | 'dark'; texture: 'flat' | 'accents' | 'full'; print: 'plain' | 'color' }
const KEY = 'ca2.settings.v1'
export const DEFAULTS: Settings = { theme: 'light', texture: 'accents', print: 'plain' }

export function loadSettings(): Settings {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } } catch { return DEFAULTS }
}

/** Set the data-* attributes the CSS keys off. Call before first render to avoid a flash. */
export function applySettings(s: Settings) {
  const el = document.documentElement
  el.dataset.theme = s.theme
  el.dataset.texture = s.texture
  el.dataset.print = s.print
}

function saveSettings(s: Settings) {
  applySettings(s)
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* settings just won't persist */ }
}

const GROUPS: { key: keyof Settings; label: string; options: [string, string, string][] }[] = [
  { key: 'theme', label: 'Theme', options: [['light', 'Book (light)', 'The printed page: paper, ink, rust and yellow.'], ['dark', 'Indigo (dark)', 'The book’s sidebar colors as a dark page.']] },
  { key: 'texture', label: 'Texture', options: [['flat', 'Flat', 'Colors and fonts only.'], ['accents', 'Accents', 'Paper grain, paint stroke, halftone panels.'], ['full', 'Full book', 'Adds graffiti tabs, a chapter tab and painted panel edges.']] },
  { key: 'print', label: 'Printed sheet', options: [['plain', 'Printer-friendly', 'Book styling on white, no textures.'], ['color', 'Full color', 'Paper and paint, like a page from the PDF.']] },
]

export function SettingsButton() {
  const [open, setOpen] = useState(false)
  const [s, setS] = useState(loadSettings)
  const me = useMe(), admin = isAdmin(me)
  const set = (k: keyof Settings, v: string) => { const next = { ...s, [k]: v } as Settings; setS(next); saveSettings(next) }
  return (
    <>
      <button className="btn quiet" onClick={() => setOpen(true)}>Settings</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Settings">
        <div className="settings">
          {GROUPS.map(g => (
            <fieldset key={g.key}>
              <legend>{g.label}</legend>
              <div className="choices">
                {g.options.map(([value, label, hint]) => (
                  <label key={value} title={hint}>
                    <input type="radio" name={g.key} value={value} checked={s[g.key] === value} onChange={() => set(g.key, value)} />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <p className="muted">Saved in this browser only.</p>
          {me?.role === 'admin' && <fieldset><legend>AI settings</legend>
            <p className="muted">The AI provider and keys the importer uses for books its recipes can’t read.</p>
            <a className="btn" href="#/books/ai" onClick={() => setOpen(false)}>Open AI settings</a></fieldset>}
          {admin && <SignInSettings />}
          {admin && <BackupSettings />}
        </div>
      </Modal>
    </>
  )
}
