// @vitest-environment node
// The background art can't hurt reading: with the overlay strengths and the art's contrast filter in app.css, the worst
// image (black in light mode, white in dark mode) still leaves the text tokens their contrast on the page color.
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { SHEET_ART_DEFAULT } from '../../../src/features/appearance/sheetArt'
import { strength } from '../../../src/core/ui-kit/settings'

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

test('the sheet’s own background art is the bottom layer: --art is its opacity (0 hidden, 1 the picture alone), no veil or wash over it', () => {
  const sheet = readFileSync('src/features/appearance/sheet.css', 'utf8').replace(/\s+/g, ' ')
  expect(sheet).toMatch(/\.sheet-art > div \{[^}]*opacity: var\(--art\);/)
  expect(sheet).toMatch(/\.sheet-art::after \{ display: none; \}/)
  expect(sheet).toMatch(/--wash: transparent;/)
  expect(sheet).toMatch(/\.sheet-art\.no-print \{ display: none !important; \}/)
  expect(sheet).toMatch(/prefers-reduced-transparency: reduce\) \{ \.sheet-art \{ display: none/)
  expect(SHEET_ART_DEFAULT).toBe(25)
})

test('the Shadowrun 6 look keeps its text readable too, over the worst art, light and dark, on screen and on the sheet', () => {
  // src/sr6/shell/ui/theme.css: its tokens over app.css's (the art's veil and filter are app.css's, shared)
  const sr6 = readFileSync('src/sr6/shell/ui/theme.css', 'utf8').replace(/\s+/g, ' ')
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
})
