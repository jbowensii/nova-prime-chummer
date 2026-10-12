// 0.5.5 career model: Finalize is a check and a ledger entry; nothing is locked; every build change after it is logged
// with its price (a removal refunds); balance = budget + earnings - build price (+ carry from a pre-0.5.5 ledger).
// Made-up catalog (tests/fixtures/mini) and invented runners only.
import { readFileSync } from 'node:fs'
import { test, expect } from 'vitest'
import { validateXML } from 'xmllint-wasm'
import {
  appendEvent,
  balance,
  changeText,
  currentBuild,
  finalize,
  ledgerRunning,
  logChange,
  makeAdvance,
  makeAmpAdd,
  makeAmpModify,
  makeBuy,
  makeEarn,
  makeSell,
  reopen,
  settle,
  voidEvent,
} from '../../src/engine/career'
import { characterToXml, xmlToCharacter } from '../../src/engine/charxml'
import { blankCharacter, setRealSin } from '../../src/engine/file'
import { price } from '../../src/engine/price'
import { validate } from '../../src/engine/validate'
import type { Character } from '../../src/model/types'
import { cat, legacy } from '../helpers'

const P = cat.pricing
const runner = () => {
  const ch = blankCharacter()
  ch.identity.streetName = 'Test Pilot'
  ch.build.attributes = { str: 2, agi: 3, wil: 2, log: 2, cha: 2 }
  ch.build.skills = [{ id: 'stealth', rating: 2, specs: [] }]
  ch.build.items.push({ uid: 'knife', kind: 'weapon', name: 'Made-up knife' })
  return ch
}
/** an edit the way the editor makes one: a changed copy, then logged */
const edit = (ch: Character, fn: (d: Character) => void) => {
  const d = structuredClone(ch)
  fn(d)
  return logChange(cat, ch, d)
}
const changes = (ch: Character) => ch.career.filter(e => e.type === 'change')
const skill = (ch: Character, id: string) => ch.build.skills.find(s => s.id === id)!

test('Finalize: a "Creation finished" entry with what is left, which is the balance', () => {
  const ch = finalize(cat, runner())
  const left = price(cat, runner()).remaining
  expect(ch.career).toEqual([expect.objectContaining({ type: 'finalize', remaining: left })])
  expect([ch.carry, ch.finalRemaining, balance(cat, ch)]).toEqual([undefined, left, left])
})

test('after Finalize every change is logged and priced: a raise charges, lowering refunds, stepping merges into one line', () => {
  let ch = finalize(cat, runner())
  const start = balance(cat, ch)
  ch = edit(ch, d => {
    skill(d, 'stealth').rating = 3
  })
  ch = edit(ch, d => {
    skill(d, 'stealth').rating = 4
  })
  expect(changes(ch)).toHaveLength(1)
  expect(changes(ch)[0]).toMatchObject({ cost: 2 * P.skillLow })
  expect(changeText((changes(ch)[0] as { changes: never[] }).changes[0])).toBe(`${cat.skills.get('stealth')!.name}: 2 → 4`)
  expect(balance(cat, ch)).toBe(start - 2 * P.skillLow)
  ch = edit(ch, d => {
    skill(d, 'stealth').rating = 1
  }) // below where it was: the entry now refunds
  expect(changes(ch)[0]).toMatchObject({ cost: -P.skillLow })
  expect(balance(cat, ch)).toBe(start + P.skillLow)
  ch = edit(ch, d => {
    skill(d, 'stealth').rating = 2
  }) // back where it was: nothing left to log
  expect(changes(ch)).toHaveLength(0)
  expect(balance(cat, ch)).toBe(start)
})

