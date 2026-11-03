// Build actions, attribute, skill, specialization and Infected/awakened/shifter ops (split from actions.ts; apply() in actions.ts dispatches here).
import { newId } from '../../../../core/shared/types'
import { type Sr6Build } from '../../../formats/domain/character'
import { type CreationRules } from '../../../table-setup/domain/creation'
import { type Sr6Data } from '../../../catalog/domain/data'
import { setCollective, surgeAllowed } from './surge'
import { shifterForms, shifterLine } from './drake'
import { dracoformPool, drakeType } from './drake'
import { no, OK, step, adeptBars, type OpOf, type Result } from './actions-helpers'
import { infect } from './actions-setters'
export function applyAttributes(
  b: Sr6Build,
  op: OpOf<'attribute' | 'skill' | 'specs' | 'spec' | 'expertise' | 'infected' | 'awakened' | 'dracoform' | 'collective' | 'shifterForm'>,
  data: Sr6Data,
  cr: CreationRules,
): Result {
  switch (op.op) {
    case 'attribute': {
      const a = b.attributes[op.target]
      return a
        ? step(
            () => a[op.pool],
            v => {
              a[op.pool] = v
            },
            op.delta,
          )
        : no('unknown-attribute')
    }
    case 'skill': {
      let s = b.skills.find(x => x.id === op.target)
      if (!s) {
        if (!data.skills[op.target]) return no('unknown-entry')
        s = { id: op.target, points: 0, karma: 0 }
      }
      const v = s[op.pool] + op.delta
      if (v < 0) return no('below-zero')
      // owner's decision 3 (2026-10-11): a pure adept takes no Sorcery, Conjuring or Enchanting (Astral is p. 93's)
      if (op.delta > 0 && adeptBars(b, data, op.target)) return no('not-for-adept')
      s[op.pool] = v
      if (!b.skills.includes(s)) b.skills.push(s)
      // no rank left: the skill goes, its spec and expertise with it
      if (!s.points && !s.karma) b.skills = b.skills.filter(x => x !== s)
      return OK
    }
    case 'specs': {
      const v = [...new Set(op.specs.map(x => x.trim().slice(0, 80)).filter(Boolean))].slice(0, 20)
      let s = b.skills.find(x => x.id === op.target)
      if (!s) {
        if (!data.skills[op.target]) return no('unknown-entry')
        if (!v.length) return OK
        b.skills.push((s = { id: op.target, points: 0, karma: 0 }))
      }
      if (v.length) s.specs = v
      else delete s.specs
      if (!s.points && !s.karma && !s.spec && !s.expertise && !s.specs) b.skills = b.skills.filter(x => x !== s)
      return OK
    }
    case 'spec':
    case 'expertise': {
      // on a skill without a rank, or an expertise without a specialization: taken (Review's skill.specUntrained, skill.expertiseSpec)
      const v = op.op === 'spec' ? op.spec : op.expertise
      let s = b.skills.find(x => x.id === op.target)
      if (!s) {
        if (!data.skills[op.target]) return no('unknown-entry')
        if (!v) return OK
        b.skills.push((s = { id: op.target, points: 0, karma: 0 }))
      }
      if (v) s[op.op] = v
      else delete s[op.op]
      // a line left with no rank, specialization nor expertise goes
      if (!s.points && !s.karma && !s.spec && !s.expertise && !s.specs) b.skills = b.skills.filter(x => x !== s)
      return OK
    }
    case 'infected':
      return infect(b, op.id, data, cr)
    case 'awakened':
      if (op.value === null) delete b.awakened
      else b.awakened = op.value
      return OK
    case 'dracoform': {
      const { attrs, points } = dracoformPool(drakeType(b, data))
      if (!attrs.includes(op.attr)) return no('not-dracoform')
      if (op.points < 0) return no('below-zero')
      const next = { ...(b.dracoform ?? {}), [op.attr]: op.points }
      if (Object.values(next).reduce((s, v) => s + (v ?? 0), 0) > points) return no('over-pool')
      if (!op.points) delete next[op.attr]
      if (Object.keys(next).length) b.dracoform = next
      else delete b.dracoform
      return OK
    }
    case 'collective': {
      if (op.id && !data.entry('qualitysets', op.id)) return no('unknown')
      if (op.id && !surgeAllowed(cr)) return no('rule-off')
      setCollective(b, data, op.id, op.choice)
      return OK
    }
    case 'shifterForm': {
      // (the Shifter quality's animal: its line moves to that form's entry, uid kept; owner ruling 2026-10-31)
      const form = shifterForms(data).find(e => e.id === op.id)
      if (!form) return no('unknown')
      const line = shifterLine(b, data)
      if (line) Object.assign(line, { id: form.id, name: form.name })
      else b.qualities.push({ uid: newId(), id: form.id, level: 1, name: form.name })
      return OK
    }
  }
}
