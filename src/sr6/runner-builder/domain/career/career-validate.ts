// Career validation: Review for a finalized runner, from the kept creation rules plus the ledger balance. Part of career.ts (the barrel).
import { type Violation } from '../../../../core/shared/types'
import { type Sr6Character } from '../../../formats/domain/character'
import { settingQuality, toNuyen } from '../creation/budgets'
import { cite, num, type CreationRules } from '../../../table-setup/domain/creation'
import { type Sr6Data } from '../../../catalog/domain/data'
import { CAREER_KEEP, validateSr6 } from '../review/rules'
import { liveAdvances, currentBuild } from './career-replay'
import { balances } from './career-balance'
import { fmt } from './career-pricing'

/** Review in career: a balance below 0 (after a void), and S2's catalog, Essence and prerequisite checks on the current
 *  build (what a spend may record though the runner lacks it). */
export function validateCareer(data: Sr6Data, cr: CreationRules, ch: Sr6Character): Violation[] {
  const bal = balances(ch),
    out: Violation[] = []
  if (bal.karma < 0) out.push({ code: 'career.karma', severity: 'warning', path: 'ledger', message: `The karma balance is below zero (${fmt(bal.karma)}).` })
  if (bal.nuyen < 0) out.push({ code: 'career.nuyen', severity: 'warning', path: 'ledger', message: `The nuyen balance is below zero (${fmt(bal.nuyen)}¥).` })
  // Stolen Gear's limit after creation (No Future errata, NF p. 162): the karma turned into nuyen at creation and since,
  // past karmaToNuyenMaxStolenGear, is a warning, never refused (owner 2026-10-16; creation still refuses it)
  const b = currentBuild(ch),
    sg = settingQuality(b, cr, 'stolenGearQuality', data),
    cap = num(cr, 'karmaToNuyenMaxStolenGear')
  if (sg && cap !== undefined) {
    const total = toNuyen(ch.build, cr, data) + liveAdvances(ch).reduce((t, e) => t + (e.advance.op === 'convert' ? Math.max(0, e.advance.karma) : 0), 0)
    if (total > cap)
      out.push({
        code: 'quality.stolenGearCap',
        severity: 'warning',
        path: `qualities.${sg.uid}`,
        message: `${data.qualities[sg.id]?.name ?? sg.name ?? sg.id}: ${total} karma turned into nuyen, more than the ${cap} it allows; not enforced, settle it with your GM.`,
        ...cite(cr, 'stolenGearQuality'),
      })
  }
  return [...out, ...validateSr6(data, cr, { ...ch, build: b }).filter(v => CAREER_KEEP.has(v.code))]
}
