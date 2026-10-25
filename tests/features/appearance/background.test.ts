// @vitest-environment node
// The background picture is a viewer-set gauge (Settings → Background → Strength): its opacity is --art-strength, 0 = no
// picture, 100% = the picture alone, no veil — the same model as the character sheet's art, default 40% for both. App
// content sits on opaque cards/panels, so it stays readable whatever the gauge; these checks confirm the panel tokens hold.
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { SHEET_ART_DEFAULT } from '../../../src/features/appearance/sheetArt'
import { DEFAULTS, strength } from '../../../src/core/ui-kit/settings'

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

test('the page background is a gauge: the picture is the layer, --art-strength its opacity, no veil, default 40%', () => {
  expect(block('.bg-art')).toMatch(/opacity: var\(--art-strength, 0\.4\);/)
  expect(art).not.toMatch(/\.bg-art::after/) // no veil: the slider is the whole control, 0 = no picture, 100% = the picture alone
  expect(DEFAULTS.artStrength).toBe(40)
})

test('never printed, and hidden when asked', () => {
  expect(art).toMatch(/@media print \{ \.bg-art \{ display: none/)
  expect(art).toMatch(/prefers-reduced-transparency: reduce\) \{ \.bg-art \{ display: none/)
  expect(art).toMatch(/\[data-art='off'\] \.bg-art \{ display: none/)
})

test('the strength slider clamps to 0–100; an invalid value falls back to the 40% default (never 100, which the removed veil no longer tempers)', () => {
  expect([strength(100), strength(250), strength(0), strength(-3), strength(42.4), strength('x'), strength(undefined), strength(NaN)]).toEqual([
    100, 100, 0, 0, 42, 40, 40, 40,
  ])
})

test('the sheet’s own background art is the bottom layer: --art is its opacity (0 hidden, 1 the picture alone), no veil or wash over it; default 40%', () => {
  const sheet = readFileSync('src/features/appearance/sheet.css', 'utf8').replace(/\s+/g, ' ')
  expect(sheet).toMatch(/\.sheet-art > div \{[^}]*opacity: var\(--art\);/)
  expect(sheet).toMatch(/\.sheet-art::after \{ display: none; \}/)
  expect(sheet).toMatch(/--wash: transparent;/)
  expect(sheet).toMatch(/prefers-reduced-transparency: reduce\) \{ \.sheet-art \{ display: none/)
  expect(SHEET_ART_DEFAULT).toBe(40)
})

test('the Shadowrun 6 content stays readable on its opaque panels, light and dark', () => {
  // the art never sits under body text — content is on opaque cards/panels; confirm the panel tokens keep their contrast
  const sr6 = readFileSync('src/sr6/shell/ui/theme.css', 'utf8').replace(/\s+/g, ' ')
  const sblock = (sel: string) => sr6.match(new RegExp(`${sel.replace(/[[\]()]/g, '\\$&')} \\{([^}]*)\\}`))![1]
  const light = sblock(":root[data-game='sr6']"),
    dark = sblock(":root[data-game='sr6'][data-theme='dark']")
  for (const [theme, b] of [
    ['light', light],
    ['dark', dark],
  ] as const) {
    const t = (n: string) => rgb(token(b, n, theme === 'dark' ? token(light, n) : undefined))
    // the accent fill (primary buttons) and its text; the panel's text on its panel
    expect(ratio(t('accent-ink'), t('yellow')), `sr6 ${theme} accent`).toBeGreaterThanOrEqual(4.5)
    for (const name of ['panel-text', 'panel-muted', 'heading', 'err'])
      expect(ratio(t(name), t('panel')), `sr6 ${theme} --${name} on the panel`).toBeGreaterThanOrEqual(4.5)
  }
})
