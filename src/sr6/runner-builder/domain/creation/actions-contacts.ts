// Build actions, contact, knowledge, lifepath, SIN, licence, karma-conversion and magic-grade ops (split from actions.ts; apply() in actions.ts dispatches here).
import { activeRules } from './rule-markers'
import { knowledgeNuyenAvailable } from './rule-markers'
import { languageCap, nativeMax } from './skills'
import { newId } from '../../../../core/shared/types'
import { CONTACT_TYPES, CORE_ATTRS, licenceRating, rateLicences, type Sr6Attr, type Sr6Build } from '../../../formats/domain/character'
import { flag, num, str, TRANSHUMAN_MAX, type CreationRules } from '../../../table-setup/domain/creation'
import { MAGIC_KINDS, type Sr6Data } from '../../../catalog/domain/data'
import { makeProvider } from './providers'
import { toNuyenMax } from './budgets'
import { no, OK, step, removeBy, type OpOf, type Result } from './actions-helpers'
export function applyContacts(
  b: Sr6Build,
  op: OpOf<
    | 'contact'
    | 'knowledge'
    | 'knowledgePayment'
    | 'knowledgeRank'
    | 'cp'
    | 'lifemodule'
    | 'bestAttr'
    | 'lifestyle'
    | 'sin'
    | 'licence'
    | 'karmaToNuyen'
    | 'karmaToDeck'
    | 'mentor'
    | 'transhuman'
    | 'initiation'
    | 'submersion'
  >,
  data: Sr6Data,
  cr: CreationRules,
): Result {
  switch (op.op) {
    case 'contact': {
      if ('remove' in op)
        return removeBy(b.contacts, op.remove, l => {
          b.contacts = l
        })
      const { op: _, uid, ...patch } = op
      if ((patch.connection ?? 1) < 1 || (patch.loyalty ?? 1) < 1) return no('below-one')
      // All Business (SWC p. 135, RULE MAX_3_CONTACT_LOYALTY): no contact's Loyalty above 3
      if ((patch.loyalty ?? 0) > 3 && activeRules(b, data).has('MAX_3_CONTACT_LOYALTY')) return no('loyalty-max-3')
      if (patch.types) {
        // one or two types, each once (a contact gains its second from a module of another type)
        const types = [...new Set(patch.types)]
        if (types.length > 2 || types.some(t => !CONTACT_TYPES.includes(t))) return no('bad-types')
        if (types.length) patch.types = types
        else delete patch.types
        if (!types.length && uid) delete b.contacts.find(x => x.uid === uid)?.types
      }
      if (!uid) {
        b.contacts.push({ uid: newId(), name: '', archetype: '', connection: 1, loyalty: 1, ...patch })
        return OK
      }
      const c = b.contacts.find(x => x.uid === uid)
      if (!c) return no('unknown-line')
      Object.assign(c, patch)
      return OK
    }
    case 'knowledge': {
      if ('remove' in op)
        return removeBy(b.knowledge, op.remove, l => {
          b.knowledge = l
        })
      if (!op.uid) {
        if (op.native && b.knowledge.filter(x => x.native).length >= nativeMax(b, data)) return no('one-native')
        // a native language is free; anything else starts with one point
        b.knowledge.push({
          uid: newId(),
          name: op.name ?? '',
          kind: op.kind ?? 'knowledge',
          ...(op.native ? { native: true as const, points: 0 } : { points: 1 }),
          karma: 0,
        })
        return OK
      }
      const k = b.knowledge.find(x => x.uid === op.uid)
      if (!k) return no('unknown-line')
      if (op.name !== undefined) k.name = op.name
      if (op.kind) k.kind = op.kind
      // owner's decision 6: one native language a runner
      if (op.native && !k.native && b.knowledge.filter(x => x.native).length >= nativeMax(b, data)) return no('one-native')
      if (op.native) {
        k.native = true
        k.points = 0
      } else if (op.native === false) delete k.native
      // a nuyen-paid flag only lives on a non-native Knowledge line; drop it when the row stops being one, so it can't
      // silently reactivate (and cost 0 karma again) if the line is later changed back to a Knowledge skill
      if (k.kind !== 'knowledge' || k.native) delete k.payment
      return OK
    }
    case 'knowledgePayment': {
      const k = b.knowledge.find(x => x.uid === op.uid)
      if (!k) return no('unknown-line')
      if (op.payment === 'nuyen') {
        if (k.native || k.kind !== 'knowledge' || !knowledgeNuyenAvailable(b, data)) return no('knowledge-nuyen-unavailable')
        k.payment = 'nuyen'
      } else delete k.payment
      return OK
    }
    case 'knowledgeRank': {
      const k = b.knowledge.find(x => x.uid === op.uid)
      if (!k) return no('unknown-line')
      if (k.native) return no('native')
      // (owner 2026-10-11: no language above languageMax; the Native one counts as that level)
      const most = languageCap(b, data, num(cr, 'languageMax'))
      if (k.kind === 'language' && most !== undefined && op.delta > 0 && k.points + k.karma + op.delta > most) return no('language-max')
      return step(
        () => k[op.pool],
        v => {
          k[op.pool] = v
        },
        op.delta,
      )
    }
    case 'cp':
      if (b.method !== 'pointbuy') return no('not-point-buy')
      return step(
        () => b.cp[op.pool],
        v => {
          b.cp[op.pool] = v
        },
        op.delta,
      )
    case 'lifemodule': {
      if (b.method !== 'lifepath') return no('not-lifepath')
      if ('remove' in op) {
        const i = op.at ?? b.lifepath.map(m => m.id).lastIndexOf(op.remove)
        if (b.lifepath[i]?.id !== op.remove) return no('not-taken')
        const owned = Object.values(b.lifepath[i].lines ?? {})
        b.knowledge = b.knowledge.filter(k => !owned.includes(k.uid)) // undo: the lines its picks created go with it
        b.lifepath.splice(i, 1)
        return OK
      }
      if (op.choice !== undefined) {
        const pk = op.at !== undefined ? (b.lifepath[op.at]?.id === op.id ? b.lifepath[op.at] : undefined) : b.lifepath.find(m => m.id === op.id)
        const c = data.lifemodules[op.id]?.choices[op.choice]
        if (!pk) return no('not-taken')
        if (!c) return no('unknown-choice')
        if (!c.options.includes(op.pick)) return no('unknown-option')
        if (c.kind === 'knowledge') {
          // the pick owns one Knowledge line (by uid), paid from the module's knowledge points as any other; it renames
          // only that line. A skill the runner already knows (bought, or another pick's) is refused, never taken over
          const mine = pk.lines?.[op.choice]
          const line = b.knowledge.find(k => k.uid === mine)
          if (b.knowledge.some(k => k !== line && k.name === op.pick)) return no('already-known')
          if (line) line.name = op.pick
          else {
            const uid = newId()
            b.knowledge.push({ uid, name: op.pick, kind: 'knowledge', points: 1, karma: 0 })
            pk.lines = { ...pk.lines, [op.choice]: uid }
          }
        }
        pk.choices[op.choice] = op.pick
        return OK
      }
      // (an adult module the runner's magic kind doesn't fit is taken: Review's lifepath.requires)
      const avail = (makeProvider(b.method, data, cr).available?.(b) ?? []).find(m => m.id === op.id)
      if (!avail) return no('not-available')
      if (avail.taken && !avail.again) return no('already-taken')
      const cap = num(cr, 'lifepath.moduleCount')
      if (cap !== undefined && b.lifepath.length >= cap) return no('module-count')
      b.lifepath.push({ id: op.id, choices: {} })
      return OK
    }
    case 'bestAttr': {
      if (b.method !== 'lifepath') return no('not-lifepath')
      const special = (a?: Sr6Attr | null) => !!a && !CORE_ATTRS.includes(a)
      if (special(op.attr) || special(op.extra)) return no('not-core') // never Edge, Magic or Resonance
      if (op.attr) b.bestAttr = op.attr
      else {
        delete b.bestAttr
        delete b.bestExtra
      }
      if (op.extra !== undefined) {
        if (op.extra && op.attr) b.bestExtra = op.extra
        else delete b.bestExtra
      }
      return OK
    }
    case 'lifestyle': {
      const s = b.sins.find(x => x.uid === op.sin)
      if (!s) return no('unknown-line')
      const ls = s.lifestyles ?? []
      if ('remove' in op)
        return removeBy(ls, op.remove, l => {
          if (l.length) s.lifestyles = l
          else delete s.lifestyles
        })
      if (op.id !== undefined && !data.entry('lifestyles', op.id)) return no('unknown-entry')
      if (op.months !== undefined && op.months < 1) return no('below-one')
      if (!op.uid) {
        if (op.id === undefined) return no('unknown-entry')
        s.lifestyles = [...ls, { uid: newId(), id: op.id, months: op.months ?? 1 }]
        return OK
      }
      const l = ls.find(x => x.uid === op.uid)
      if (!l) return no('unknown-line')
      if (op.id !== undefined) l.id = op.id
      if (op.months !== undefined) l.months = op.months
      return OK
    }
    case 'sin': {
      if ('remove' in op)
        return removeBy(b.sins, op.remove, l => {
          b.sins = l
        })
      if (op.rating !== undefined && op.rating < 1) return no('below-one')
      if (!op.uid) {
        const kind = op.kind ?? 'fake'
        b.sins.push({
          uid: newId(),
          name: op.name ?? '',
          kind,
          ...(kind === 'fake' ? { rating: op.rating ?? 1 } : {}),
          ...(op.gender?.trim() ? { gender: op.gender } : {}),
          licences: [],
        })
        return OK
      }
      const s = b.sins.find(x => x.uid === op.uid)
      if (!s) return no('unknown-line')
      // a kind change: a fake SIN gets a rating (1 unless given), a real one has none
      const kind = op.kind ?? s.kind,
        rating = kind === 'fake' ? (op.rating ?? (s.kind === 'fake' ? s.rating : undefined) ?? 1) : undefined
      s.kind = kind
      if (rating === undefined) delete s.rating
      else s.rating = rating
      // (its licences take its rating: re-priced with it; owner 2026-10-16)
      rateLicences(s)
      if (op.name !== undefined) s.name = op.name
      // named, or its kind or rating set: a placeholder is a normal SIN now
      if (op.name !== undefined || op.kind !== undefined || op.rating !== undefined) delete s.placeholder
      if (op.gender !== undefined) {
        if (op.gender.trim()) s.gender = op.gender
        else delete s.gender
      }
      return OK
    }
    case 'licence': {
      const s = b.sins.find(x => x.uid === op.sin)
      if (!s) return no('unknown-line')
      if ('remove' in op) {
        if (!s.licences[op.remove]) return no('unknown-line')
        s.licences.splice(op.remove, 1)
        return OK
      }
      // (a licence is rated as its SIN; renaming one is reversible, a blank name refused)
      const name = op.name.trim()
      if (!name) return no('needs-name')
      if (op.at === undefined) s.licences.push({ name, rating: licenceRating(s) })
      else if (s.licences[op.at]) s.licences[op.at].name = name
      else return no('unknown-line')
      return OK
    }
    case 'karmaToNuyen': {
      const v = b.karmaToNuyen + op.delta,
        max = toNuyenMax(b, cr, data)
      if (v < 0) return no('below-zero')
      if (max !== undefined && v > max) return no('conversion-cap')
      b.karmaToNuyen = v
      return OK
    }
    case 'karmaToDeck': {
      if (!activeRules(b, data).has('DECK_5000_PER_KARMA')) return no('rule-inactive')
      if (b.karmaToDeck + op.delta < 0) return no('below-zero')
      b.karmaToDeck += op.delta
      return OK
    }
    case 'mentor': {
      const mentor = str(cr, 'mentorSpiritQuality')
      if (op.id !== undefined) {
        if (op.id && !data.entry('mentorspirits', op.id)) return no('unknown-entry')
        const had = mentor ? b.qualities.filter(q => q.id === mentor) : []
        if (op.id) {
          b.mentorSpirit = op.id
          if (mentor && !had.length && data.qualities[mentor]) b.qualities.push({ uid: newId(), id: mentor, level: 1, name: data.qualities[mentor].name })
        } else {
          delete b.mentorSpirit
          delete b.mentorAdvantage
          b.qualities = b.qualities.filter(q => q.id !== mentor || q.free)
        }
      }
      if (op.advantage !== undefined) {
        if (op.advantage && b.magic !== 'mystic-adept') return no('not-mystic-adept')
        if (op.advantage) b.mentorAdvantage = op.advantage
        else delete b.mentorAdvantage
      }
      return OK
    }
    case 'transhuman': {
      // the Sixth World Companion's Transhumanism (p. 146): only with the rule on, only for a mundane, up to the 20 grades the rule allows
      const k = MAGIC_KINDS[b.magic],
        v = b.transhuman + op.delta
      if (v < 0) return no('below-zero')
      if (op.delta > 0 && !flag(cr, 'transhumanism')) return no('rule-off')
      if (k.spells || k.powers || k.resonance) return no('not-mundane')
      if (v > TRANSHUMAN_MAX) return no('at-maximum')
      b.transhuman = v
      return OK
    }
    case 'initiation':
    case 'submersion': {
      const k = MAGIC_KINDS[b.magic],
        v = b[op.op] + op.delta
      if (v < 0) return no('below-zero')
      if (op.op === 'initiation' ? !k.spells && !k.powers : !k.resonance) return no(op.op === 'initiation' ? 'not-awakened' : 'not-emerged')
      b[op.op] = v
      return OK
    }
  }
}
