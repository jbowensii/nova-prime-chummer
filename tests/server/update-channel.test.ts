// @vitest-environment node
// Main accepts exactly two update channels from the window; anything else is refused.
import { expect, test } from 'vitest'
// @ts-expect-error plain .mjs
import { channelOf } from '../../electron/update-channel.mjs'

test('only latest and beta pass', () => {
  expect(channelOf('latest')).toBe('latest')
  expect(channelOf('beta')).toBe('beta')
  for (const bad of ['stable', 'Beta', 'alpha', '', undefined, null, 5, {}, 'latest ']) expect(() => channelOf(bad)).toThrow()
})
