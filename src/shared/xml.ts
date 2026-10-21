// XML text both games write (runner files, compendiums, catalog entries and edits): one escaper, so what XML 1.0 can't
// hold never makes a file unreadable; and the element writers and readers both games' runner files use.

/** What XML 1.0 can't hold (control characters pasted from a PDF, U+FFFE/FFFF, half a surrogate pair): dropped on
 *  write; a file that has them is refused on read, saying where, and "Try to repair" drops them. */
// eslint-disable-next-line no-control-regex
export const BAD_XML_CHAR = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g
// a carriage return would read back as a line feed: kept as a character reference
export const esc = (s: string) =>
  s.replace(BAD_XML_CHAR, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\r/g, '&#13;')
// in an attribute, tabs and line breaks would read back as spaces
export const escAttr = (s: string) => esc(s).replace(/\t/g, '&#9;').replace(/\n/g, '&#10;')

// ---- writing ----
export const attrs = (o: Record<string, unknown>) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null) // an empty value is kept: a draft's blank level or type reads back blank
    .map(([k, v]) => ` ${k}="${escAttr(String(v))}"`)
    .join('')
export const el = (name: string, a: Record<string, unknown>, children = '') =>
  children ? `<${name}${attrs(a)}>${children}</${name}>` : `<${name}${attrs(a)}/>`
// an empty element is left out: it reads back empty anyway
export const text = (name: string, s: string | undefined) => (s ? `<${name}>${esc(s)}</${name}>` : '')

// ---- reading ----
export const kids = (e: Element, name: string) => [...e.children].filter(c => c.localName === name)
export const kid = (e: Element, name: string) => kids(e, name)[0]

const unesc = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
/** An attribute of the file's root tag (<ca2:character>, or a codec's `tag`), read without parsing the file (it may not parse). */
export const rootAttr = (xml: string, name: string, root = 'ca2:character') => {
  const tag = xml.match(new RegExp(`<${root}\\b[^>]*>`))?.[0] ?? ''
  const v = [...tag.matchAll(/\s([\w:.-]+)="([^"]*)"/g)].find(m => m[1] === name)?.[2]
  return v === undefined ? undefined : unesc(v)
}

/** repair: read what can be read, noting here each thing dropped or fixed (the runner list's "Try to repair") */
export interface ReadOpts {
  repair?: string[]
}

const hex = (ch: string) => `U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`
/** Where the first character XML can't hold sits: line, column and the element it's in. */
export function badCharAt(xml: string): string | null {
  const re = new RegExp(BAD_XML_CHAR.source)
  const m = re.exec(xml)
  if (!m) return null
  const before = xml.slice(0, m.index),
    line = before.split('\n').length,
    col = m.index - before.lastIndexOf('\n')
  const open: string[] = []
  for (const [, close, name, self] of before.matchAll(/<(\/?)([\w:.-]+)[^<>]*?(\/?)>/g))
    if (close) open.pop()
    else if (!self) open.push(name)
  const inEl = open.at(-1)
  return `Line ${line}, column ${col}${inEl ? `, in <${inEl}>` : ''}: character ${hex(m[0])} isn’t allowed in XML.`
}

/** Reads one child element; a failure names what couldn't be read. In repair mode that element is dropped instead. */
export function each<T>(els: Element[], read: (e: Element) => T, label: (e: Element, i: number) => string, fix?: string[]): T[] {
  return els.flatMap((e, i) => {
    try {
      return [read(e)]
    } catch (err) {
      const what = `${label(e, i)}: ${(err as Error).message}`
      if (!fix) throw new Error(what)
      fix.push(`Dropped ${what}.`)
      return []
    }
  })
}
export const need = (e: Element | undefined, name: string, parent: string) => {
  if (!e) throw new Error(`no <${name}> inside <${parent}>`)
  return e
}

/** Parse a runner file: control characters refused saying where (repair: removed, and stray “&” escaped, each noted in
 *  `fix`). Shared by both games' readers. */
export function readDoc(xml: string, fix?: string[]): { ok: true; root: Element } | { ok: false; reason: string } {
  if (fix) {
    const bad = xml.match(BAD_XML_CHAR)
    if (bad) {
      xml = xml.replace(BAD_XML_CHAR, '')
      fix.push(`Removed ${bad.length} ${bad.length === 1 ? 'character' : 'characters'} XML can’t hold (${[...new Set(bad.map(hex))].join(', ')}).`)
    }
    const amp = /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);)/g
    const stray = xml.match(amp)
    if (stray) {
      xml = xml.replace(amp, '&amp;')
      fix.push(`Escaped ${stray.length} stray “&”.`)
    }
  } else {
    const where = badCharAt(xml)
    if (where) return { ok: false, reason: `Not valid XML. ${where}` }
  }
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  const perr = doc.getElementsByTagName('parsererror')[0]
  if (perr) {
    const detail = (perr.textContent ?? '')
      .replace(/^This page contains the following errors:/, '')
      .split(/\n|Below is a rendering/)[0]
      .trim()
    return { ok: false, reason: `Not valid XML${detail ? `: ${detail}` : '.'}` }
  }
  return { ok: true, root: doc.documentElement }
}