test('nothing is locked: removing an item refunds its price and the nuyen can be spent again', () => {
  let ch = appendEvent(finalize(cat, runner()), makeEarn(1000, 'Made-up job', '2086-01-01'))
  const start = balance(cat, ch)
  ch = edit(ch, d => {
    d.build.items = d.build.items.filter(i => i.uid !== 'knife')
  })
  expect(balance(cat, ch)).toBe(start + P.weaponStandard)
  ch = edit(ch, d => {
    d.build.items.push({ uid: 'rope', kind: 'gear', name: 'Made-up rope' })
  })
  expect(balance(cat, ch)).toBe(start + P.weaponStandard - P.equipment)
  expect(changes(ch).map(e => (e as { changes: never[] }).changes.map(changeText))).toEqual([['Removed Made-up knife'], ['Added Made-up rope']])
  expect(changes(ch).map(e => (e as { cost: number }).cost)).toEqual([-P.weaponStandard, P.equipment])
})

test('different things in one edit are one entry; layout and identity edits log nothing', () => {
  let ch = finalize(cat, runner())
  ch = edit(ch, d => {
    d.build.attributes.agi = 4
    d.build.skills.push({ id: 'athletics', rating: 1, specs: [] })
  })
  expect(changes(ch)).toHaveLength(1)
  ch = edit(ch, d => {
    d.identity.notes = 'x'
    d.build.knowledgeHidden = ['k']
  })
  expect(changes(ch)).toHaveLength(1)
})

test('creation caps apply before Finalize only', () => {
  const draft = runner()
  draft.build.skills = [{ id: 'stealth', rating: 6, specs: [] }] // made-up Pro cap: 4
  expect(validate(cat, draft).some(v => v.code === 'skill.cap')).toBe(true)
  const ch = edit(finalize(cat, runner()), d => {
    skill(d, 'stealth').rating = 6
  })
  expect(validate(cat, ch).some(v => v.code === 'skill.cap')).toBe(false)
})

test('the real SIN can be ticked after Finalize; it is logged, free', () => {
  let ch = finalize(cat, runner())
  const start = balance(cat, ch)
  ch = edit(ch, d => setRealSin(cat, d.build, true))
  const lines = changes(ch)[0] as { changes: never[]; cost: number }
  expect(lines.changes.map(changeText)).toEqual(expect.arrayContaining(['Added SINner (rating 0)', 'Added Real SIN']))
  expect([lines.cost, balance(cat, ch)]).toEqual([0, start])
  expect(validate(cat, ch).some(v => v.code === 'amp.qualityAfterCreation')).toBe(false) // house rule: not a Quality buy
})

test('a Quality added after Finalize needs a GM', () => {
  const ch = edit(finalize(cat, runner()), d => {
    d.build.amps.push({ uid: 'q', type: 'quality', name: 'Made-up luck', narrative: '', effects: [] })
  })
  expect(validate(cat, ch).some(v => v.code === 'amp.qualityAfterCreation' && v.path === 'amps.q')).toBe(true)
})

test('reopen: while no earnings are recorded; the log stays, with a note', () => {
  const ch = edit(finalize(cat, runner()), d => {
    skill(d, 'stealth').rating = 3
  })
  const back = reopen(cat, ch)
  expect([back.finalizedAt, back.carry, back.finalRemaining]).toEqual([undefined, undefined, undefined])
  expect(price(cat, back).remaining).toBe(balance(cat, ch))
  expect(back.career.at(-1)).toMatchObject({ type: 'note', text: 'Creation reopened' })
  expect(() => reopen(cat, appendEvent(ch, makeEarn(500, 'Made-up job', '2086-01-01')))).toThrow(/earnings/)
  // a voided payout doesn't count
  const e = makeEarn(500, 'Made-up job', '2086-01-01')
  expect(() => reopen(cat, voidEvent(appendEvent(ch, e), e.id, 'typo'))).not.toThrow()
})

