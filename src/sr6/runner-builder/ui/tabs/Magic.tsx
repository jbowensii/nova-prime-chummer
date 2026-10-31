// Magic or Resonance (shown only for an awakened or emerged runner): a magician's tradition and drain attribute (R: S1
// has no traditions kind), spells and rituals against the free ones, adept powers with their levels and power points (a
// mystic adept buys its own), initiation and metamagics (one its text lets be taken again, by level); a technomancer's
// complex forms, submersion and echoes. What the runner's kind can't learn is offered too, marked (Review's errors
// magic.spellsAllowed, adept.ppBudget, magic.metamagicUser). A spell shows whether its test is opposed and
// whether its threshold counts Essence. Every pick can carry the player's bonuses.
import { useState } from 'react'
import { Modal, Picker, Stepper } from '../../../../core/ui-kit/bits'
import { flag, num, str } from '../../../table-setup/domain/creation'
import { choiceOptions, noteAttr, noteSkill, powerCost, qualityChoice } from '../../domain/creation/budgets'
import { magicCap } from '../../domain/creation/magic'
import { MAGIC_KINDS, metamagicFits, pickMaxLevel, picksFor } from '../../../catalog/domain/data'
import type { Sr6Entry } from '../../../formats/domain/types'
import { pickFlags } from '../view'
import { MAGIC_KIND_LABELS, type PickKind, type Sr6Build } from '../../../formats/domain/character'
import { ATTR_NAMES, n, useSr6Editor } from '../editor'
import { Left } from '../Budgets'
import { Bonuses, ChoiceField, House, Situational } from '../Picker'
import { cardOf, Sr6Ref } from '../EntryRef'
import { Suggest } from './Skills'

const article = (w: string) => (/^[aeiou]/i.test(w) ? 'An' : 'A')
const PICKS: [PickKind, string, string][] = [
  ['spells', 'Spells', 'a spell'],
  ['rituals', 'Rituals', 'a ritual'],
  ['adeptpowers', 'Adept powers', 'an adept power'],
  ['metamagics', 'Metamagics', 'a metamagic'],
  ['complexforms', 'Complex forms', 'a complex form'],
  ['echoes', 'Echoes', 'an echo'],
  ['datastructures', 'Data structures', 'a data structure'],
]

