// Picker: the player's bonuses on a line or pick and a line's situational effects (the switches and the add-a-bonus dialog).
// Moved out of Picker.tsx unchanged; Picker.tsx re-exports them.
import { sitOf } from '../../catalog/domain/effects'
import { useState } from 'react'
import { Modal } from '../../../core/ui-kit/bits'
import { effectsOf, situations } from '../domain/creation/budgets'
import { BONUS_TARGETS, type Bonus, type Sr6Pick, type Sr6Purchase, type Sr6Quality } from '../../formats/domain/character'
import type { Sr6Data } from '../../catalog/domain/data'
import { ATTR_NAMES, useSr6Editor } from './editor'

const targetName = (t: Bonus['target']) =>
  t === 'initDice'
    ? 'Initiative dice'
    : t === 'defense'
      ? 'Defense Rating'
      : t === 'physical'
        ? 'Physical monitor boxes'
        : t === 'stun'
          ? 'Stun monitor boxes'
          : t === 'overflow'
            ? 'Damage Overflow boxes'
            : t === 'skill'
              ? 'Skill dice pool'
              : t === 'unarmedAR'
                ? 'Unarmed Attack Rating'
                : t === 'unarmedDV'
                  ? 'Unarmed DV'
                  : t === 'movement'
                    ? 'Movement (metres)'
                    : t === 'moveWalk'
                      ? 'Move (metres)'
                      : t === 'moveSprint'
                        ? 'Sprint (metres)'
                        : t === 'moveHit'
                          ? 'Sprint metres a hit'
                          : t === 'matrixInitDice'
                            ? 'Matrix initiative dice'
                            : ATTR_NAMES[t]
/** `+1 Agility`, `+2 Firearms dice` (a skill by its catalog name) */
export const bonusText = (x: Bonus, data: Pick<Sr6Data, 'skills'>) =>
  `${x.set ? x.value : `${x.value >= 0 ? '+' : '−'}${Math.abs(x.value)}`} ${
    x.target === 'skill' ? `${data.skills[x.skill ?? '']?.name ?? x.skill ?? 'skill'} dice` : targetName(x.target)
  }${x.perRating ? ' × rating' : ''}${x.set ? ' (sets)' : ''}`

/** A line's situational effects (`in animal form`, `per additional barrel`): a switch each, or a count for a `per ...` one. On,
 *  it counts in the total; off, only in the bracket (owner, 2026-10-29). */
export function Situational({ line, name }: { line: Sr6Purchase | Sr6Pick | Sr6Quality; name: string }) {
  const { act, data, ch } = useSr6Editor()
  const list = situations(ch.build, data, effectsOf(data, line))
  if (!list.length) return null
  return (
    <span className="row bonuses">
      {list.map(({ i, key, bonus, scales }) => {
        const times = sitOf(line.sit, bonus, i),
          label = `${bonusText(bonus, data)}, ${bonus.when}, on ${name}`
        return (
          <label key={i} className="chip">
            {scales ? (
              <input
                type="number"
                min={0}
                max={99}
                value={times}
                aria-label={`How many: ${label}`}
                onChange={e => act({ op: 'situational', uid: line.uid, key, times: Number(e.target.value) })}
              />
            ) : (
              <input
                type="checkbox"
                role="switch"
                checked={times > 0}
                aria-label={label}
                onChange={e => act({ op: 'situational', uid: line.uid, key, times: e.target.checked ? 1 : 0 })}
              />
            )}{' '}
            {bonusText(bonus, data)} {bonus.when}
          </label>
        )
      })}
    </span>
  )
}

/** The player's bonuses on a line or pick (R: the catalog has no bonus data), each removable, and a dialog to add one: to
 *  an attribute, initiative dice, the Defense Rating or one skill's dice pool. */
export function Bonuses({ uid, name, bonuses, rated: hasRating }: { uid: string; name: string; bonuses?: Bonus[]; rated?: boolean }) {
  const { act, data } = useSr6Editor()
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState<Bonus['target']>('agi'),
    [value, setValue] = useState('1'),
    [per, setPer] = useState(false)
  // (sorted only while the dialog is open: every purchase line has one of these)
  const skills = open ? Object.values(data.skills).sort((a, z) => a.name.localeCompare(z.name)) : []
  const [skill, setSkill] = useState('')
  const list = bonuses ?? [],
    v = Number(value),
    sk = skill || skills[0]?.id
  const add = () => {
    if (
      !act({
        op: 'bonus',
        uid,
        bonuses: [...list, { target, ...(target === 'skill' ? { skill: sk } : {}), value: v, ...(per ? { perRating: true as const } : {}) }],
      })
    )
      setOpen(false)
  }
  return (
    <span className="row bonuses">
      {list.map((x, i) => (
        <span key={i} className="chip">
          {bonusText(x, data)}
          <button aria-label={`Remove ${bonusText(x, data)} from ${name}`} onClick={() => act({ op: 'bonus', uid, bonuses: list.filter((_, j) => j !== i) })}>
            ×
          </button>
        </span>
      ))}
      <button className="btn small quiet" aria-label={`Add a bonus to ${name}`} onClick={() => setOpen(true)}>
        Bonus…
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Bonus for ${name}`}
        actions={
          <>
            <button className="btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="btn primary" disabled={!Number.isFinite(v) || v === 0 || (target === 'skill' && !sk)} onClick={add}>
              Add bonus
            </button>
          </>
        }
      >
        <p className="muted">What it adds to the runner while it has it.</p>
        <div className="row">
          <label className="inline">
            Bonus to{' '}
            <select value={target} onChange={e => setTarget(e.target.value as Bonus['target'])}>
              {BONUS_TARGETS.map(t => (
                <option key={t} value={t}>
                  {targetName(t)}
                </option>
              ))}
            </select>
          </label>
          {target === 'skill' && (
            <label className="inline">
              Skill{' '}
              <select value={sk ?? ''} onChange={e => setSkill(e.target.value)}>
                {skills.map(x => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="inline">
            Value <input type="number" step={1} value={value} onChange={e => setValue(e.target.value)} style={{ width: '5rem' }} />
          </label>
          {hasRating && (
            <label className="inline">
              <input type="checkbox" checked={per} onChange={e => setPer(e.target.checked)} /> × rating
            </label>
          )}
        </div>
      </Modal>
    </span>
  )
}
