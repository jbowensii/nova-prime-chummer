// "What's new": the newest section of the bundled CHANGELOG.md, shown once after the app version changes. Pure helpers; the
// dialog is WhatsNew.tsx. release-please writes headings like "## [0.45.0](url) (date)"; older ones are "## 0.36.0 — date".
const KEY = 'whatsNewSeen'

/** The first "## " section of a changelog (heading included), or '' if there is none. */
export function newestSection(md: string): string {
  const m = /^## .*$/m.exec(md)
  if (!m) return ''
  const rest = md.slice(m.index + m[0].length)
  const next = /^## /m.exec(rest)
  return md.slice(m.index, next ? m.index + m[0].length + next.index : undefined).trim()
}

/** True once per version: first run ever stays quiet (nothing to compare), an upgrade shows. Records the version. */
export function shouldShowOnce(version: string, store: Pick<Storage, 'getItem' | 'setItem'> = localStorage): boolean {
  try {
    const seen = store.getItem(KEY)
    if (seen === version) return false
    store.setItem(KEY, version)
    return seen !== null
  } catch {
    return false // storage blocked: never nag
  }
}
