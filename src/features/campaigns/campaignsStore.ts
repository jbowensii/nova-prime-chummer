// The campaigns store both games share: a campaign's shape, the game's campaign API paths and page links, and the calls that
// load and change campaigns (server/campaigns.mjs). The pages are in Campaigns.tsx.
import { send, type User } from '../../core/ui-kit/auth'
import type { Game } from '../../core/ui-kit/game'
import type { Override } from '../../model/types'

export interface Person {
  username?: string
  name: string
}
export interface CampaignRunner {
  key: string
  mine: boolean
  ownerName: string
  streetName: string
  level: string
  package: string
  id?: string
  owner?: string
}
export interface Campaign {
  id: string
  name: string
  note: string
  archived: boolean
  created: string
  you: 'gm' | 'admin' | 'member'
  gms: Person[]
  members: Person[]
  runners: CampaignRunner[]
  npcs?: { id: string; name: string; owner: string; ownerName: string }[] // the NPCs shared with it: the GM's and the admin's view only
  creation?: { key: string; value: string; source?: string; page?: number }[] | null // SR6: its own creation settings (null: the server's)
  /** SR6: the creation settings its runners can't choose for themselves, with who locked each */
  locks?: { key: string; by: string; byName?: string }[]
}

/** `game`'s campaign API paths (for send) and page links. */
export function campaignLinks(game: Game = 'ca2') {
  const sr6 = game === 'sr6',
    home = sr6 ? '#/sr6/' : '#/'
  return {
    api: (rest = '') => `${sr6 ? 'sr6/' : ''}campaigns${rest}`,
    list: `${home}campaigns`,
    campaign: (id: string) => `${home}campaigns/${id}`,
    runner: (id: string, tab: string) => `${home}c/${id}/${tab}`,
    npc: (id: string) => (sr6 ? `#/sr6/n/${id}/stats` : `#/n/${id}/concept`),
  }
}
/** The caller's campaigns of `game` (Shadowrun 6's at /api/sr6/campaigns). */
export const loadCampaigns = async (game: Game = 'ca2'): Promise<Campaign[]> => (await send(campaignLinks(game).api(), undefined, 'GET')).json()
/** A GM's (or the admin's) approvals on another account's runner in a campaign they run, replaced on the server (the
 *  runner stays its player's; only its GMs and the admin may). */
export const approveRunner = (game: Game, campaign: string, runner: string, overrides: Override[]) =>
  send(campaignLinks(game).api(`/${campaign}/runners/${encodeURIComponent(runner)}/overrides`), { overrides }, 'PUT')
/** Whether `me` plays in or runs `c` (only then can they put a runner in it); the admin sees every campaign without being in it. */
export const joined = (c: Campaign, me: User | null) => c.you !== 'admin' || [...c.gms, ...c.members].some(p => p.username === me?.username)