test('a pre-0.5.5 runner converts: build folded, history and earnings kept, balance unchanged; settling twice is the same', () => {
  let old = legacy(finalize(cat, runner()))
  old = appendEvent(old, makeEarn(40000, 'Made-up run', '2086-02-01'))
  old = appendEvent(old, makeAdvance(cat, old, 'skills.stealth', 3))
  old = appendEvent(old, makeBuy(cat, { uid: 'rope', kind: 'gear', name: 'Made-up rope' }))
  old = appendEvent(old, makeSell('knife')) // the old ledger gave nothing back for it
  const amp = { uid: 'ware', type: 'cyberware', name: 'Made-up ware', narrative: '', effects: [{ ref: 'rr-skill', param: 'stealth' }] }
  const add = makeAmpAdd(cat, old, amp) as { cost: number }
  old = appendEvent(old, add as never)
  old = appendEvent(old, makeAmpModify(cat, old, { ...amp, effects: [] })) // lowered: no refund then
  const oldBalance = 40000 + old.finalRemaining! - P.skillLow - P.equipment - add.cost
  expect(balance(cat, old)).toBe(oldBalance)

  const s = settle(cat, old)
  expect(settle(cat, s)).toBe(s)
  expect(s.build).toEqual(currentBuild(old))
  expect(s.build.items.map(i => i.uid)).not.toContain('knife')
  expect(s.career[0]).toMatchObject({ type: 'finalize', remaining: old.finalRemaining })
  expect(s.career.slice(1)).toEqual(old.career)
  expect(balance(cat, s)).toBe(oldBalance)
  // the sold knife and the lowered amp weren't refunded then; they stay that way
  expect(balance(cat, s)).toBeLessThan(price(cat, s).remaining + 40000)
  // from here on it works like any finalized runner
  const next = edit(s, d => {
    d.build.items = d.build.items.filter(i => i.uid !== 'rope')
  })
  expect(balance(cat, next)).toBe(oldBalance + P.equipment)
  // saved and read back
  const back = xmlToCharacter(characterToXml(s))
  expect(back.ok && balance(cat, back.character)).toBe(oldBalance)
})

test('an unchanged pre-0.5.5 runner keeps its balance to the nuyen', () => {
  const old = legacy(finalize(cat, runner()))
  const s = settle(cat, old)
  expect([balance(cat, s), balance(cat, old)]).toEqual([old.finalRemaining, old.finalRemaining])
  const paid = appendEvent(old, makeEarn(12345, 'Made-up run', '2086-02-01'))
  expect(balance(cat, settle(cat, paid))).toBe(old.finalRemaining! + 12345)
})

test('the new entries and a reopened runner’s carry survive XML and match the schema', async () => {
  let ch = finalize(cat, runner())
  ch = edit(ch, d => {
    skill(d, 'stealth').rating = 3
    d.build.items.push({ uid: 'rope', kind: 'gear', name: 'Rope & <knots>' })
  })
  ch = { ...ch, carry: -2500 }
  const xml = characterToXml(ch)
  const back = xmlToCharacter(xml)
  expect(back.ok && back.character).toEqual(ch)
  const xsd = readFileSync('public/data/schema/character.xsd', 'utf8')
  const v = await validateXML({ xml: { fileName: 'c.xml', contents: xml }, schema: { fileName: 'character.xsd', contents: xsd } })
  expect(v.errors.map(e => e.message)).toEqual([])
})

test('balances use the prices recorded when each change was made: a later price change moves nothing', () => {
  let ch = edit(finalize(cat, runner()), d => {
    skill(d, 'stealth').rating = 3
  })
  const before = balance(cat, ch)
  const dearer = { ...cat, pricing: { ...cat.pricing, skillLow: cat.pricing.skillLow * 2, weaponStandard: 1 } }
  expect(balance(dearer, ch)).toBe(before)
  const rows = ledgerRunning(ch)
  expect(rows.at(-1)!.running).toBe(before) // the Ledger's running total is the footer
  // the next change is priced at the new rate
  const d = structuredClone(ch)
  skill(d, 'stealth').rating = 4
  ch = logChange(dearer, ch, d)
  expect(balance(dearer, ch)).toBe(before - 2 * cat.pricing.skillLow)
})

