// @vitest-environment node
// The background art can't hurt reading: with the overlay strengths and the art's contrast filter in app.css, the worst
// image (black in light mode, white in dark mode) still leaves the text tokens their contrast on the page color.
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { strength } from '../../src/core/ui-kit/settings'

const css = readFileSync('src/core/ui-kit/app.css', 'utf8').replace(/\s+/g, ' ')
const art = css.slice(css.indexOf('/* ---- background art'))
const block = (sel: string) => css.match(new RegExp(`${sel.replace(/[[\]()]/g, '\\$&')} \\{([^}]*)\\}`))![1]
const token = (b: string, name: string, light?: string): string => {
  const v = b.match(new RegExp(`--${name}: ([^;]+);`))?.[1].trim() ?? light!
  const ref = v.match(/^var\(--([\w-]+)\)$/)?.[1]
  return ref ? token(b, ref, light ? token(block(':root'), ref) : undefined) : v
}
const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
const lum = (c: number[]) => {
  const [r, g, b] = c.map(v => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a: number[], b: number[]) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

test('text keeps its contrast over the worst background art, light and dark', () => {
  const cover = Math.min(...[...art.matchAll(/var\(--bg\) (\d+)%/g)].map(m => Number(m[1]) / 100)) // the strongest the art gets
  const k = Number(art.match(/filter: contrast\(([\d.]+)\)/)![1])
  expect(cover).toBeGreaterThanOrEqual(0.8)
  const light = block(':root'),
    dark = block(":root[data-theme='dark']")
  for (const [theme, b, worst] of [
    ['light', light, 0],
    ['dark', dark, 255],
  ] as const) {
    const t = (n: string) => rgb(token(b, n, theme === 'dark' ? token(light, n) : undefined))
    const artPx = (worst / 255 - 0.5) * k + 0.5 // CSS contrast(): the image's darkest (light) or brightest (dark) pixel
    const bg = t('bg').map(v => v * cover + artPx * 255 * (1 - cover))
    for (const [name, min] of [
      ['text', 7],
      ['text-2', 7],
      ['text-3', 4.5],
      ['heading', 4.5],
    ] as const)
      expect(ratio(t(name), bg), `${theme} --${name}`).toBeGreaterThanOrEqual(min)
  }
})

test('never printed, and hidden when asked', () => {
  expect(art).toMatch(/@media print \{ \.bg-art \{ display: none/)
  expect(art).toMatch(/prefers-reduced-transparency: reduce\) \{ \.bg-art \{ display: none/)
  expect(art).toMatch(/\[data-art='off'\] \.bg-art \{ display: none/)
})

test('the strength slider only fades the art: 100% is the clamped strength above, never more', () => {
  expect(block('.bg-art')).toMatch(/opacity: var\(--art-strength, 1\);/) // the layer's opacity, nothing scaled up
  expect([strength(100), strength(250), strength(0), strength(-3), strength(42.4), strength('x'), strength(undefined), strength(NaN)]).toEqual([
    100, 100, 0, 0, 42, 100, 100, 100,
  ])
})

test('the sheet’s own background art keeps the sheet’s ink readable at every strength, and is off in print unless asked', () => {
  // 0.8.1: the art fades in with the strength under a veil that thins as it rises, and the text blocks keep a wash of paper
  const sheet = readFileSync('src/print/sheet.css', 'utf8').replace(/\s+/g, ' '),
    sa = sheet.slice(sheet.indexOf('/* ---- sheet art'))
  const veils = [...sa.matchAll(/rgb\(255 255 255 \/ calc\(\(([\d.]+) - ([\d.]+) \* var\(--art\)\) \* ([\d.]+)\)\)/g)].map(m => [
    Number(m[1]) * Number(m[3]),
    Number(m[2]) * Number(m[3]),
  ])
  const wash = Number(sa.match(/--wash: rgb\(255 255 255 \/ calc\(([\d.]+) \* var\(--art\)\)\)/)![1])
  const k = Number(sa.match(/filter: contrast\(([\d.]+)\)/)![1])
  expect(veils).toHaveLength(2)
  expect(sa).toMatch(/\.sheet-art > div \{[^}]*opacity: var\(--art\);/) // the image itself fades with the strength
  const s = (n: string) => rgb(sheet.match(new RegExp(`--s-${n}: (#[0-9a-f]{6})`))![1])
  for (let i = 0; i <= 20; i++) {
    const t = i / 20
    const art = Math.max(...veils.map(([a, b]) => t * (1 - (a - b * t)))) * (1 - wash * t) // how much of the image shows behind text
    expect(art).toBeLessThanOrEqual(0.36) // 0.13.1: the veil halved so the art shows; the ink checks below are the real floor
    const bg = [255, 255, 255].map(v => v * (1 - art) + 0.5 * (1 - k) * 255 * art) // a black image, flattened
    for (const [name, min] of [
      ['ink', 7],
      ['ink-2', 4.5],
      ['rust', 4.5],
      ['indigo', 4.5],
    ] as const)
      expect(ratio(s(name), bg), `--s-${name} at ${t * 100}%`).toBeGreaterThanOrEqual(min)
  }
  // at 100% the image itself shows strongly where there's no text: at least 65% of it
  expect(Math.min(...veils.map(([a, b]) => 1 - (a - b)))).toBeGreaterThanOrEqual(0.649)
  expect(sheet).toMatch(/\.sheet-art\.no-print \{ display: none !important; \}/)
  expect(sheet).toMatch(/prefers-reduced-transparency: reduce\) \{ \.sheet-art \{ display: none/)
})

test('the Shadowrun 6 look keeps its text readable too, over the worst art, light and dark, on screen and on the sheet', () => {
  // src/sr6/ui/theme.css: its tokens over app.css's (the art's veil and filter are app.css's, shared)
  const sr6 = readFileSync('src/sr6/ui/theme.css', 'utf8').replace(/\s+/g, ' ')
  const sblock = (sel: string) => sr6.match(new RegExp(`${sel.replace(/[[\]()]/g, '\\$&')} \\{([^}]*)\\}`))![1]
  const cover = Math.min(...[...art.matchAll(/var\(--bg\) (\d+)%/g)].map(m => Number(m[1]) / 100))
  const k = Number(art.match(/filter: contrast\(([\d.]+)\)/)![1])
  const light = sblock(":root[data-game='sr6']"),
    dark = sblock(":root[data-game='sr6'][data-theme='dark']")
  for (const [theme, b, worst] of [
    ['light', light, 0],
    ['dark', dark, 255],
  ] as const) {
    const t = (n: string) => rgb(token(b, n, theme === 'dark' ? token(light, n) : undefined))
    const bg = t('bg').map(v => v * cover + ((worst / 255 - 0.5) * k + 0.5) * 255 * (1 - cover))
    for (const [name, min] of [
      ['text', 7],
      ['text-2', 7],
      ['text-3', 4.5],
      ['heading', 4.5],
      ['rust', 4.5],
      ['err', 4.5],
    ] as const)
      expect(ratio(t(name), bg), `sr6 ${theme} --${name}`).toBeGreaterThanOrEqual(min)
    // the accent fill (primary buttons) and its text; the sidebar's text on its panel
    expect(ratio(t('accent-ink'), t('yellow')), `sr6 ${theme} accent`).toBeGreaterThanOrEqual(4.5)
    for (const name of ['panel-text', 'panel-muted', 'heading', 'err'])
      expect(ratio(t(name), t('panel')), `sr6 ${theme} --${name} on the panel`).toBeGreaterThanOrEqual(4.5)
  }
  // the sheet's SR6 inks on paper under the sheet art's strongest showing (0.31 of a black image, flattened: see above)
  const sheet = readFileSync('src/print/sheet.css', 'utf8').replace(/\s+/g, ' '),
    sk = Number(sheet.slice(sheet.indexOf('/* ---- sheet art')).match(/filter: contrast\(([\d.]+)\)/)![1])
  const paper = [255, 255, 255].map(v => v * 0.69 + 0.5 * (1 - sk) * 255 * 0.31)
  const s = (n: string) => rgb(sr6.match(new RegExp(`\\.sr6-sheet \\{[^}]*--s-${n}: (#[0-9a-f]{6})`))![1])
  for (const [name, min] of [
    ['ink', 7],
    ['ink-2', 4.5],
    ['rust', 4.5],
    ['indigo', 4.5],
  ] as const)
    expect(ratio(s(name), paper), `sr6 sheet --s-${name}`).toBeGreaterThanOrEqual(min)
})
