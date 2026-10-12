// Campaigns per game (src/ui/Campaigns.tsx): Shadowrun 6's pages call /api/sr6/campaigns and link under #/sr6; Anarchy's
// stay where they were. The server keeps the two games' campaigns apart (tests/server/games.test.ts).
import { afterEach, expect, test, vi } from 'vitest'
import { campaignLinks, loadCampaigns } from '../../src/ui/Campaigns'

afterEach(() => vi.unstubAllGlobals())
const calls = () => {
  const urls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (u: string) => {
      urls.push(u)
      return new Response('[]', { status: 200 })
    }),
  )
  return urls
}

test('loadCampaigns: Anarchy’s by default, SR6’s under sr6/', async () => {
  const urls = calls()
  await loadCampaigns()
  await loadCampaigns('ca2')
  await loadCampaigns('sr6')
  expect(urls).toEqual(['./api/campaigns', './api/campaigns', './api/sr6/campaigns'])
})

test('each game’s API path and links', () => {
  const a = campaignLinks('ca2'),
    s = campaignLinks('sr6')
  expect([a.api('/x1'), a.list, a.campaign('x1'), a.runner('r1', 'print'), a.npc('n1')]).toEqual([
    'campaigns/x1',
    '#/campaigns',
    '#/campaigns/x1',
    '#/c/r1/print',
    '#/n/n1/concept',
  ])
  expect([s.api('/x1'), s.list, s.campaign('x1'), s.runner('r1', 'print'), s.npc('n1')]).toEqual([
    'sr6/campaigns/x1',
    '#/sr6/campaigns',
    '#/sr6/campaigns/x1',
    '#/sr6/c/r1/print',
    '#/sr6/n/n1/stats',
  ])
})
