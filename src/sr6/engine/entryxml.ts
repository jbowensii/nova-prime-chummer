// An SR6 catalog entry as XML and back: the element a data file, an edit, a compendium and a runner file's <snapshot> or
// <house> hold (docs/sr6-data-format.md).
import { esc, escAttr } from '../../core/shared/xml'
import { SR6_KINDS, type Sr6Entry, type Sr6Kind } from '../model/types'
import { formulaXml, readFormulasAndIssues } from '../../core/shared/formula'

export const SR6_NS = 'urn:chummer-sr6:data:1'
const OWN = new Set(['id', 'source', 'page'])
const OWN_KIDS = new Set(['name', 'text', 'formula', 'issue', 'found', 'alias', 'note']) // (<found>, <alias>, <note>: the importer's notes, not parts)

/** An element's own attributes; a prefixed or namespaced one (xmlns, xlink:…) is left out: sr6EntryXml writes no
 *  namespace declarations, so it wouldn't read back. */
const attrsOf = (el: Element, skip = new Set<string>()) =>
  Object.fromEntries([...el.attributes].filter(a => !skip.has(a.name) && !a.prefix && !a.namespaceURI).map(a => [a.name, a.value]))

/** One entry element as an Sr6Entry (also a runner file's <snapshot>, src/sr6/engine/charxml.ts). */
export function toEntry(el: Element, kind: Sr6Kind): Sr6Entry {
  const kids = [...el.children]
  const e: Sr6Entry = {
    id: el.getAttribute('id') ?? '',
    kind,
    name: kids.find(k => k.localName === 'name')?.textContent ?? '',
    source: el.getAttribute('source') ?? '',
    page: Number(el.getAttribute('page')) || 0,
    attrs: attrsOf(el, new Set([...OWN, 'by'])),
    parts: kids.filter(k => !OWN_KIDS.has(k.localName)).map(k => ({ tag: k.localName, attrs: attrsOf(k), text: k.textContent ?? '' })),
    text: kids.find(k => k.localName === 'text')?.textContent ?? '',
  }
  if (!e.id) throw new Error(`a <${el.localName}> has no id`)
  const { formulas, issues } = readFormulasAndIssues(el)
  if (formulas.length) e.formulas = formulas
  if (issues.length) e.issues = issues
  const aliases = kids.filter(k => k.localName === 'alias' && !k.getAttribute('id') && k.textContent).map(k => k.textContent!.trim())
  if (aliases.length) e.aliases = aliases
  const notes = kids.filter(k => k.localName === 'note').map(k => ({ field: k.getAttribute('field') ?? '', text: k.textContent ?? '' }))
  if (notes.length) e.notes = notes
  return e
}

// what XML 1.0 can't hold is dropped (a pasted description would make the whole file unreadable): shared/xml.ts
const attrList = (a: Record<string, string>) =>
  Object.entries(a)
    .map(([k, v]) => ` ${k}="${escAttr(v)}"`)
    .join('')

/** The entry element: id, source, page (none when it has none), its attributes, <name>, its parts as they are, its formulas (never its issues:
 * those are the book's), then <text>. For an edit body (PUT sr6/edits/<kind>/<id>) an empty <text/> (descriptions go in the edit's <description>); `withText`: the entry's own
 * text (a compendium's, src/sr6/engine/compendium.ts). */
export function sr6EntryXml(e: Sr6Entry, withText = false): string {
  const tag = SR6_KINDS[e.kind].tag
  const parts = e.parts.map(p => (p.text ? `<${p.tag}${attrList(p.attrs)}>${esc(p.text)}</${p.tag}>` : `<${p.tag}${attrList(p.attrs)}/>`)).join('')
  const text = withText && e.text ? `<text>${esc(e.text)}</text>` : '<text/>'
  return `<${tag}${attrList({ id: e.id, source: e.source, ...(e.page ? { page: String(e.page) } : {}), ...e.attrs })}><name>${esc(e.name)}</name>${parts}${formulaXml(e.formulas, escAttr)}${text}</${tag}>`
}
