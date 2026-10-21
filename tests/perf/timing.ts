// Shared by the *.perf.test.ts files (`npm run perf`): warm up once, run n times, return the median in ms.
import { expect } from 'vitest'

export function median(run: () => unknown, n = 15): number {
  run()
  const t: number[] = []
  for (let i = 0; i < n; i++) {
    const s = performance.now()
    run()
    t.push(performance.now() - s)
  }
  return t.sort((a, b) => a - b)[n >> 1]
}

/** Time `run`, print the median, fail if it is over `budget` ms. */
export function within(name: string, budget: number, run: () => unknown, n?: number): void {
  const m = median(run, n)
  console.log(`perf ${name}: median ${m.toFixed(2)} ms (budget ${budget} ms)`)
  expect(m, `${name} median ${m.toFixed(2)} ms`).toBeLessThan(budget)
}
