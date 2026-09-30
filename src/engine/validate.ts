// Rule checks. Every violation cites the book; errors block Finalize unless a GM approves them.
import type { AttrId, Catalog, Character, Violation } from '../model/types'
import { ATTRS } from '../model/types'
import { nonCanonUses } from './canon'
import { balance, activeEvents, currentBuild } from './career'
import { derive } from './derive'
import { price, slotLapse } from './price'

export function validate(c: Catalog, ch: Character): Violation[] {
  const out: Violation[] = []
  const add = (code: string, severity: Violation['severity'], path: string, message: string, page?: number, source = 'CRB') =>
    out.push({ code, severity, path, message, source: page ? source : undefined, page })
  const creation = !ch.finalizedAt
  const b = creation ? ch.build : currentBuild(ch)
  const level = c.levels.get(ch.level)
  const meta = c.metatypes.get(ch.identity.metatype)
  if (!level) add('ref.unknown', 'warning', 'level', `Unknown level of play "${ch.level}".`)
  if (!meta) add('ref.unknown', 'warning', 'identity.metatype', `Unknown metatype "${ch.identity.metatype}".`)

  // budget
  if (creation) {
    const p = price(c, ch)
    if (p.remaining < 0) add('budget.over', 'error', 'budget', `Over budget by ${(-p.remaining).toLocaleString('en-US')}¥.`, 84)
  } else {
    const bal = balance(c, ch)
    if (bal < 0) add('budget.over', 'error', 'budget', `Career balance is ${bal.toLocaleString('en-US')}¥.`, 83)
  }

  // attributes
  if (meta) {
    let atMax = 0
    for (const a of ATTRS) {
      const [min, max] = meta.ranges[a], v = b.attributes[a] ?? 0
      if (v < min || v > max) add('attr.range', 'error', `attributes.${a}`, `${a.toUpperCase()} ${v} is outside ${meta.name} range ${min}-${max}.`, 52)
      if (v === max) atMax++
    }
    if (creation && level && atMax > level.attrAtMax)
      add('attr.maxCount', 'error', 'attributes', `${atMax} Attributes at max; ${level.name} allows ${level.attrAtMax}.`, 84)
  }

  // skills
  for (const s of b.skills) {
    const sk = c.skills.get(s.id)
    if (!sk) { add('ref.unknown', 'warning', `skills.${s.id}`, `Unknown skill "${s.id}".`); continue }
    const cap = creation && level ? level.skillCap : 8
    if (s.rating > cap) add('skill.cap', 'error', `skills.${s.id}`, `${sk.name} ${s.rating} is above the cap of ${cap}${creation ? ` for ${level?.name}` : ''}.`, creation ? 84 : 52)
    if (s.specs.length && s.rating < 1) add('spec.noSkill', 'error', `skills.${s.id}`, `${sk.name} specializations need at least rating 1.`, 52)
    for (const sp of s.specs) {
      if (sp.startsWith('custom:')) add('custom.content', 'warning', `skills.${s.id}`, `Custom specialization "${sp.slice(7)}" (GM should approve).`, 52)
      else if (!sk.specs.some(x => x.id === sp)) add('ref.unknown', 'warning', `skills.${s.id}`, `Unknown specialization "${sp}".`)
    }
  }
  if (creation) for (const id of ['athletics', 'stealth', 'perception', 'influence', 'network']) {
    const r = b.skills.find(s => s.id === id)?.rating ?? 0
    if (r < 2) add('runner.basics', 'warning', `skills.${id}`, `${c.skills.get(id)?.name ?? id} below 2: every runner needs it, or a conscious reason not to.`, 84)
  }

  // amps
  const allRefs = new Set(b.amps.flatMap(a => a.effects.map(e => e.ref)))
  for (const a of b.amps) {
    const path = `amps.${a.uid}`
    if (!c.ampTypes.has(a.type)) add('ref.unknown', 'warning', path, `${a.name}: unknown amp type "${a.type}".`)
    if (a.catalogId && !c.amps.has(a.catalogId)) add('ref.unknown', 'warning', path, `${a.name}: catalog entry "${a.catalogId}" not in the loaded data.`)
    const template = a.catalogId ? c.amps.get(a.catalogId) ?? a.snapshot : undefined
    a.effects.forEach((e, i) => {
      const ep = `${path}.effects.${i}`
      const eff = c.ampEffects.get(e.ref)
      if (!eff) { add('ref.unknown', 'warning', ep, `${a.name}: unknown effect "${e.ref}".`); return }
      // The book's own catalog amps sometimes break the effect table (combat drugs are
      // Equipment with initiative); an effect exactly as the book printed it is sanctioned.
      const fromMod = e.note ? [...c.amps.values()].find(t => t.mod && t.name === e.note && t.effects.some(x => x.ref === e.ref)) : undefined
      const fromBook = (template?.type === a.type && template.effects.some(t => t.ref === e.ref)) || !!fromMod
      if (!eff.types.includes(a.type) && !fromBook) add('amp.typeIllegal', 'error', ep, `${a.name}: "${eff.name}" is not available for ${a.type}.`, eff.page)
      if (eff.requires && !a.effects.some(x => x.ref === eff.requires))
        add('amp.requires', 'error', ep, `${a.name}: "${eff.name}" requires "${c.ampEffects.get(eff.requires)?.name}".`, eff.page)
      if (eff.excludes && a.effects.some(x => x.ref === eff.excludes))
        add('amp.requires', 'error', ep, `${a.name}: "${eff.name}" can't be combined with "${c.ampEffects.get(eff.excludes)?.name}".`, eff.page)
      if (eff.param && ['skill', 'spec', 'attribute'].includes(eff.param) && !e.param)
        add('amp.param', 'error', ep, `${a.name}: choose the ${eff.param} for "${eff.name}".`, eff.page)
      if (e.param && eff.param === 'skill' && !c.skills.has(e.param)) add('ref.unknown', 'warning', ep, `${a.name}: unknown skill "${e.param}".`)
      if (e.param && eff.param === 'attribute' && !ATTRS.includes(e.param as AttrId)) add('ref.unknown', 'warning', ep, `${a.name}: unknown attribute "${e.param}".`)
      if (e.ref === 'negative') {
        const bookSanctioned = template?.effects.some(t => t.ref === 'negative' && t.value === e.value && t.note === e.note)
          || fromMod?.effects.some(t => t.ref === 'negative' && t.value === e.value)
        if (!bookSanctioned) add('amp.negative', 'error', ep, `${a.name}: negative effect -${e.value ?? 1} needs GM approval.`, 63)
      }
    })
    for (const eff of new Set(a.effects.map(e => e.ref))) {
      const def = c.ampEffects.get(eff)
      const n = a.effects.filter(e => e.ref === eff).length
      if (def?.max != null && n > def.max) add('amp.effectMax', 'error', path, `${a.name}: "${def.name}" ${n}x, max ${def.max}.`, def.page)
    }
    if (a.type === 'equipment' && !(a.linkedItem && b.items.some(i => i.uid === a.linkedItem)))
      add('amp.noItem', 'error', path, `${a.name}: an Equipment amp needs its item bought first.`, 60)
    if (a.type === 'adept' && !allRefs.has('awk-adept')) add('adept.requiresAwakened', 'error', path, `${a.name}: adept powers need the Awakened amp with the Adept option.`, 58)
    if (a.type === 'vehicle' && a.vehicle) {
      const body = c.vehicles.get(a.vehicle)?.body ?? 0
      const armor = a.effects.filter(e => e.ref === 'vehicle-armor').length
      if (armor > body) add('vehicle.armor', 'error', path, `${a.name}: vehicle Armor +${armor} is above its Body ${body}.`, 62)
    }
  }
  if (!creation) for (const e of activeEvents(ch))
    if (e.type === 'amp-add' && e.amp.type === 'quality')
      add('amp.qualityAfterCreation', 'error', `amps.${e.amp.uid}`, `${e.amp.name}: new Qualities after creation need a major event (GM).`, 58)

  const rating = (id: string) => b.skills.find(s => s.id === id)?.rating ?? 0
  if (rating('sorcery') > 0 && !allRefs.has('awk-sorcery')) add('skill.requiresAwakened', 'error', 'skills.sorcery', 'Sorcery needs the Awakened amp with Sorcery.', 57)
  if (rating('conjuring') > 0 && !allRefs.has('awk-conjuring')) add('skill.requiresAwakened', 'error', 'skills.conjuring', 'Conjuring needs the Awakened amp with Conjuring.', 54)
  const emerged = b.amps.some(a => a.type === 'emerged')
  if (rating('cracking') > 0 && !b.amps.some(a => a.type === 'cyberdeck') && !emerged) add('skill.requiresDeck', 'error', 'skills.cracking', 'Cracking needs a cyberdeck (or the Emerged amp).', 54)
  if (rating('tasking') > 0 && !emerged) add('skill.requiresEmerged', 'error', 'skills.tasking', 'Tasking needs the Emerged amp.', 8, 'CG')
  if (emerged && b.amps.some(a => a.type === 'awakened')) add('amp.emergedAwakened', 'error', 'amps', 'A character cannot be both Awakened and Emerged.', 8, 'CG')
  if (b.items.some(i => i.kind === 'complex-form') && !emerged) add('complexForm.noEmerged', 'warning', 'items', 'Complex forms without the Emerged amp.', 9, 'CG')
  if (b.items.some(i => i.kind === 'spell') && !allRefs.has('awk-sorcery')) add('spell.noSorcery', 'warning', 'items', 'Spells without the Sorcery option on the Awakened amp.', 58)

  const natives = b.knowledge.filter(k => k.native && k.kind === 'language')
  if (natives.length > 1) add('knowledge.native', 'warning', 'knowledge', `Only one native language is free; ${natives.slice(1).map(k => `“${k.name}”`).join(', ')} ${natives.length > 2 ? 'cost' : 'costs'} the knowledge price.`)
  b.knowledge.forEach((k, i) => {
    if (k === natives[0]) return // free whatever its slot does
    const lapse = slotLapse(b, ch.narrative.keywords, k, id => c.skills.get(id)?.name ?? id)
    if (lapse) add('knowledge.lapsed', 'warning', `knowledge.${i}`, `“${k.name}” was free; with ${lapse} it’s a paid knowledge skill.`)
  })

  // Risk Reduction caps
  const d =derive(c, { ...ch, build: b, finalizedAt: undefined })
  if (creation && level) {
    for (const a of ATTRS) if (d.rrAttr[a] > level.rrAttr) add('rr.cap', 'error', `attributes.${a}`, `RR ${d.rrAttr[a]} on ${a.toUpperCase()}; ${level.name} allows ${level.rrAttr}.`, 84)
  }
  const raw = rawRR(b)
  for (const s of b.skills) {
    const sk = c.skills.get(s.id)
    if (!sk) continue
    const skillRR = raw.skill.get(s.id) ?? 0
    if (creation && level && skillRR > level.rrSkill) add('rr.cap', 'error', `skills.${s.id}`, `RR ${skillRR} on ${sk.name}; ${level.name} allows ${level.rrSkill}.`, 84)
    for (const sp of s.specs) {
      const total = skillRR + (raw.spec.get(sp) ?? 0)
      if (creation && level && total > level.rrSpec) add('rr.cap', 'error', `skills.${s.id}`, `RR ${total} on ${sk.name} (${sp.split('.')[1] ?? sp}); ${level.name} allows ${level.rrSpec}.`, 84)
      else if (total > 3) add('rr.cap', 'warning', `skills.${s.id}`, `RR ${total} on ${sp}: only 3 applies to one Test.`, 61)
    }
  }
  if (d.essenceEffects.dead) add('essence.dead', 'error', 'amps', `Essence ${d.essence}: the character dies.`, 60)

  for (const i of b.items) {
    const path = `items.${i.uid}`
    if (i.catalogId && !c.items.has(i.catalogId)) add('ref.unknown', 'warning', path, `${i.name}: catalog entry "${i.catalogId}" not in the loaded data.`)
    if (i.price != null && !i.starting) add('custom.content', 'warning', path, `${i.name}: GM-set price ${i.price.toLocaleString('en-US')}¥.`, 83)
  }

  const n = ch.narrative
  const filled = (xs: string[]) => xs.filter(x => x.trim()).length
  if (filled(n.keywords) !== 5 || filled(n.dispositions) !== 4 || filled(n.cues) !== 4)
    add('narrative.count', 'warning', 'narrative', `Pick 5 Keywords, 4 Dispositions and 4 Cues (have ${filled(n.keywords)}/${filled(n.dispositions)}/${filled(n.cues)}).`, 84)

  const approved = new Set(ch.overrides.map(o => `${o.code}|${o.path}`))
  // non-canon content, when the runner is set to canon only
  if (ch.allowNonCanon === false)
    for (const u of nonCanonUses(c, b))
      add('content.nonCanon', 'warning', u.path, `${u.name} isn’t canon (${c.sources.get(u.source)?.name ?? u.source}); this runner is set to canon only.`)

  return out.map(v => (approved.has(`${v.code}|${v.path}`) ? { ...v, approved: true } : v))
}

function rawRR(b: Character['build']) {
  const skill = new Map<string, number>(), spec = new Map<string, number>()
  for (const a of b.amps) for (const e of a.effects) {
    if (!e.param) continue
    if (e.ref === 'rr-skill') skill.set(e.param, (skill.get(e.param) ?? 0) + 1)
    if (e.ref === 'rr-spec') spec.set(e.param, (spec.get(e.param) ?? 0) + 1)
  }
  return { skill, spec }
}

export const canFinalize = (v: Violation[]) => !v.some(x => x.severity === 'error' && !x.approved)
