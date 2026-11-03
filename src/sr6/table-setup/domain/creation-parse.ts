// SR6 creation rules: parsing creation.xml rows into rules (see creation.ts).
import { CREATION_NS, type CreationRules, type CreationType, type CreationValue } from './creation-types'
import { keyType } from './creation-keys'

export function typed(type: CreationType, raw: string): CreationValue | undefined {
  const s = raw.trim()
  if (type === 'bool') return s === 'true' ? true : s === 'false' ? false : undefined
  if (type === 'quality') return s || undefined
  if (type === 'letters') return /^[A-E]{5}$/.test(s.toUpperCase()) ? s.toUpperCase() : undefined
  return s && Number.isFinite(Number(s)) ? Number(s) : undefined
}

/** A setting as the server stores and sends it: every value a string. */
export interface CreationRow {
  key: string
  value: string
  source?: string
  page?: number | string
}

/** The rules from stored rows (a creation.xml's settings, or a campaign's own). A value that isn't of its key's type, or an
 *  unknown key, is an error and is skipped. */
export function rulesFrom(rows: CreationRow[]): { rules: CreationRules; errors: string[] } {
  const rules: CreationRules = new Map(),
    errors: string[] = []
  for (const { key, value: raw, source, page: p } of rows) {
    const type = keyType(key)
    if (!type) {
      errors.push(`“${key}” isn’t a creation setting.`)
      continue
    }
    const value = typed(type, raw)
    if (value === undefined) {
      errors.push(
        `${key}: “${raw}” isn’t ${type === 'bool' ? 'true or false' : type === 'number' ? 'a number' : type === 'letters' ? 'five priority letters (ABCDE)' : 'a quality id'}.`,
      )
      continue
    }
    const page = Number(p) || undefined
    rules.set(key, { key, value, ...(source ? { source } : {}), ...(page ? { page } : {}) })
  }
  return { rules, errors }
}

/** The rules in a creation.xml (see rulesFrom). */
export function parseCreation(xml: string): { rules: CreationRules; errors: string[] } {
  const doc = new DOMParser().parseFromString(xml, 'text/xml'),
    root = doc.documentElement
  if (doc.getElementsByTagName('parsererror').length || root.localName !== 'creation' || root.namespaceURI !== CREATION_NS)
    return { rules: new Map(), errors: ['The saved creation rules file isn’t a creation rules document.'] }
  return rulesFrom(
    [...root.children]
      .filter(e => e.localName === 'setting')
      .map(el => ({
        key: el.getAttribute('key') ?? '',
        value: el.getAttribute('value') ?? '',
        source: el.getAttribute('source') || undefined,
        page: el.getAttribute('page') ?? undefined,
      })),
  )
}
