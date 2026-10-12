// What the Books API's modules (server/books.mjs and the files it wires: jobs, library, resume, ai, edits, backup) share:
// XML text, request bodies, atomic writes and the error they throw. No state: each booksApi() call has its own.
import { randomBytes } from 'node:crypto'
import { open, readFile, rename, rm, writeFile } from 'node:fs/promises'

export const MAX_XML = 5 * 1024 * 1024
// library/backgrounds: the background art (server/backgrounds.mjs); library/sr6: the Shadowrun 6 area's books
export const BOOK_ID = /^(?!(backgrounds|sr6)$)[a-z0-9][a-z0-9-]{0,40}$/
export const SOURCE_ID = /^[A-Z][A-Z0-9-]{0,19}$/
export const CONFIG_NS = 'urn:chummer-anarchy2:config:1'

export const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
export const unesc = s =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
// eslint-disable-next-line no-control-regex
export const clean = s => s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/g, '')
export const attr = (tag, name) => {
  const v = tag?.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1]
  return v == null ? undefined : unesc(v)
}
/** The first <name …> tag, up to its first `>`. Found by a plain search: `<name\b[^>]*>` scanned to the end of the text
 *  from every later <name when the tag never closed (quadratic: a 5 MB request body held the server for minutes). */
export const rootTag = (xml, name) => {
  const m = typeof xml === 'string' ? new RegExp(`<${name}\\b`).exec(xml) : null
  const end = m ? xml.indexOf('>', m.index) : -1
  return end < 0 ? undefined : xml.slice(m.index, end + 1)
}
export const readOr = (path, fallback = null) => readFile(path, 'utf8').catch(() => fallback)
export const fail = (code, message) => Object.assign(new Error(message), { code })

/** The uploaded file name without any path, safe to show and pass as an argument. */
export function safeName(header) {
  let name = String(header || '')
  try {
    name = decodeURIComponent(name)
  } catch {
    /* keep as sent */
  }
  name = clean(name.split(/[\\/]/).pop())
    .replace(/[^\p{L}\p{N} ._()'&,+-]/gu, '_')
    .slice(-120)
    .replace(/^[\s.-]+/, '')
    .trim() // the dashes after the cut: never read as an option
  return name || 'book.pdf'
}

export async function writeAtomic(path, text, mode = 0o666) {
  const tmp = `${path}.${randomBytes(4).toString('hex')}.tmp`
  await writeFile(tmp, text, { encoding: 'utf8', flag: 'wx', mode })
  // Windows refuses to rename over a file another request is reading at that moment (a listing, not under the write
  // lock): try again for a moment. Elsewhere rename replaces it atomically and this never loops.
  for (let i = 0; ; i++) {
    try {
      return await rename(tmp, path)
    } catch (e) {
      if (i >= 20 || !['EPERM', 'EACCES', 'EBUSY'].includes(e.code) || process.platform !== 'win32') {
        await rm(tmp, { force: true })
        throw e
      }
      await new Promise(ok => setTimeout(ok, 10 * (i + 1)))
    }
  }
}

/** The first KB of a file (review.xml can be large; its root tag is all the list needs), or null. */
export async function head(path) {
  const fh = await open(path).catch(() => null)
  if (!fh) return null
  const buf = Buffer.alloc(1024)
  const { bytesRead } = await fh.read(buf, 0, 1024, 0).finally(() => fh.close())
  return buf.subarray(0, bytesRead).toString('utf8')
}

export async function body(req, max = MAX_XML) {
  const chunks = []
  let size = 0
  for await (const c of req) {
    if ((size += c.length) > max) throw fail(413, 'file too large')
    chunks.push(c)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/** One XML document from a client: no DTD (entity expansion), the expected root. */
export const xmlBody = (text, root) => {
  if (/<!DOCTYPE|<!ENTITY/i.test(text) || !new RegExp(`^\\s*(<\\?xml[^>]*\\?>\\s*)?(<!--[\\s\\S]*?-->\\s*)*<${root}[\\s>/]`).test(text))
    throw fail(400, `body is not a ${root} document`)
  return text
}

/** Named one-at-a-time chains: serial(name, fn) runs `fn` after that name's previous call (the request is counted by track()). */
export function serializer() {
  const chains = {}
  return (chain, fn) => {
    const run = (chains[chain] ?? Promise.resolve()).then(fn)
    chains[chain] = run.catch(() => {})
    return run
  }
}
