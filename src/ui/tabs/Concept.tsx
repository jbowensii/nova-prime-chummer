import { ATTRS, type Npc } from '../../model/types'
import { GENDER_LIST, GenderList, NPC_KINDS, NPC_TIERS } from '../bits'
import { useState } from 'react'
import { useEditor } from '../editor'
import { AnarchyRef } from '../AnarchyRef'
import { BACKDROP_NAMES, Face, PortraitEditor } from '../Portrait'

const HINTS = {
  keywords: ['Metatype / social status', 'Origins / home', 'Role / occupation', 'Lifestyle', 'Anything else that defines them'],
  dispositions: ['A motive', 'A shortcoming', 'A habit or addiction', 'How they react under pressure'],
  cues: ['What they say under stress', 'When they win big', 'When they show off', 'Their catchphrase'],
}

export function ConceptTab() {
  const { c, ch, update, edit, career } = useEditor()
  const meta = c.metatypes.get(ch.identity.metatype)
  const [pe, setPe] = useState(false),
    [te, setTe] = useState(false)
  const packages = [...c.packages.values()].filter(p => p.level === ch.level)
  const list = (k: keyof typeof HINTS) => (
    <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend>
        <h3>{k[0].toUpperCase() + k.slice(1)}</h3>
      </legend>
      {HINTS[k].map((hint, i) => (
        <input
          key={i}
          value={ch.narrative[k][i] ?? ''}
          placeholder={hint}
          aria-label={`${k} ${i + 1}`}
          onChange={e =>
            update(d => {
              d.narrative[k][i] = e.target.value
            })
          }
        />
      ))}
    </fieldset>
  )

  const npc = ch.npc,
    noMeta = npc?.kind === 'critter' || npc?.kind === 'spirit'
  const setNpc = (fn: (n: Npc) => void) =>
    update(d => {
      if (d.npc) fn(d.npc)
    })
  return (
    <div className="stack">
      <h2>Concept</h2>
      {npc && (
        <fieldset className="npc-panel grid2" aria-label="NPC">
          <label>
            Kind
            <select
              value={npc.kind}
              onChange={e =>
                update(d => {
                  // an NPC (not a critter or spirit) has a metatype: human when it had none
                  if (!d.npc) return
                  d.npc.kind = e.target.value as Npc['kind']
                  if (d.npc.kind === 'npc' && !d.identity.metatype) d.identity.metatype = 'human'
                })
              }
            >
              {Object.entries(NPC_KINDS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tier
            <select
              value={npc.tier}
              onChange={e =>
                setNpc(n => {
                  n.tier = e.target.value as Npc['tier']
                })
              }
            >
              {Object.entries(NPC_TIERS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Fighting spirit
            <select
              value={npc.fightingSpirit ?? ''}
              onChange={e =>
                setNpc(n => {
                  if (e.target.value) n.fightingSpirit = e.target.value as Npc['fightingSpirit']
                  else delete n.fightingSpirit
                })
              }
            >
              <option value="">Not set</option>
              {['null', 'low', 'high', 'extreme'].map(f => (
                <option key={f} value={f}>
                  {f[0].toUpperCase() + f.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <p className="muted" style={{ alignSelf: 'end' }}>
            {npc.tier === 'prime'
              ? 'A prime NPC is run like a runner, with Edge.'
              : 'A regular NPC has no Edge; its sheet gives each pool’s average hits (CRB p.81).'}
          </p>
        </fieldset>
      )}
      <p className="muted">
        Who are they, what do they do on a run, and what makes them fun to play? Pick 5 Keywords, 4 Dispositions and 4 Cues that fit (CRB p.50, 84).
      </p>
      <div className="grid2">
        <label>
          Street name
          <input
            value={ch.identity.streetName}
            onChange={e =>
              update(d => {
                d.identity.streetName = e.target.value
              })
            }
          />
        </label>
        <label>
          Real name
          <input
            value={ch.identity.name}
            onChange={e =>
              update(d => {
                d.identity.name = e.target.value
              })
            }
          />
        </label>
        <label>
          Gender
          <input
            value={ch.identity.gender ?? ''}
            placeholder="optional"
            list={GENDER_LIST}
            onChange={e =>
              update(d => {
                if (e.target.value.trim()) d.identity.gender = e.target.value
                else delete d.identity.gender
              })
            }
          />
          <GenderList />
        </label>
        <label>
          Metatype
          <AnarchyRef kind="metatypes" id={ch.identity.metatype || undefined} tabbable={false}>
            <select
              value={ch.identity.metatype}
              disabled={career}
              onChange={e =>
                edit(d => {
                  d.identity.metatype = e.target.value
                })
              }
            >
              {(noMeta || !ch.identity.metatype) && <option value="">— none ({npc?.kind === 'spirit' ? 'spirit' : 'critter'}) —</option>}
              {[...c.metatypes.values()].map(m => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </AnarchyRef>
        </label>
        {!npc && (
          <>
            <label>
              Level of play
              <select
                value={ch.level}
                disabled={career}
                onChange={e =>
                  edit(d => {
                    d.level = e.target.value
                    d.package = 'free'
                  })
                }
              >
                {[...c.levels.values()].map(l => (
                  <option key={l.id} value={l.id}>
                    {l.name}: {l.nuyen.toLocaleString('en-US')}¥
                  </option>
                ))}
              </select>
            </label>
            <label>
              Package guide
              <AnarchyRef kind="packages" id={ch.package} tabbable={false}>
                <select
                  value={ch.package}
                  disabled={career}
                  onChange={e =>
                    edit(d => {
                      d.package = e.target.value
                    })
                  }
                >
                  <option value="free">Free allocation</option>
                  {packages.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </AnarchyRef>
            </label>
          </>
        )}
        <label>
          Lifestyle
          <AnarchyRef kind="lifestyles" id={ch.identity.lifestyle ?? 'low'} tabbable={false}>
            <select
              value={ch.identity.lifestyle ?? 'low'}
              onChange={e =>
                update(d => {
                  d.identity.lifestyle = e.target.value
                })
              }
            >
              {[...c.lifestyles.values()].map(l => (
                <option key={l.id} value={l.id}>
                  {l.name}
                  {l.perRun ? ` (${l.perRun > 0 ? '+' : '−'}${Math.abs(l.perRun).toLocaleString('en-US')}¥ per run)` : ''}
                </option>
              ))}
            </select>
          </AnarchyRef>
        </label>
      </div>
      <div className="portrait-row">
        <Face ch={ch} />
        <div className="stack">
          <button className="btn" onClick={() => setPe(true)}>
            {ch.identity.portrait ? 'Change portrait…' : 'Add a portrait…'}
          </button>
          <span className="muted">Backdrop: {ch.identity.backdrop ? BACKDROP_NAMES[ch.identity.backdrop] : 'none'}</span>
        </div>
        <PortraitEditor
          ch={ch}
          open={pe}
          onClose={() => setPe(false)}
          onSave={(portrait, backdrop) => {
            setPe(false)
            update(d => {
              if (portrait) d.identity.portrait = portrait
              else delete d.identity.portrait
              if (backdrop) d.identity.backdrop = backdrop
              else delete d.identity.backdrop
            })
          }}
        />
        <Face ch={ch} token />
        <div className="stack">
          <button className="btn" onClick={() => setTe(true)}>
            {ch.identity.token ? 'Change token…' : 'Set a token…'}
          </button>
          <span className="muted">Token: {ch.identity.token ? 'its own picture' : 'same as portrait'}</span>
        </div>
        <PortraitEditor
          token
          ch={ch}
          open={te}
          onClose={() => setTe(false)}
          onSave={token => {
            setTe(false)
            update(d => {
              if (token) d.identity.token = token
              else delete d.identity.token
            })
          }}
        />
      </div>
      {meta && (
        <p className="muted">
          {meta.name}: {ATTRS.map(a => `${a.toUpperCase()} ${meta.ranges[a][0]}–${meta.ranges[a][1]}`).join(', ')}; Edge {meta.edge}
          {meta.racialQuality ? `; ${meta.racialQuality}` : ''}.
          {ch.package !== 'free' && ' The package only guides spending: nuyen can move between categories.'}{' '}
          {c.lifestyles.get(ch.identity.lifestyle ?? 'low')?.text}
        </p>
      )}
      <hr className="sep" />
      <div className="grid2">
        {list('keywords')}
        {list('dispositions')}
        {list('cues')}
      </div>
      <hr className="sep" />
      <label>
        Background
        <textarea
          value={ch.identity.background}
          onChange={e =>
            update(d => {
              d.identity.background = e.target.value
            })
          }
        />
      </label>
      <label>
        Notes
        <textarea
          value={ch.identity.notes}
          onChange={e =>
            update(d => {
              d.identity.notes = e.target.value
            })
          }
        />
      </label>
    </div>
  )
}
