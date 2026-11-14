// Review rules, entry points: validateSr6 runs the rules table over a character; CAREER_KEEP is what a finalized runner still gets.
import { canFinalize } from '../../../../core/shared/rules'
import type { Violation } from '../../../../core/shared/types'
import { PICK_KINDS, PURCHASE_KINDS, type Sr6Character } from '../../../formats/domain/character'
import { allBudgets, PURCHASE_TAB } from '../creation/budgets'
import { CREATION_KEYS, blockedBy, cite, conflictsOf, expandKeys, isOn, isRunnerRuleKey, type CreationRules } from '../../../table-setup/domain/creation'
import { type QualityPath, type Sr6Data } from '../../../catalog/domain/data'
import { makeProvider } from '../creation/providers'
import { entryLabel } from '../../../catalog/domain/categories'
import { type Ctx, fixOf } from './context'
import { RULES } from './rules-table'

/** The kind of the purchase line `uid` (augmentations when it's gone). */
const PURCHASE_KIND_OF = (ch: Sr6Character, uid: string) => ch.build.purchases.find(x => x.uid === uid)?.kind ?? 'augmentations'

/** The validateSr6 violations a finalized runner still gets (validateCareer, src/sr6/runner-builder/domain/career/career.ts): the rest are
 *  creation-only. tests/sr6/runner-builder/career-keep.test.ts fails when a code here is no longer emitted. */
export const CAREER_KEEP = new Set([
  'awakened.override',
  'catalog.missing',
  'essence.positive',
  'sin.placeholder',
  'skill.specUntrained',
  'skill.expertiseSpec',
  'skill.expertiseRank',
  'skill.restricted',
  'magic.spellsAllowed',
  'magic.metamagicUser',
  'magic.metamagicCount',
  'prerequisite.character',
  'martial.category',
  'martial.requires',
  'martial.augmentation',
  'gear.grade',
  'catalog.accessoryHost',
  'licence.none',
  'vehicle.mods',
  'vehicle.design',
  'gear.custom',
  'critter.rules',
])

/** Every broken creation rule on `ch`, the catalog's own problems, and a warning per unset setting a rule needed; approved
 *  from the GM's overrides (code and path). */
export function validateSr6(data: Sr6Data, cr: CreationRules, ch: Sr6Character, paths: QualityPath[] = []): Violation[] {
  const b = ch.build,
    p = makeProvider(b.method, data, cr)
  const c: Ctx = { data, cr, ch, b, p, budgets: allBudgets(b, data, cr, p), paths }
  const labels = new Map(expandKeys(data).map(k => [k.key, k.label]))
  const out: Violation[] = [],
    unset = new Set<string>(),
    seen = new Set<string>()
  // a setting the runner turned off itself (Creation method tab) is no table setting left unset
  const off = new Set((ch.rules ?? []).filter(r => !r.value.trim()).map(r => r.key))
  for (const r of RULES) {
    const keys = typeof r.setting === 'function' ? r.setting(c) : (r.setting ?? [])
    const missing = keys.filter(k => !cr.has(k) && !off.has(k))
    if (keys.some(k => off.has(k) && !cr.has(k))) continue
    if (missing.length) {
      for (const k of missing)
        if (!unset.has(k)) {
          unset.add(k)
          out.push({ code: 'setting.unset', severity: 'warning', path: r.tab, message: `${labels.get(k) ?? k} isn’t set: Table setup → Creation rules.` })
        }
      continue
    }
    const hits = r.check(c)
    for (const h of hits === null ? [] : Array.isArray(hits) ? hits : [hits]) {
      // An exact repeat (same code, path and message) is kept once. Errors are never collapsed: each line with its
      // own path is a separate thing to fix (two Aptitude lines each naming no skill).
      if (r.severity !== 'error') {
        const key = JSON.stringify([r.code, h.path, h.message])
        if (seen.has(key)) continue
        seen.add(key)
      }
      const at = h.page ? { source: h.source, page: h.page } : keys[0] ? cite(cr, keys[0]) : {}
      out.push({
        code: r.code,
        severity: r.severity,
        path: h.path ?? r.tab,
        message: h.message,
        ...at,
        ...(r.hard ? { hard: true as const } : {}),
        ...fixOf(h, r),
      })
    }
  }
  out.push(...runnerRuleNotes(cr, ch, labels))
  // a printed line the owner's override file corrects (engine/samplefix.ts): a note, not the error the book's value gave
  for (const k of ch.corrections ?? []) {
    const e = c.data.entry(PURCHASE_KIND_OF(ch, k.path), k.item)
    out.push({
      code: 'sample.corrected',
      severity: 'warning',
      path: `${PURCHASE_TAB[PURCHASE_KIND_OF(ch, k.path)]}.${k.path}`,
      source: k.source,
      page: k.page,
      message: `${e ? entryLabel(e) : k.item}: the book prints ${k.field} ${k.from}; corrected to ${k.to} by an override${k.note ? ` (${k.note})` : ''}.`,
    })
  }
  // the catalog's own problems (data.ts), only for entries this runner uses (and the priority table): not every book's
  // (a level's entry, levels.ts, carries its family's parent's problems: the parent is the id the catalog warns under)
  // (kind-qualified for the kinds whose ids repeat across kinds: the spell crb.armor is not the augmentation crb.armor; any other kind
  // by its id alone. An object with no kind of its own (a quality) is read as a quality.)
  const KQ = new Set<string>([...PURCHASE_KINDS, ...PICK_KINDS, 'qualities'])
  const keys = new Set<string>()
  const walk = (o: unknown): void => {
    if (!o || typeof o !== 'object') return
    if (Array.isArray(o)) return o.forEach(walk)
    const r = o as Record<string, unknown>
    if (typeof r.id === 'string') {
      const kind = typeof r.kind === 'string' && KQ.has(r.kind) ? r.kind : 'qualities'
      keys.add(`${kind}.${r.id}`)
      const fam = data.entry(kind as 'qualities', r.id)?.attrs.family
      if (fam) keys.add(`${kind}.${fam}`)
    }
    Object.values(r).forEach(walk)
  }
  walk(ch.build)
  const used = JSON.stringify(ch.build)
  out.push(
    ...data.problems.filter(v => {
      const kind = v.path.slice(0, v.path.indexOf('.'))
      return v.path.startsWith('priorities.') || (KQ.has(kind) ? keys.has(v.path) : used.includes(`"${v.path.slice(kind.length + 1)}"`))
    }),
  )
  const approved = new Set(ch.overrides.map(o => `${o.code}|${o.path}`))
  return out.map(v => (approved.has(`${v.code}|${v.path}`) && !v.hard ? { ...v, approved: true } : v))
}