test('reopen and finalize again never makes nuyen: a pre-0.5.5 runner with an unrefunded sale, no earnings', () => {
  let old = legacy(finalize(cat, runner()))
  old = appendEvent(old, makeSell('knife')) // sold for nothing then
  const bal = balance(cat, old)
  const back = reopen(cat, old)
  expect(back.carry).toBe(-P.weaponStandard)
  expect(price(cat, back).remaining).toBe(bal)
  expect(balance(cat, back)).toBe(bal)
  const again = finalize(cat, back)
  expect([balance(cat, again), again.carry]).toEqual([bal, undefined])
  expect(balance(cat, finalize(cat, reopen(cat, again)))).toBe(bal)
})

test('fuzz: whatever is added, removed, changed or renamed after Finalize, balance - earnings = budget - build price', () => {
  let seed = 55
  const rnd = (n: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed % n
  }
  const pick = <T>(xs: T[]) => xs[rnd(xs.length)]
  const effects = ['rr-skill', 'armor-plus', 'dv-plus', 'wound-light', 'init-1', 'narrative', 'negative']
  for (let run = 0; run < 20; run++) {
    let ch = finalize(cat, runner())
    let earned = 0
    for (let step = 0; step < 60; step++) {
      const op = rnd(11)
      if (op === 0) {
        const e = makeEarn(1000 * (1 + rnd(9)), 'Made-up run', '2086-01-01')
        ch = appendEvent(ch, e)
        earned += e.type === 'earn' ? e.amount : 0
      } else
        ch = edit(ch, d => {
          const b = d.build
          switch (op) {
            case 1:
              b.items.push({
                uid: `i${run}-${step}`,
                kind: pick(['gear', 'weapon', 'armor', 'spell'] as const),
                name: `Thing ${step}`,
                armor: rnd(4),
                specialist: !!rnd(2),
                ...(rnd(4) ? {} : { price: rnd(3) * 5000 - 2500 }),
              })
              break
            case 2: {
              const it = b.items.filter(i => !i.starting)
              if (it.length) b.items = b.items.filter(i => i !== pick(it))
              break
            }
            case 3: {
              const it = b.items.filter(i => !i.starting)
              if (it.length) pick(it).name += 'x'
              break
            }
            case 4: {
              const id = pick(['stealth', 'athletics', 'perception'])
              const s = b.skills.find(x => x.id === id)
              if (s) s.rating = rnd(9)
              else b.skills.push({ id, rating: rnd(9), specs: [] })
              break
            }
            case 5: {
              const s = b.skills[0]
              if (s) s.specs = s.specs.length ? [] : ['stealth.palming']
              break
            }
            case 6:
              b.amps.push({
                uid: `a${run}-${step}`,
                type: pick(['quality', 'cyberware', 'cyberdeck', 'vehicle']),
                name: rnd(3) ? `Amp ${step}` : 'SINner',
                narrative: '',
                effects: Array.from({ length: rnd(3) }, () => ({ ref: pick(effects), param: 'stealth', value: 1 + rnd(4) })),
                vehicle: 'sedan',
              })
              break
            case 7:
              if (b.amps.length) b.amps = b.amps.filter(a => a !== pick(b.amps))
              break
            case 8:
              if (b.amps.length) {
                const a = pick(b.amps)
                a.effects = rnd(2) ? [] : [...a.effects, { ref: pick(effects), param: 'stealth', value: 1 + rnd(4) }]
                if (!rnd(3)) a.name = pick(['SINner', 'Renamed'])
              }
              break
            case 9:
              b.attributes[pick(['str', 'agi', 'wil', 'log', 'cha'] as const)] = 1 + rnd(5)
              break
            case 10:
              if (rnd(2)) b.knowledge.push({ id: `k${step}`, name: `Lore ${step}`, kind: 'knowledge' })
              else b.knowledge.pop()
              break
          }
        })
      const p = price(cat, ch)
      expect(balance(cat, ch) - earned, `run ${run} step ${step}`).toBe(p.budget - p.total)
      expect(ledgerRunning(ch).at(-1)!.running).toBe(balance(cat, ch))
    }
  }
})

