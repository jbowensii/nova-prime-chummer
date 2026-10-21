// A runner's open problems for a GM: the counts on the campaign page's runner rows (#/sr6/campaigns/<id>) and the banner
// at the top of a player's runner. Counts are the unapproved errors and warnings, as Your runners counts its errors.
import { useEffect, useState } from 'react'
import type { Violation } from '../../../core/shared/types'
import { CampaignScreen } from '../../../features/campaigns/Campaigns'
import { campaignLinks, type Campaign } from '../../../features/campaigns/campaignsStore'
import type { CreationRules } from '../../table-setup/domain/creation'
import type { Sr6Data } from '../../catalog/domain/data'
import { validateCareer } from '../domain/career/career'
import { withSampleFixes } from '../domain/creation/samplefix'
import { validateSr6 } from '../domain/review/rules'
import type { Sr6Character } from '../../formats/domain/character'
import type { Sr6Catalog } from '../../formats/domain/types'
import { rulesForRunner } from '../../table-setup/ui/Creation'
import { sr6Repo } from './repo'

/** "2 errors", "1 warning": the unapproved ones of `v`, nothing for none. */
export function problemParts(v: Violation[]): string[] {
  const n = (sev: Violation['severity']) => v.filter(x => x.severity === sev && !x.approved).length,
    errors = n('error'),
    warnings = n('warning')
  return [errors && `${errors} ${errors === 1 ? 'error' : 'errors'}`, warnings && `${warnings} ${warnings === 1 ? 'warning' : 'warnings'}`].filter(
    Boolean,
  ) as string[]
}

/** The campaign page of SR6 (Anarchy's CampaignScreen): each runner row says how many problems it has, linked to its
 *  Review tab. The runners come from the one list the GM already reads (the server's runner list, once per page). */
export function Sr6CampaignScreen({
  id,
  c,
  data,
  cr,
  extra,
}: {
  id: string
  c: Sr6Catalog | null
  data: Sr6Data | null
  cr: CreationRules
  extra: (camp: Campaign, set: (c: Campaign) => void) => React.ReactNode
}) {
  const [runners, setRunners] = useState<Map<string, Sr6Character>>(new Map())
  useEffect(() => {
    sr6Repo()
      .listAll()
      .then(
        r => setRunners(new Map(r.stored.map(s => [s.ch.id, s.ch]))),
        () => {}, // no counts without the list; the page works as before
      )
  }, [id])
  return (
    <CampaignScreen
      id={id}
      game="sr6"
      label={(r, camp) => {
        const ch = r.id ? runners.get(r.id) : undefined
        if (!ch || !c || !data) return ''
        const rules = rulesForRunner(cr, camp, ch),
          view = withSampleFixes(c, ch).ch
        const parts = problemParts(ch.finalizedAt ? validateCareer(data, rules, ch) : validateSr6(data, rules, view))
        return parts.length ? (
          <a className="noncanon overspent" href={campaignLinks('sr6').runner(ch.id, 'review')}>
            {parts.join(' · ')}
          </a>
        ) : (
          ''
        )
      }}
      extra={extra}
    />
  )
}