/** An assumption a sample runner's numbers need that a known printing explains (owner's decision U31, 2026-10-11). */
const ASSUMED: Record<string, string> = { availabilityCapIllegalOnly: 'assumed: 2019 printing (its numbers need the first printing’s reading)' }

/** Notes on the runner's own rules (creation.ts runnerRules): one a book sample was given because its numbers need it
 *  (assumed: the book doesn't say), and one its campaign locked, so the runner's choice is set aside. Never errors. */
function runnerRuleNotes(cr: CreationRules, ch: Sr6Character, labels: Map<string, string>): Violation[] {
  const name = (k: string) => labels.get(k) ?? k,
    out: Violation[] = []
  // (rules that can't be on together, all on: rules that didn't go through runnerRules, which keeps one)
  const clash = [...cr.keys()].filter(k => isOn(cr.get(k)) && conflictsOf(k).some(c => isOn(cr.get(c))))
  if (clash.length)
    out.push({ code: 'rules.conflict', severity: 'warning', path: 'method', message: `${clash.map(name).join('; ')}: these can’t be on together.` })
  for (const r of ch.rules ?? []) {
    const s = cr.get(r.key),
      b = !s && r.value.trim() && r.value !== 'false' ? blockedBy(cr, r.key) : undefined
    if (!isRunnerRuleKey(r.key))
      out.push({ code: 'rules.tableOnly', severity: 'warning', path: 'method', message: `${name(r.key)}: your choice is set aside; only the table sets this.` })
    else if (s?.lockedBy)
      out.push({
        code: 'rules.locked',
        severity: 'warning',
        path: 'method',
        message: `${name(r.key)}: your choice is set aside; the campaign’s GM ${s.lockedBy} locked it.`,
      })
    else if (b && !CREATION_KEYS.some(k => k.key === r.key && k.methods !== 'all' && k.methods.length > 0 && !k.methods.includes(ch.build.method)))
      out.push({
        code: 'rules.setAside',
        severity: 'warning',
        path: 'method',
        message: `${name(r.key)}: your choice is set aside; ${'needs' in b ? `it needs ${name(b.needs)}, which is off` : `it can’t be on with ${name(b.conflicts)}`}.`,
      })
    // an assumed value is only worth noting when the rule bears on how THIS runner is built: a rule scoped to other
    // creation methods (a point-buy runner shown the Karma build's assumed numbers) is noise, so suppress it
    else if (
      r.assumed &&
      !CREATION_KEYS.some(k => k.key === r.key && k.methods !== 'all' && k.methods.length > 0 && !k.methods.includes(ch.build.method)) &&
      !(/^karmaBuild/.test(r.key) && ch.build.method !== 'karma')
    )
      out.push({
        code: 'rules.assumed',
        severity: 'warning',
        path: 'method',
        ...(r.source ? { source: r.source } : {}),
        ...(r.page ? { page: r.page } : {}),
        message: `${name(r.key)}: ${r.value.trim() === '' || r.value === 'false' ? 'off' : r.value === 'true' ? 'on' : r.value}; ${
          ASSUMED[r.key] ?? 'assumed from the book’s numbers (the book doesn’t say)'
        }.`,
      })
  }
  return out
}

/** No error left that a GM hasn't approved (Anarchy's rule). */
export const canFinalizeSr6 = canFinalize