test('removing gives back what was paid, not today’s price: a price raise can’t be turned into nuyen', () => {
  let ch = finalize(cat, runner()) // the knife was bought at creation at the standard weapon price
  ch = edit(ch, d => {
    d.build.items.push({ uid: 'rope', kind: 'gear', name: 'Made-up rope' })
  }) // after Finalize
  const start = balance(cat, ch)
  const dearer = { ...cat, pricing: { ...cat.pricing, weaponStandard: P.weaponStandard * 3, equipment: P.equipment * 3, skillLow: P.skillLow * 3 } }
  const change = (c: typeof cat, x: Character, fn: (d: Character) => void) => {
    const d = structuredClone(x)
    fn(d)
    return logChange(c, x, d)
  }
  // remove both: the creation price and the price paid after Finalize come back
  let y = change(dearer, ch, d => {
    d.build.items = d.build.items.filter(i => i.uid !== 'knife' && i.uid !== 'rope')
  })
  expect(balance(dearer, y)).toBe(start + P.weaponStandard + P.equipment)
  // add them again at today's price: no profit
  y = change(dearer, y, d => {
    d.build.items.push({ uid: 'knife', kind: 'weapon', name: 'Made-up knife' }, { uid: 'rope', kind: 'gear', name: 'Made-up rope' })
  })
  expect(balance(dearer, y)).toBe(start - 2 * P.weaponStandard - 2 * P.equipment)
  // lowering a skill gives back the share paid (2 points bought at creation at the old price)
  y = change(dearer, ch, d => {
    skill(d, 'stealth').rating = 1
  })
  expect(balance(dearer, y)).toBe(start + P.skillLow)
  const back = xmlToCharacter(characterToXml(y))
  expect(back.ok && back.character.career).toEqual(y.career)
})

test('removing an amp effect after Finalize is replacing it with nothing (p.84): the effect’s cost comes back', () => {
  const amp = { uid: 'ware', type: 'cyberware', name: 'Made-up ware', narrative: '', effects: [{ ref: 'rr-skill', param: 'stealth' }, { ref: 'armor-plus' }] }
  const ch = finalize(cat, { ...runner(), build: { ...runner().build, amps: [amp] } })
  const next = edit(ch, d => {
    d.build.amps[0].effects = [{ ref: 'rr-skill', param: 'stealth' }]
  })
  const armor = cat.ampEffects.get('armor-plus')!.rating * P.ampPoint
  expect(changes(next).at(-1)!.cost).toBe(-armor)
  expect(balance(cat, next)).toBe(balance(cat, ch) + armor)
  // at creation alike (owner decision 7, 2026-10-10): the build's price drops by the effect's rating × an amp point
  const both = { ...runner(), build: { ...runner().build, amps: [amp] } },
    one = { ...runner(), build: { ...runner().build, amps: [{ ...amp, effects: amp.effects.slice(0, 1) }] } }
  expect(price(cat, one).remaining - price(cat, both).remaining).toBe(armor)
})

test('finalizing a finalized runner changes nothing: the ledger keeps one start and the balance its earnings built', () => {
  const ch = appendEvent(finalize(cat, runner()), makeEarn(1000, 'Made-up job', '2086-01-01'))
  const again = finalize(cat, ch)
  expect(again).toBe(ch)
  expect(again.career.filter(e => e.type === 'finalize')).toHaveLength(1)
  expect(balance(cat, again)).toBe(price(cat, runner()).remaining + 1000)
  expect(ledgerRunning(again).at(-1)?.running).toBe(balance(cat, again))
})
