import { readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { configDefaults } from 'vitest/config'

// The core files (src/ca2/catalog/domain/load.ts CORE_FILES) come from the core rulebook's import or a data pack. The owner's local
// copies in public/data serve `npm run dev`; a build never ships them.
const CORE_FILES = [
  'ampeffects',
  'amptypes',
  'armor',
  'attributes',
  'levels',
  'lifestyles',
  'metatypes',
  'packages',
  'pricing',
  'skills',
  'vehicles',
  'weapons',
]
const noCoreData = (): Plugin => {
  let out = 'dist'
  return {
    name: 'no-core-data',
    apply: 'build',
    configResolved: c => {
      out = resolve(c.root, c.build.outDir)
    },
    closeBundle: () => {
      for (const n of CORE_FILES) rmSync(join(out, 'data', `${n}.xml`), { force: true })
    },
  }
}

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync('package.json', 'utf8')).version) },
  plugins: [react(), noCoreData()],
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'tests/perf/**'], // timing checks run by `npm run perf` (vitest.perf.config.ts)
    coverage: {
      provider: 'v8',
      include: ['src/**', 'server/**'],
      exclude: ['**/*.d.ts', 'tests/**'],
      reporter: ['text-summary', 'json-summary'],
      // floors ~0.5 point under the 2026-11-03 measure (82.45 / 74.57 / 73.45 / 82.95), so coverage can't silently drop
      thresholds: { statements: 82, branches: 74, functions: 73, lines: 82 },
    },
  },
})
