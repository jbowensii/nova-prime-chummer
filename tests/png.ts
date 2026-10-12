// A generated PNG for the background-art and backdrop tests: no artwork is committed. `px(x, y)` -> [r, g, b] or [r, g, b, a].
import { crc32, deflateSync } from 'node:zlib'

export function makePng(w: number, h: number, px: (x: number, y: number) => number[]): Buffer {
  const n = px(0, 0).length // 3: RGB, 4: RGBA
  const chunk = (type: string, data: Buffer) => {
    const out = Buffer.alloc(12 + data.length),
      td = Buffer.concat([Buffer.from(type, 'latin1'), data])
    out.writeUInt32BE(data.length, 0)
    td.copy(out, 4)
    out.writeUInt32BE(crc32(td), 8 + data.length)
    return out
  }
  const raw = Buffer.alloc((w * n + 1) * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) Buffer.from(px(x, y)).copy(raw, y * (w * n + 1) + 1 + x * n)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = n === 4 ? 6 : 2 // 8-bit RGB or RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** A bold test pattern: diagonal stripes of rust, indigo and yellow, easy to spot faintly behind a page. */
export const stripes = (w = 240, h = 160) =>
  makePng(
    w,
    h,
    (x, y) =>
      [
        [196, 80, 40],
        [54, 48, 91],
        [241, 187, 0],
      ][Math.floor((x + y) / 20) % 3] as [number, number, number],
  )

/** A transparent square with an opaque rust disc in the middle: the corners show whatever is behind it. */
export const disc = (w = 120) => makePng(w, w, (x, y) => (Math.hypot(x - w / 2, y - w / 2) < w / 4 ? [196, 80, 40, 255] : [0, 0, 0, 0]))
