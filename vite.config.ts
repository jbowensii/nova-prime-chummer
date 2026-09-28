/// <reference types="vitest/config" />
import { rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// The core files (src/engine/load.ts CORE_FILES) come from the core rulebook's import or a data pack. The owner's local
// copies in public/data serve `npm run dev`; a build never ships them.
const CORE_FILES = ['ampeffects', 'amptypes', 'armor', 'attributes', 'levels', 'lifestyles', 'metatypes', 'packages', 'pricing',
  'skills', 'vehicles', 'weapons']
const noCoreData = (): Plugin => {
  let out = 'dist'
  return {
    name: 'no-core-data', apply: 'build',
    configResolved: c => { out = resolve(c.root, c.build.outDir) },
    closeBundle: () => { for (const n of CORE_FILES) rmSync(join(out, 'data', `${n}.xml`), { force: true }) },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), noCoreData()],
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts'] },
})
