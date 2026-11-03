// Shadowrun 6 runner XML: the constants and the situational-switch text both the writer and the readers use (see charxml.ts).
import { type Sr6Situational, MAGIC_KIND_LABELS, type MagicKind } from './character'
import { SR6_MIGRATIONS } from './migrations'

export const SR6_CHAR_NS = 'urn:chummer-sr6:character:1'
export const FORMAT_VERSION = 1 + SR6_MIGRATIONS.length
export const MAGIC_KINDS = Object.keys(MAGIC_KIND_LABELS) as MagicKind[]

/** A line's situational switches as `key:times` words (the key url-encoded; a plain 1:1 4:3 is a save keyed by place), read back by readSit. */
export const sitText = (x?: Sr6Situational) => {
  const w = Object.entries(x ?? {})
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${encodeURIComponent(k)}:${n}`)
  return w.length ? w.join(' ') : undefined
}
