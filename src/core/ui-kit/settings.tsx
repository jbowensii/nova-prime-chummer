// Per-browser display settings store: theme, texture level, print style, background art (docs/design-system.md). The dialog
// that edits them is SettingsDialog.tsx.

/** artStrength: the background picture's opacity in %, 0–100 (0 = no picture, 100 = the picture alone); the viewer's gauge, default 40 */
/** sheetArt / sheetArtPrint: the background art on the character sheet on screen / when printed; sheetArtStrength: its own
 *  strength (ui/sheetArt.tsx SHEET_ART_DEFAULT until set; 100 shows the image nearly whole) */
/** sr6SheetArt / sr6SheetArtPrint / sr6SheetArtStrength: the same three for Shadowrun 6's sheets, kept apart from Anarchy's
 *  (each game has its own art; print/shared.tsx useSheetArt) */
export interface Settings {
  /** system: light or dark as this device is set to (prefers-color-scheme); applySettings turns it into one of the two */
  theme: 'light' | 'dark' | 'system'
  texture: 'flat' | 'accents' | 'full'
  print: 'plain' | 'color' | 'book' | 'official' | 'neon' | 'hex' | 'dossier'
  art: 'on' | 'off'
  artStrength: number
  sheetArt: 'on' | 'off'
  sheetArtPrint: 'on' | 'off'
  sheetArtStrength?: number
  sr6SheetArt?: 'on' | 'off'
  sr6SheetArtPrint?: 'on' | 'off'
  sr6SheetArtStrength?: number
}
const KEY = 'ca2.settings.v1'
export const DEFAULTS: Settings = { theme: 'system', texture: 'accents', print: 'plain', art: 'on', artStrength: 40, sheetArt: 'on', sheetArtPrint: 'off' }

/** A whole percentage in 0–100; anything else is the default. Never above 100: that would pass the readability clamp. */
export const strength = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(100, Math.max(0, v))) : DEFAULTS.artStrength)

export function loadSettings(): Settings {
  try {
    const s = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
    return {
      ...s,
      artStrength: strength(s.artStrength),
      sheetArtStrength: s.sheetArtStrength === undefined ? undefined : strength(s.sheetArtStrength),
      sr6SheetArtStrength: s.sr6SheetArtStrength === undefined ? undefined : strength(s.sr6SheetArtStrength),
    }
  } catch {
    return DEFAULTS
  }
}

const DARK_QUERY = '(prefers-color-scheme: dark)'
/** The theme the CSS gets (data-theme is always light or dark): a saved light or dark stands; anything else follows the device. */
export function resolveTheme(t: unknown): 'light' | 'dark' {
  if (t === 'light' || t === 'dark') return t
  return typeof matchMedia === 'function' && matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}
let following = false

/** Set the data-* attributes the CSS keys off. Call before first render to avoid a flash. */
export function applySettings(s: Settings) {
  const el = document.documentElement
  el.dataset.theme = resolveTheme(s.theme)
  if (!following && typeof matchMedia === 'function') {
    following = true // the device switching light/dark while the page is open: follow it, if the saved choice is "Match my system"
    matchMedia(DARK_QUERY).addEventListener('change', () => applySettings(loadSettings()))
  }
  el.dataset.texture = s.texture
  el.dataset.print = s.print
  el.dataset.art = s.art
  el.style.setProperty('--art-strength', String(strength(s.artStrength) / 100)) // .bg-art's opacity
}

export function saveSettings(s: Settings) {
  applySettings(s)
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* settings just won't persist */
  }
}

/** The printed sheet's styles: here and on the print page's toolbar (print/shared.tsx SheetType). */
export const PRINT_STYLES: [Settings['print'], string, string][] = [
  ['plain', 'Printer-friendly', 'Book styling on white, no textures.'],
  ['color', 'Full color', 'Paper and paint, like a page from the PDF.'],
  ['book', 'Book style', 'Laid out like the rulebook’s example sheet.'],
  ['official', 'Official sheet', 'The two-column fillable sheet: yellow column, coffee-ring attributes.'],
]
/** Shadowrun 6's: the two paper styles, its own Book style (the official sheet's boxes), Neon (one dense page for play),
 *  Hex (one page, attributes and tracks as hexagons) and Dossier (rounded panels under magenta bars, up to two pages).
 *  Anarchy has none of the last three: its print page shows Printer-friendly for them (EditorView PrintSheet). */
export const SR6_PRINT_STYLES: typeof PRINT_STYLES = [
  ...PRINT_STYLES.slice(0, 2),
  ['book', 'Book style', 'Laid out like the official character sheet.'],
  ['neon', 'Neon', 'One dense page for play: dark ink, cyan and pink accents.'],
  ['hex', 'Hex', 'One page: attributes and damage tracks as hexagons, hatched titles.'],
  ['dossier', 'Dossier', 'Rounded panels under magenta title bars, up to two pages.'],
]
