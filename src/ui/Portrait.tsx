// A runner's portrait over its backdrop (app.css .bd-*): transparent parts of a PNG/WebP show the backdrop, an opaque
// image covers it. No backdrop = the look before backdrops existed. The print sheet swaps a dark one for white (ink).
import { useState } from 'react'
import { BACKDROPS, type Backdrop, type Character } from '../model/types'

export const BACKDROP_NAMES: Record<Backdrop, string> = {
  white: 'White', grey: 'Neutral grey', dark: 'Dark', grid: 'Grid', halftone: 'Halftone', neon: 'Neon', rain: 'Rain',
}
const DARK: Backdrop[] = ['dark', 'neon', 'rain']
export { BACKDROPS }

/** The backdrop the print sheet uses: the runner's, or white instead of a dark one. */
export const printBackdrop = (b?: Backdrop) => (b && DARK.includes(b) ? 'white' : b)
export const bdClass = (b?: Backdrop) => (b ? ` bd-${b}` : '')

/** The first letter of a name (a whole emoji, not half of one); "?" for none. */
export const initial = (ch: Character) => [...(ch.identity.streetName || ch.identity.name).trim()][0]?.toUpperCase() ?? '?'

/** The portrait (class `face` + backdrop), or the runner's initial when there's none or it doesn't load. */
export function Face({ ch, backdrop = ch.identity.backdrop }: { ch: Character; backdrop?: Backdrop }) {
  const [broken, setBroken] = useState<string>()
  const src = ch.identity.portrait
  return src && broken !== src ? <img className={`face${bdClass(backdrop)}`} src={src} alt="" onError={() => setBroken(src)} />
    : <span className="face" aria-hidden>{initial(ch)}</span>
}
