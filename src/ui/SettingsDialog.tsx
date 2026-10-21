// The settings dialog: theme, texture level, print style, background art; for the admin also AI settings (a link to the page
// under Books), Background art, Sign-in and Backup. It composes feature panels, so it lives in the app shell; App.tsx hands it
// to the header (nav.tsx HeaderBarsContext). The per-browser store is settings.tsx.
import { useState } from 'react'
import { isAdmin, useMe } from './auth'
import { BackupSettings } from './Backup'
import { BackgroundSettings } from './Background'
import { Modal } from './bits'
import { IconButton } from './icons'
import { SignInSettings } from './SignInSettings'
import { loadSettings, PRINT_STYLES, saveSettings, SR6_PRINT_STYLES, type Settings } from './settings'

const GROUPS: { key: keyof Settings; label: string; options: [string, string, string][] }[] = [
  {
    key: 'theme',
    label: 'Theme',
    options: [
      ['system', 'Match my system', 'Light or dark, whichever this device is set to.'],
      ['light', 'Book (light)', 'The printed page: paper, ink, rust and yellow.'],
      ['dark', 'Indigo (dark)', 'The book’s sidebar colors as a dark page.'],
    ],
  },
  {
    key: 'texture',
    label: 'Texture',
    options: [
      ['flat', 'Flat', 'Colors and fonts only.'],
      ['accents', 'Accents', 'Paper grain, paint stroke, halftone panels.'],
      ['full', 'Full book', 'Adds graffiti tabs, a chapter tab and painted panel edges.'],
    ],
  },
  { key: 'print', label: 'Printed sheet', options: PRINT_STYLES },
  {
    key: 'art',
    label: 'Background',
    options: [
      ['on', 'Show background art', 'The admin’s images, faint behind every page.'],
      ['off', 'Plain page', 'No background art in this browser.'],
    ],
  },
]

export function SettingsButton() {
  const [open, setOpen] = useState(false)
  const [s, setS] = useState(loadSettings)
  const me = useMe(),
    admin = isAdmin(me),
    sr6 = /^#\/sr6(\/|$)/.test(location.hash)
  const set = (k: keyof Settings, v: string | number) => {
    const next = { ...loadSettings(), [k]: v } as Settings // fresh: the sheet saves its own settings too
    setS(next)
    saveSettings(next)
  }
  return (
    <>
      <IconButton
        icon="settings"
        label="Settings"
        onClick={() => {
          setS(loadSettings())
          setOpen(true) /* fresh: the print page sets the sheet type too */
        }}
      />
      <Modal open={open} onClose={() => setOpen(false)} title="Settings">
        <div className="settings">
          {GROUPS.filter(g => g.key !== 'art' || me)
            .map(g => (g.key === 'print' && sr6 ? { ...g, options: SR6_PRINT_STYLES } : g))
            .map(g => (
              /* background art: a server's */
              <fieldset key={g.key}>
                <legend>{g.label}</legend>
                <div className="choices">
                  {g.options.map(([value, label, hint]) => (
                    <label key={value} title={hint}>
                      <input
                        type="radio"
                        name={g.key}
                        value={value}
                        checked={(g.key === 'print' && !g.options.some(([v]) => v === s.print) ? 'plain' : s[g.key]) === value}
                        onChange={() => set(g.key, value)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
                {g.key === 'art' && (
                  <label className="art-strength">
                    Strength
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={s.artStrength}
                      disabled={s.art === 'off'}
                      aria-valuetext={`${s.artStrength}%`}
                      onChange={e => set('artStrength', Number(e.target.value))}
                    />
                    <output>{s.artStrength}%</output>
                  </label>
                )}
              </fieldset>
            ))}
          <p className="muted">Saved in this browser only.</p>
          {/* not isAdmin(): that is true without a server, where AI settings can't work */}
          {me?.role === 'admin' && (
            <fieldset>
              <legend>AI settings</legend>
              <p className="muted">The AI provider and keys the importer uses for books its recipes can’t read.</p>
              <a className="btn" href="#/books/ai" onClick={() => setOpen(false)}>
                Open AI settings
              </a>
            </fieldset>
          )}
          {/* the gallery of the game this page is in (#/sr6…: Shadowrun 6's own set) */}
          {me?.role === 'admin' && <BackgroundSettings game={sr6 ? 'sr6' : 'ca2'} />}
          {admin && <SignInSettings />}
          {admin && <BackupSettings />}
        </div>
      </Modal>
    </>
  )
}
