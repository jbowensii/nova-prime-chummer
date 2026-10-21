// Types and values both games share (architecture step 2); src/model/types.ts re-exports them for Anarchy.
export interface Override {
  code: string
  path: string
  note: string
}
/** Built-in portrait backdrops (src/ui/Portrait.tsx, app.css .bd-*); none = no backdrop, the look before 0.5.4 */
export const BACKDROPS = ['white', 'grey', 'dark', 'grid', 'halftone', 'neon', 'rain'] as const
export type Backdrop = (typeof BACKDROPS)[number]

export interface Identity {
  name: string
  streetName: string
  metatype: string
  portrait?: string
  /** the round token picture (Foundry etc.); absent: the portrait serves as the token */
  token?: string
  backdrop?: Backdrop
  lifestyle?: string
  /** optional, as the player writes it (both games) */
  gender?: string
  background: string
  notes: string
}

export type Severity = 'error' | 'warning'
/** hard: an error no GM can approve (SR6's negative Karma or nuyen: Finalize waits until it's fixed) */
export interface Violation {
  code: string
  severity: Severity
  path: string
  message: string
  source?: string
  page?: number
  approved?: boolean
  hard?: true
}

/** crypto.randomUUID only exists in secure contexts; plain-http LAN hosting needs a fallback. */
export const newId = (): string => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

/** One game's file format: its root tag (`rootAttr`), writer and reader. */
export interface Codec<T> {
  tag: string
  toXml(doc: T): string
  fromXml(xml: string): { ok: true; character: T } | { ok: false; reason: string }
}
