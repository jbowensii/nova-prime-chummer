import { configDefaults, defineConfig } from 'vitest/config'
import base from './vite.config.ts'

// `npm run perf`: only the timing files, which `npm test` (vite.config.ts) leaves out. Not mergeConfig: it would add the
// base's exclude of tests/perf back. disableConsoleIntercept shows the printed medians in the log.
export default defineConfig({
  ...base,
  test: { ...base.test, include: ['tests/perf/**/*.perf.test.ts'], exclude: configDefaults.exclude, disableConsoleIntercept: true },
})
