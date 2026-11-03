// Build actions, quality, pick, power-level, martial-art and technique ops (split from actions.ts; apply() in actions.ts dispatches here).
import { newId } from '../../../../core/shared/types'
import { type Sr6Build } from '../../../formats/domain/character'
import { flag, str, type CreationRules } from '../../../table-setup/domain/creation'
import { pickMaxLevel, qualityFitsMetatype, type Sr6Data } from '../../../catalog/domain/data'
import { learned } from './martial'
import { qualityChoice } from './budgets'
import { infectedOff } from '../assets/critterware'
import { infectedOf, optionalPower, powerRefusal, runnerInfected } from './infected'
import { no, OK, step, sameChoice, opposite, removeBy, type OpOf, type Result } from './actions-helpers'
import { infect } from './actions-setters'
export function applyQualities(
  b: Sr6Build,
  op: OpOf<'quality' | 'pick' | 'pickNote' | 'powerLevel' | 'martialart' | 'technique' | 'powerPoints'>,
  data: Sr6Data,
  cr: CreationRules,
): Result {
  switch (op.op) {
    case 'quality': {
      if ('remove' in op) {
        const q = b.qualities.find(x => x.uid === op.remove)
        if (!q) return no('not-taken')
        if (q.free) return no('free-trait')
        if (runnerInfected(b, data)?.line === q) return infect(b, '', data, cr)
        b.qualities = b.qualities.filter(x => x !== q)
        // (owner's decision 5: the mentor spirit goes with its quality)
        const mentor = str(cr, 'mentorSpiritQuality')
        if (q.id === mentor && !b.qualities.some(x => x.id === mentor)) {
          delete b.mentorSpirit
          delete b.mentorAdvantage
        }
        return OK
      }
      // an Infected quality or optional power, new to the runner, only while the table allows Infected characters (SWC p. 104)
      const e0 = data.entry('qualities', op.id),
        had = b.qualities.some(x => x.id === op.id)
      if (infectedOff(e0, cr) && !had) return no('rule-off')
      // (an Infected type is the runner's one type: infect; an optional power only from its list, and at creation only
      // the free pick unless the table's infectedPowersAtCreation says otherwise: infected.ts powerRefusal)
      if (infectedOf(e0) && !had) return infect(b, op.id, data, cr)
      if (optionalPower(e0)) {
        const why = had ? undefined : powerRefusal(b, data, cr, op.id, true)
        if (why) return no(why)
        if ((op.level ?? 1) > 1 && !flag(cr, 'infectedPowersAtCreation')) return no('infected-after-creation')
      }
      // a family of levels (levels.ts): the level's own entry, its line at level 1; a level the family lacks is refused
      const fam = data.family('qualities', op.id)
      if (fam) {
        // (a repeatable one, Matrix Attribute Advancement: one line per choice, each with its own level; the line is named by uid)
        const multi = !!data.qualities[op.id]?.multi
        const cur = multi
          ? op.uid
            ? b.qualities.find(x => x.uid === op.uid)
            : undefined
          : b.qualities.find(x => !x.free && data.family('qualities', x.id) === fam)
        if (multi && !op.uid && sameChoice(b, data, op.id, op.note)) return no('duplicate-choice')
        if (multi && op.uid && !cur) return no('not-taken')
        if (multi && cur && op.note !== undefined && sameChoice(b, data, op.id, op.note, cur.uid)) return no('duplicate-choice')
        if (op.level !== undefined && op.level < 1) return no('below-one')
        const e = data.atLevel('qualities', op.id, op.level ?? data.levelOf(data.entry('qualities', op.id)) ?? Math.min(...fam.levels.keys()))
        if (!e) return no('max-level')
        // (its note, the attribute or skill it is for, as on any quality)
        if (op.note !== undefined && cur) {
          const t = op.note.trim().slice(0, 200)
          if (t) cur.note = t
          else delete cur.note
          if (op.level === undefined && op.karma === undefined) return OK
        }
        if (cur && cur.id === e.id && op.karma === undefined) return no('already-taken')
        const v = data.qualities[e.id]
        if (op.karma !== undefined && (v.karmaMax == null || op.karma < Math.abs(v.karma ?? 0) || op.karma > Math.abs(v.karmaMax))) return no('karma-range')
        if (cur) {
          cur.id = e.id
          cur.level = 1
          cur.name = v.name
          if (op.karma !== undefined) cur.karma = op.karma
        } else
          b.qualities.push({
            uid: newId(),
            id: e.id,
            level: 1,
            name: v.name,
            ...(op.karma !== undefined ? { karma: op.karma } : {}),
            ...(multi && op.note?.trim() ? { note: op.note.trim().slice(0, 200) } : {}),
          })
        return OK
      }
      const v = data.qualities[op.id]
      if (!v) return no('unknown-entry')
      const taken = op.uid ? b.qualities.find(x => x.uid === op.uid && x.id === op.id) : b.qualities.find(x => x.id === op.id && !x.free)
      if (op.uid && !taken) return no('not-taken')
      // owner's decision 4: a poser quality only for the metatypes its description names
      if (!taken && !qualityFitsMetatype(data, b.metatype, op.id)) return no('not-for-metatype')
      // owner's decision 2: Aptitude and Incompetent never on the same skill (exact opposites)
      if (op.note !== undefined && opposite(b, data, cr, op.id, op.note, taken?.uid)) return no('aptitude-incompetent')
      if (op.note !== undefined && taken) {
        if (sameChoice(b, data, op.id, op.note, taken.uid)) return no('duplicate-choice')
        const t = op.note.trim().slice(0, 200)
        if (t) taken.note = t
        else delete taken.note
      }
      // (a quality naming its choice is taken again for another: CRB Hong Kong p. 71, "once per attribute")
      const again = !op.uid && (!!v.multi || !!qualityChoice(v.name)) && op.level === undefined && op.karma === undefined && op.note === undefined
      if (taken && again && sameChoice(b, data, op.id, undefined)) return no('duplicate-choice')
      if (taken && !again && op.level === undefined && op.karma === undefined) return op.note !== undefined ? OK : no('already-taken')
      const level = op.level ?? taken?.level ?? 1
      if (level !== 1 && !v.perLevel) return no('no-levels')
      if (level < 1) return no('below-one')
      if (v.perLevel && level > (v.maxLevel ?? Infinity)) return no('max-level')
      if (
        op.karma !== undefined &&
        (v.karmaMax == null ||
          op.karma < Math.abs(v.karma ?? 0) ||
          op.karma > Math.abs(v.karmaMax) ||
          (v.karmaSteps?.length && !v.karmaSteps.map(Math.abs).includes(op.karma)))
      )
        return no('karma-range')
      if (taken && !again) {
        taken.level = level
        if (op.karma !== undefined) taken.karma = op.karma
      } else b.qualities.push({ uid: newId(), id: op.id, level, name: v.name, ...(op.karma !== undefined ? { karma: op.karma } : {}) })
      return OK
    }
    case 'pick': {
      if ('remove' in op) {
        if (!b.picks.some(x => x.uid === op.remove)) return no('not-taken')
        b.picks = b.picks.filter(x => x.uid !== op.remove)
        return OK
      }
      const e = data.entry(op.kind, op.id)
      if (!e) return no('unknown-entry')
      // a family of levels (levels.ts): taken again, the line moves to the next level's entry
      const fam = data.family(op.kind, op.id)
      if (fam) {
        const cur = b.picks.find(x => x.kind === op.kind && data.family(op.kind, x.id) === fam),
          curLevel = cur ? (data.levelOf(data.entry(op.kind, cur.id)) ?? 1) : 0
        const asked = data.levelOf(e)
        if (cur && asked !== undefined && asked <= curLevel) return no('duplicate')
        const next = data.atLevel(op.kind, op.id, asked ?? (cur ? curLevel + 1 : Math.min(...fam.levels.keys())))
        if (!next) return no('max-level')
        if (cur) {
          cur.id = next.id
          cur.name = next.name
        } else b.picks.push({ uid: newId(), kind: op.kind, id: next.id, name: next.name })
        return OK
      }
      const max = pickMaxLevel(data, op.kind, op.id)
      // (a power naming its choice is bought again for another: Improved Ability "can be purchased for multiple skills",
      // CRB Hong Kong p. 157)
      const had = !qualityChoice(e.name) && b.picks.find(x => x.kind === op.kind && x.id === op.id)
      if (had) {
        // a leveled power is bought per level, a metamagic taken again is one more: taking it again raises the level
        if (max === null) return no('duplicate')
        if ((had.level ?? 1) >= max) return no('max-level')
        had.level = (had.level ?? 1) + 1
        return OK
      }
      b.picks.push({ uid: newId(), kind: op.kind, id: op.id, name: e.name, ...(max !== null ? { level: 1 } : {}) })
      return OK
    }
    case 'pickNote': {
      const x = b.picks.find(p => p.uid === op.uid)
      if (!x) return no('not-taken')
      const t = op.note.trim().slice(0, 200)
      if (t) x.note = t
      else delete x.note
      return OK
    }
    case 'powerLevel': {
      const x = b.picks.find(p => p.uid === op.uid)
      if (!x) return no('not-taken')
      if (data.family(x.kind, x.id)) {
        // (a family of levels: that level's entry)
        if (op.level < 1) return no('below-one')
        const e = data.atLevel(x.kind, x.id, op.level)
        if (!e) return no('max-level')
        x.id = e.id
        x.name = e.name
        delete x.level
        return OK
      }
      const max = pickMaxLevel(data, x.kind, x.id)
      if (max === null) return no('no-levels')
      if (op.level < 1) return no('below-one')
      if (op.level > max) return no('max-level')
      x.level = op.level
      return OK
    }
    case 'martialart': {
      if ('remove' in op)
        return removeBy(b.martialArts, op.remove, l => {
          b.martialArts = l
        })
      const e = data.entry('martialarts', op.id),
        sig = op.signature ? data.entry('martialtechniques', op.signature) : undefined
      if (!e || (op.signature && !sig)) return no('unknown-entry')
      if (b.martialArts.some(m => m.id === op.id)) return no('already-taken')
      if (sig && learned(b).some(t => t.id === sig.id)) return no('already-taken')
      b.martialArts.push({ uid: newId(), id: op.id, name: e.name, techniques: sig ? [{ uid: newId(), id: sig.id, name: sig.name }] : [] })
      return OK
    }
    case 'technique': {
      const m = b.martialArts.find(x => x.uid === op.style)
      if (!m) return no('unknown-line')
      if ('remove' in op)
        return removeBy(m.techniques, op.remove, l => {
          m.techniques = l
        })
      const e = data.entry('martialtechniques', op.id)
      if (!e) return no('unknown-entry')
      // FS p. 97: each technique is learned once, under whichever style
      if (learned(b).some(t => t.id === op.id)) return no('already-taken')
      m.techniques.push({ uid: newId(), id: op.id, name: e.name })
      return OK
    }
    case 'powerPoints':
      return step(
        () => b.powerPointsBought,
        v => {
          b.powerPointsBought = v
        },
        op.delta,
      )
  }
}
