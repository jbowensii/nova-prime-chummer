// Per-browser display settings: theme, texture level, print style (docs/design-system.md), and on a server whether the
// background art shows; on a server, also AI settings (a link to the page under Books), Background art, Sign-in and Backup (admin).
import { IconButton } from './icons'
import { useState } from 'react'
import { isAdmin, useMe } from './auth'
import { BackupSettings } from './Backup'
import { BackgroundSettings } from './Background'
import { SignInSettings } from './SignInSettings'
import { Modal } from './bits'

/** artStrength: the background art's strength in %, 0–100 (100: app.css's own strengths, which keep text readable) */
/** sheetArt / sheetArtPrint: the background art on the character sheet on screen / when printed; sheetArtStrength: its own
 *  strength (print/shared.tsx SHEET_ART_DEFAULT until set; 100 shows the image nearly whole) */
/** sr6SheetArt / sr6SheetArtPrint / sr6SheetArtStrength: the same three for Shadowrun 6's sheets, kept apart from Anarchy's
 *  (each game has its own art; print/shared.tsx useSheetArt) */
export interface Settings { theme: 'light' | 'dark'; texture: 'flat' | 'accents' | 'full'; print: 'plain' | 'color' | 'book' | 'neon' | 'hex' | 'dossier'; art: 'on' | 'off'; artStrength: number
  sheetArt: 'on' | 'off'; sheetArtPrint: 'on' | 'off'; sheetArtStrength?: number
  sr6SheetArt?: 'on' | 'off'; sr6SheetArtPrint?: 'on' | 'off'; sr6SheetArtStrength?: number }
const KEY = 'ca2.settings.v1'
export const DEFAULTS: Settings = { theme: 'light', texture: 'accents', print: 'plain', art: 'on', artStrength: 100, sheetArt: 'on', sheetArtPrint: 'off' }

/** A whole percentage in 0–100; anything else is the default. Never above 100: that would pass the readability clamp. */
export const strength = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(100, Math.max(0, v))) : 100

export function loadSettings(): Settings {
  try { const s = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; return { ...s, artStrength: strength(s.artStrength), sheetArtStrength: s.sheetArtStrength === undefined ? undefined : strength(s.sheetArtStrength),
    sr6SheetArtStrength: s.sr6SheetArtStrength === undefined ? undefined : strength(s.sr6SheetArtStrength) } } catch { return DEFAULTS }
}

/** Set the data-* attributes the CSS keys off. Call before first render to avoid a flash. */
export function applySettings(s: Settings) {
  const el = document.documentElement
  el.dataset.theme = s.theme
  el.dataset.texture = s.texture
  el.dataset.print = s.print
  el.dataset.art = s.art
  el.style.setProperty('--art-strength', String(strength(s.artStrength) / 100)) // .bg-art's opacity
}

export function saveSettings(s: Settings) {
  applySettings(s)
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* settings just won't persist */ }
}

/** The printed sheet's styles: here and on the print page's toolbar (print/shared.tsx SheetType). */
export const PRINT_STYLES: [Settings['print'], string, string][] = [['plain', 'Printer-friendly', 'Book styling on white, no textures.'], ['color', 'Full color', 'Paper and paint, like a page from the PDF.'], ['book', 'Book style', 'Laid out like the rulebook’s example sheet.']]
/** Shadowrun 6's: the two paper styles, its own Book style (the official sheet's boxes), Neon (one dense page for play),
 *  Hex (one page, attributes and tracks as hexagons) and Dossier (rounded panels under magenta bars, up to two pages).
 *  Anarchy has none of the last three: its print page shows Printer-friendly for them (EditorView PrintSheet). */
export const SR6_PRINT_STYLES: typeof PRINT_STYLES = [...PRINT_STYLES.slice(0, 2), ['book', 'Book style', 'Laid out like the official character sheet.'],
  ['neon', 'Neon', 'One dense page for play: dark ink, cyan and pink accents.'],
  ['hex', 'Hex', 'One page: attributes and damage tracks as hexagons, hatched titles.'],
  ['dossier', 'Dossier', 'Rounded panels under magenta title bars, up to two pages.']]

const GROUPS: { key: keyof Settings; label: string; options: [string, string, string][] }[] = [
  { key: 'theme', label: 'Theme', options: [['light', 'Book (light)', 'The printed page: paper, ink, rust and yellow.'], ['dark', 'Indigo (dark)', 'The book’s sidebar colors as a dark page.']] },
  { key: 'texture', label: 'Texture', options: [['flat', 'Flat', 'Colors and fonts only.'], ['accents', 'Accents', 'Paper grain, paint stroke, halftone panels.'], ['full', 'Full book', 'Adds graffiti tabs, a chapter tab and painted panel edges.']] },
  { key: 'print', label: 'Printed sheet', options: PRINT_STYLES },
  { key: 'art', label: 'Background', options: [['on', 'Show background art', 'The admin’s images, faint behind every page.'], ['off', 'Plain page', 'No background art in this browser.']] },
]

export function SettingsButton() {
  const [open, setOpen] = useState(false)
  const [s, setS] = useState(loadSettings)
  const me = useMe(), admin = isAdmin(me), sr6 = /^#\/sr6(\/|$)/.test(location.hash)
  const set = (k: keyof Settings, v: string | number) => { const next = { ...loadSettings(), [k]: v } as Settings; // fresh: the sheet saves its own settings too
    setS(next); saveSettings(next) }
  return (
    <>
      <IconButton icon="settings" label="Settings" onClick={() => { setS(loadSettings()); setOpen(true) /* fresh: the print page sets the sheet type too */ }} />
      <Modal open={open} onClose={() => setOpen(false)} title="Settings">
        <div className="settings">
          {GROUPS.filter(g => g.key !== 'art' || me).map(g => g.key === 'print' && sr6 ? { ...g, options: SR6_PRINT_STYLES } : g).map(g => ( /* background art: a server's */
            <fieldset key={g.key}>
              <legend>{g.label}</legend>
              <div className="choices">
                {g.options.map(([value, label, hint]) => (
                  <label key={value} title={hint}>
                    <input type="radio" name={g.key} value={value} checked={(g.key === 'print' && !g.options.some(([v]) => v === s.print) ? 'plain' : s[g.key]) === value} onChange={() => set(g.key, value)} />
                    {label}
                  </label>
                ))}
              </div>
              {g.key === 'art' && <label className="art-strength">Strength
                <input type="range" min={0} max={100} step={5} value={s.artStrength} disabled={s.art === 'off'} aria-valuetext={`${s.artStrength}%`}
                  onChange={e => set('artStrength', Number(e.target.value))} />
                <output>{s.artStrength}%</output>
              </label>}
            </fieldset>
          ))}
          <p className="muted">Saved in this browser only.</p>
          {/* not isAdmin(): that is true without a server, where AI settings can't work */}
          {me?.role === 'admin' && <fieldset><legend>AI settings</legend>
            <p className="muted">The AI provider and keys the importer uses for books its recipes can’t read.</p>
            <a className="btn" href="#/books/ai" onClick={() => setOpen(false)}>Open AI settings</a></fieldset>}
          {/* the gallery of the game this page is in (#/sr6…: Shadowrun 6's own set) */}
          {me?.role === 'admin' && <BackgroundSettings game={sr6 ? 'sr6' : 'ca2'} />}
          {admin && <SignInSettings />}
          {admin && <BackupSettings />}
        </div>
      </Modal>
    </>
  )
}
