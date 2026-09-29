// @vitest-environment node
// The background art can't hurt reading: with the overlay strengths and the art's contrast filter in app.css, the worst
// image (black in light mode, white in dark mode) still leaves the text tokens their contrast on the page color.
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

const css = readFileSync('src/ui/app.css', 'utf8')
const art = css.slice(css.indexOf('/* ---- background art'))
const block = (sel: string) => css.match(new RegExp(`${sel.replace(/[[\]()]/g, '\\$&')} \\{([^}]*)\\}`))![1]
const token = (b: string, name: string, light?: string): string => {
  const v = b.match(new RegExp(`--${name}: ([^;]+);`))?.[1].trim() ?? light!
  const ref = v.match(/^var\(--([\w-]+)\)$/)?.[1]
  return ref ? token(b, ref, light ? token(block(':root'), ref) : undefined) : v
}
const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
const lum = (c: number[]) => {
  const [r, g, b] = c.map(v => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

test('text keeps its contrast over the worst background art, light and dark', () => {
  const cover = Math.min(...[...art.matchAll(/var\(--bg\) (\d+)%/g)].map(m => Number(m[1]) / 100)) // the strongest the art gets
  const k = Number(art.match(/filter: contrast\(([\d.]+)\)/)![1])
  expect(cover).toBeGreaterThanOrEqual(0.8)
  const light = block(':root'), dark = block(":root[data-theme='dark']")
  for (const [theme, b, worst] of [['light', light, 0], ['dark', dark, 255]] as const) {
    const t = (n: string) => rgb(token(b, n, theme === 'dark' ? token(light, n) : undefined))
    const artPx = (worst / 255 - 0.5) * k + 0.5 // CSS contrast(): the image's darkest (light) or brightest (dark) pixel
    const bg = t('bg').map(v => v * cover + artPx * 255 * (1 - cover))
    for (const [name, min] of [['text', 7], ['text-2', 7], ['text-3', 4.5], ['heading', 4.5]] as const)
      expect(ratio(t(name), bg), `${theme} --${name}`).toBeGreaterThanOrEqual(min)
  }
})

test('never printed, and hidden when asked', () => {
  expect(art).toMatch(/@media print \{ \.bg-art \{ display: none/)
  expect(art).toMatch(/prefers-reduced-transparency: reduce\) \{ \.bg-art \{ display: none/)
  expect(art).toMatch(/\[data-art='off'\] \.bg-art \{ display: none/)
})
