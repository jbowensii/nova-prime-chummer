// The GM can correct any ledger line by hand: each kind of line takes only its own fields, and a field left out keeps its value.
import { expect, test } from 'vitest'
import { editEntry, earn, note, voidEntry, balances } from '../../../src/sr6/runner-builder/domain/career/career'
import { blankSr6 } from '../../../src/sr6/formats/domain/character'

const NOW = '2026-10-31T10:00:00.000Z'
function ledger() {
  let ch = blankSr6('karma', 'c1', NOW)
  ch.ledger = [{ id: 'f1', at: NOW, type: 'finalize', karma: 100, nuyen: 5000 }]
  ch = earn(ch, 5, 1000, 'Run A', '2026-11-01', NOW)
  ch = note(ch, 'met a fixer', NOW)
  const earned = ch.ledger[1].id,
    noted = ch.ledger[2].id
  const v = voidEntry(ch, noted, 'oops', NOW)
  if (!v.ok) throw new Error(v.reason)
  return { ch: v.ch, earned, noted, voided: v.ch.ledger[3].id }
}

test('a correction changes only the fields that kind of line has', () => {
  const { ch, earned, noted, voided } = ledger()
  const edited = editEntry(
    editEntry(editEntry(editEntry(ch, 'f1', { karma: 80, text: 'ignored' }), earned, { nuyen: 1500, run: 'Run B', date: '2026-12-01' }), noted, {
      text: 'met a fence',
      karma: 99,
    }),
    voided,
    {
      reason: 'wrong run',
    },
  )
  expect(edited.ledger[0]).toMatchObject({ type: 'finalize', karma: 80, nuyen: 5000 })
  expect(edited.ledger[1]).toMatchObject({ type: 'earn', karma: 5, nuyen: 1500, run: 'Run B', date: '2026-12-01' })
  expect(edited.ledger[2]).toEqual({ id: noted, at: NOW, type: 'note', text: 'met a fence' })
  expect(edited.ledger[3]).toMatchObject({ type: 'void', reason: 'wrong run' })
})

test('re-totalling follows a correction, and an unknown id changes nothing', () => {
  const { ch, earned } = ledger()
  expect(balances(editEntry(ch, earned, { karma: 50 })).karma).toBe(150)
  expect(editEntry(ch, 'nope', { karma: 1 }).ledger).toEqual(ch.ledger)
})
