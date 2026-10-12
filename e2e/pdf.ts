// What a Chromium PDF shows per page, for the print specs (v083, sr6-builder): a page that holds next to nothing has few glyphs.
import { inflateSync, constants } from 'node:zlib'

/** The glyphs each page of a Chromium PDF shows, in page order (the hex strings its content streams draw). */
export function pageGlyphs(pdf: Buffer): number[] {
  const s = pdf.toString('latin1')
  const obj = (n: string) => {
    const i = s.search(new RegExp(`(^|\\s)${n} 0 obj\\b`))
    return i < 0 ? '' : s.slice(i, s.indexOf('endobj', i))
  }
  const refs = (x: string) => x.match(/\d+(?= 0 R)/g) ?? []
  const stream = (n: string) => {
    const at = s.search(new RegExp(`(^|\\s)${n} 0 obj\\b`)),
      a = s.indexOf('stream', at) + 6,
      b = s.indexOf('endstream', a)
    const raw = pdf.subarray(s[a] === '\r' ? a + 2 : a + 1, b)
    return /\/FlateDecode/.test(s.slice(at, a)) ? inflateSync(raw, { finishFlush: constants.Z_SYNC_FLUSH }).toString('latin1') : raw.toString('latin1')
  }
  const pages = (n: string): string[] => {
    const o = obj(n)
    return /\/Type\s*\/Pages\b/.test(o) ? refs(o.match(/\/Kids\s*\[([^\]]*)\]/)![1]).flatMap(pages) : [n]
  }
  const root = refs(s.match(/\/Root\s+\d+ 0 R/)![0])[0]
  return pages(refs(obj(root).match(/\/Pages\s+\d+ 0 R/)![0])[0]).map(p => {
    const c = obj(p).match(/\/Contents\s*(\[[^\]]*\]|\d+ 0 R)/)
    return (c ? refs(c[1]) : []).reduce(
      (n, r) =>
        n +
        (stream(r).match(/<([0-9A-Fa-f]+)>\s*Tj|\[[^\]]*\]\s*TJ/g) ?? []).reduce(
          (m, t) => m + (t.match(/<([0-9A-Fa-f]+)>/g) ?? []).reduce((k, h) => k + (h.length - 2) / 4, 0),
          0,
        ),
      0,
    )
  })
}
