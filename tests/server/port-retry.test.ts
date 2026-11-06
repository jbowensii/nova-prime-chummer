// @vitest-environment node
import { expect, test } from 'vitest'
// @ts-expect-error plain JS module
import { withPortRetry } from '../../electron/port-retry.mjs'

const taken = () => new Error('listen EADDRINUSE: address already in use')

test('a port taken after the probe gets a new pick', async () => {
  const ports = [1, 2]
  const tried: number[] = []
  const port = await withPortRetry(
    async () => ports.shift(),
    async (p: number) => {
      tried.push(p)
      if (p === 1) throw taken()
    },
  )
  expect([port, tried]).toEqual([2, [1, 2]])
})

test('it gives up after three tries, and any other error stops it at once', async () => {
  let n = 0
  const count = async () => void n++
  await expect(
    withPortRetry(
      async () => 1,
      () => count().then(() => Promise.reject(taken())),
    ),
  ).rejects.toThrow('EADDRINUSE')
  expect(n).toBe(3)
  n = 0
  await expect(
    withPortRetry(
      async () => 1,
      () => count().then(() => Promise.reject(new Error('disk full'))),
    ),
  ).rejects.toThrow('disk full')
  expect(n).toBe(1)
})
