// inBatches (src/ui/bits.tsx): Load book NPCs and Tidy book copies save a few at a time, counting each one done.
import { expect, test } from 'vitest'
import { inBatches } from '../../src/ui/bits'

test('every item once, never more than `at` at once, a step after each', async () => {
  let running = 0,
    most = 0,
    steps = 0
  const seen: number[] = []
  await inBatches(
    Array.from({ length: 10 }, (_, i) => i),
    async i => {
      running++
      most = Math.max(most, running)
      await new Promise(r => setTimeout(r, (i * 7) % 5))
      seen.push(i)
      running--
    },
    () => steps++,
    4,
  )
  expect(seen.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  expect(most).toBe(4)
  expect(steps).toBe(10)
})

test('nothing to do: done at once', async () => {
  let steps = 0
  await inBatches(
    [],
    async () => {
      throw new Error('not called')
    },
    () => steps++,
  )
  expect(steps).toBe(0)
})