export function MagicTab() {
  const { ch, c, data, cr, budgets, act, edit, update, ro, career } = useSr6Editor()
  const b = ch.build,
    k = MAGIC_KINDS[b.magic],
    allowed = picksFor(b.magic)
  const [adding, setAdding] = useState<PickKind | null>(null)
  const slots = budgets.spellSlots,
    pp = budgets.powerPoints
  const word = k.resonance ? 'complex forms' : 'spells'
  const karma = num(cr, k.resonance ? 'karmaForm' : 'karmaSpell')
  const grade = (key: 'initiation' | 'submersion' | 'transhuman', label: string) => (
    <p className="row">
      {label}
      <Stepper label={label} value={b[key]} min={0} max={99} onChange={to => act({ op: key, delta: to - b[key] })} />
    </p>
  )

  const section = ([kind, title, one]: (typeof PICKS)[number]) => {
    const rows = b.picks.filter(x => x.kind === kind)
    return (
      <section key={kind} className="stack">
        <div className="row">
          <h3 style={{ margin: 0 }}>{title}</h3>
          {!allowed[kind] && (
            <span className="muted">
              {article(MAGIC_KIND_LABELS[b.magic])} {MAGIC_KIND_LABELS[b.magic].toLowerCase()} can’t learn these (CRB p. 67)
            </span>
          )}
          {/* the free slots left for this section (spells and rituals share the pool), or the adept's power points */}
          {(kind === 'spells' || kind === 'rituals') && k.spells && (
            <span className="muted">
              <Left x={slots} /> free
            </span>
          )}
          {kind === 'complexforms' && k.resonance && (
            <span className="muted">
              <Left x={slots} /> free
            </span>
          )}
          {kind === 'adeptpowers' && k.powers && (
            <span className="muted">
              <Left x={pp} /> power points
            </span>
          )}
          {/* one metamagic per initiation grade (CRB p. 167): show chosen of owed so the player knows how many to pick */}
          {kind === 'metamagics' && b.initiation > 0 && (
            <span className="muted">
              {rows.reduce((t, x) => t + (x.level ?? data.levelOf(data.entry('metamagics', x.id)) ?? 1), 0)} of {b.initiation} · {b.initiation} initiation grade
              {b.initiation === 1 ? '' : 's'}
            </span>
          )}
          <span className="spacer" />
          <button className="btn small" onClick={() => setAdding(kind)}>
            Add {one}…
          </button>
        </div>
        {rows.length === 0 ? (
          <p className="muted">None yet.</p>
        ) : (
          <div className="scroll-x">
            <table className="data">
              <tbody>
                {rows.map(x => {
                  const e = data.entry(kind, x.id),
                    power = kind === 'adeptpowers' ? data.powers[x.id] : undefined,
                    name = e?.name ?? x.name ?? x.id
                  const max = pickMaxLevel(data, kind, x.id),
                    co = e && choiceOptions(data, e, b.contacts.map(c => c.name).filter(Boolean)),
                    want = co?.kind,
                    levels = data.siblings(kind, x.id).map(s => data.levelOf(s)!)
                  const chosen =
                    want === 'attribute' ? noteAttr(x.note)?.toUpperCase() : want === 'skill' ? data.skills[noteSkill(data, x.note) ?? '']?.name : undefined
                  return (
                    <tr key={x.uid}>
                      <td>
                        <Sr6Ref kind={kind} id={e?.id}>
                          <b>{name}</b>
                        </Sr6Ref>
                        {!e && <span className="err"> (no longer in the catalog)</span>}
                        {e && (
                          <span className="muted">
                            {' '}
                            {[e.attrs.category, ...pickFlags(e), e.source && `${e.source} p.${e.page}`].filter(Boolean).join(' · ')}
                          </span>
                        )}
                        {co && (
                          <div className="row">
                            <ChoiceField co={co} value={x.note} label={`${name} note`} onChange={v => act({ op: 'pickNote', uid: x.uid, note: v })} />
                            {(want === 'attribute' || want === 'skill') && (
                              <span className={chosen ? 'muted small' : 'err small'}>{chosen ? `For ${chosen}` : `Name the ${want}`}</span>
                            )}
                          </div>
                        )}
                        <Situational line={x} name={name} />
                        <div>
                          <Bonuses uid={x.uid} name={name} bonuses={x.bonuses} rated={max !== null} />
                        </div>
                      </td>
                      <td>
                        {max !== null ? (
                          <Stepper
                            label={`${name} level`}
                            value={x.level ?? 1}
                            min={1}
                            max={Number.isFinite(max) ? max : 99}
                            onChange={level => act({ op: 'powerLevel', uid: x.uid, level })}
                          />
                        ) : (
                          levels.length > 1 && (
                            <Stepper
                              label={`${name} level`}
                              value={data.levelOf(e) ?? 1}
                              min={levels[0]}
                              max={levels.at(-1)!}
                              onChange={level => act({ op: 'powerLevel', uid: x.uid, level })}
                            />
                          )
                        )}
                      </td>
                      <td className="num">{power && (power.cost == null ? '? PP' : `${n(powerCost(data, x))} PP`)}</td>
                      <td className="num">
                        <button className="btn small quiet" aria-label={`Remove ${name}`} onClick={() => act({ op: 'pick', remove: x.uid })}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    )
  }
  const taken = (kind: PickKind, id: string) =>
    pickMaxLevel(data, kind, id) === null && !qualityChoice(data.entry(kind, id)?.name) && b.picks.some(x => x.kind === kind && x.id === id)
  // a metamagic for adepts only (or magicians only) is marked for a runner who may not take it
  const unfit = (e: Sr6Entry) => e.kind === 'metamagics' && !metamagicFits(b.magic, data.metamagics[e.id]?.user)
  const pick = (id: string) => {
    if (adding && !act({ op: 'pick', kind: adding, id })) setAdding(null)
  }

  return (
    <div className="stack">
      <h2>{k.resonance ? 'Resonance' : 'Magic'}</h2>
      {(k.spells || k.resonance) && (
        <p className="muted">
          Free {word}: <Left x={slots} fine={b.method === 'karma' || flag(cr, 'karmaSpellsAtCreation')} />.
          {karma !== undefined && ` Past the free ones, each costs ${karma} karma.`}
        </p>
      )}
      {k.spells && b.method !== 'karma' && !career && (
        <label className="inline">
          <input
            type="checkbox"
            checked={flag(cr, 'karmaSpellsAtCreation')}
            disabled={ro}
            onChange={e =>
              update(d => {
                const rest = (d.rules ?? []).filter(r => r.key !== 'karmaSpellsAtCreation')
                d.rules = [...rest, { key: 'karmaSpellsAtCreation', value: e.target.checked ? 'true' : 'false' }]
              })
            }
          />{' '}
          Buy extra spells at creation (GM permission){num(cr, 'karmaSpell') !== undefined && ` — ${num(cr, 'karmaSpell')} karma each`}
        </label>
      )}
      {k.spells && (
        <div className="row">
          <label className="inline">
            Tradition{' '}
            <Suggest
              label="Tradition"
              value={b.tradition ?? ''}
              options={[]}
              onCommit={t =>
                edit((x: Sr6Build) => {
                  if (t) x.tradition = t
                  else delete x.tradition
                })
              }
            />
          </label>
          <label className="inline">
            Drain attribute{' '}
            <select
              value={b.drainAttr ?? ''}
              onChange={e =>
                edit(x => {
                  if (e.target.value) x.drainAttr = e.target.value as Sr6Build['drainAttr']
                  else delete x.drainAttr
                })
              }
            >
              <option value="">Pick one</option>
              {(['log', 'int', 'cha'] as const).map(a => (
                <option key={a} value={a}>
                  {ATTR_NAMES[a]}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {k.powers && (
        <p className="muted">
          Power points: <Left x={pp} />.
        </p>
      )}
      {k.paysPowers && b.method !== 'pointbuy' && (
        <p className="row">
          Power points bought
          <Stepper
            label="Power points bought"
            value={b.powerPointsBought}
            min={0}
            max={pp.cap}
            onChange={to => act({ op: 'powerPoints', delta: to - b.powerPointsBought })}
          />
          <span className="muted">at most {pp.cap}; each one lowers the free spells</span>
        </p>
      )}
      {/* owner's decisions 5 and 12: the mentor spirit comes with its quality; a mystic adept picks one advantage */}
      {(k.spells || k.powers) && (
        <div className="row">
          <label className="inline">
            Mentor spirit{' '}
            <select aria-label="Mentor spirit" value={b.mentorSpirit ?? ''} onChange={e => act({ op: 'mentor', id: e.target.value || null })}>
              <option value="">None</option>
              {[...c.entries.mentorspirits.values()]
                .sort((a, z) => a.name.localeCompare(z.name))
                .map(e => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
            </select>
          </label>
          {b.mentorSpirit &&
            b.magic === 'mystic-adept' &&
            (flag(cr, 'mentorBothAdvantages') ? (
              <span className="muted">Both its magician’s and adept’s advantages (house rule)</span>
            ) : (
              <label className="inline">
                Advantages{' '}
                <select
                  aria-label="Mentor spirit advantages"
                  value={b.mentorAdvantage ?? ''}
                  onChange={e => act({ op: 'mentor', advantage: (e.target.value || null) as 'magician' | 'adept' | null })}
                >
                  <option value="">Pick one</option>
                  <option value="magician">The magician’s</option>
                  <option value="adept">The adept’s</option>
                </select>
              </label>
            ))}
          {b.mentorSpirit && str(cr, 'mentorSpiritQuality') && (
            <span className="muted">with the {data.qualities[str(cr, 'mentorSpiritQuality')!]?.name ?? 'Mentor Spirit'} quality (Qualities tab)</span>
          )}
        </div>
      )}
      {(k.spells || k.powers) && grade('initiation', 'Initiation grade')}
      {/* where the grade goes: it raises the Magic maximum (magicCap); the runner spends it by raising Magic on Attributes,
          and an adept turns each point of Magic into a power point. Surfaced so the grade's effect isn't invisible. */}
      {(k.spells || k.powers) && b.initiation > 0 && (
        <p className="muted">
          {flag(cr, 'magicAboveSixByGrade')
            ? `Each grade raises the Magic maximum by one${magicCap(b, cr, 'mag', data) !== undefined ? ` (now ${magicCap(b, cr, 'mag', data)})` : ''}. Raise Magic on the Attributes tab to use it${k.powers ? '; an adept gains a power point for each point of Magic' : ''}.`
            : 'This table doesn’t raise the Magic maximum by initiation grade.'}
        </p>
      )}
      {k.resonance && grade('submersion', 'Submersion grade')}
      {/* (the Sixth World Companion's optional Transhumanism, p. 146: a mundane's grades, an Essence hole of 1.0 each) */}
      {!k.spells && !k.powers && !k.resonance && (flag(cr, 'transhumanism') || b.transhuman > 0) && grade('transhuman', 'Transhumanist grade')}
      {/* (data structures, Hack & Slash pp. 70–72: only for a technomancer, or one a runner holds) */}
      {PICKS.filter(([kind]) => kind !== 'datastructures' || allowed.datastructures || b.picks.some(x => x.kind === kind)).map(section)}
      <Modal open={!!adding} onClose={() => setAdding(null)} title={`Add ${PICKS.find(p => p[0] === adding)?.[2] ?? ''}`}>
        {adding && (
          <Picker
            placeholder="Search"
            onPick={pick}
            groups={[...new Set([...c.entries[adding].values()].map(e => e.attrs.category ?? ''))].filter(Boolean).sort()}
            items={[...c.entries[adding].values()]
              .sort((a, z) => a.name.localeCompare(z.name))
              .map(e => {
                const power = adding === 'adeptpowers' ? data.powers[e.id] : undefined
                return {
                  id: e.id,
                  name: e.name,
                  group: e.attrs.category,
                  disabled: taken(adding, e.id),
                  ...cardOf(c, adding, e.id),
                  meta: [
                    e.attrs.category,
                    power &&
                      `${power.costCombat != null ? `${power.costCombat} PP (combat skill), ` : ''}${power.cost ?? '?'} PP${power.perLevel ? (Number.isFinite(power.maxLevel) ? ` a level, up to ${power.maxLevel}` : ' a level') : ''}`,
                    ...pickFlags(e),
                    unfit(e) && `not for ${article(MAGIC_KIND_LABELS[b.magic]).toLowerCase()} ${MAGIC_KIND_LABELS[b.magic].toLowerCase()}`,
                  ]
                    .filter(Boolean)
                    .join(', '),
                  price: `${e.source} p.${e.page}`,
                  search: `${e.source} p.${e.page} ${c.sources.get(e.source)?.name ?? ''}`,
                  label: <House c={c} source={e.source} />,
                }
              })}
          />
        )}
      </Modal>
    </div>
  )
}
