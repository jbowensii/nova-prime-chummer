// saveAsNew (src/ui/repo.ts): an import whose id turns out taken (a list not loaded yet) is saved once more under a
// fresh id instead of being refused as "changed elsewhere".
import { expect, test } from 'vitest'
import { saveAsNew } from '../../src/ui/repo'
import { type SaveResult } from '../../src/core/ui-kit/repoContext'

const store = (taken: string[]) => {
  const saved: string[] = []
  const save = async (ch: { id: string }): Promise<SaveResult> => {
    if (taken.includes(ch.id)) return { ok: false, conflict: { rev: 1, file: `${ch.id}.xml` } }
    saved.push(ch.id)
    return { ok: true }
  }
  return { saved, save }
}

test('a taken id: saved again under a fresh one', async () => {
  const s = store(['r1'])
  const { ch, r } = await saveAsNew(s.save, { id: 'r1', name: 'Made-up Mara' }, () => 'r2')
  expect([r.ok, ch, s.saved]).toEqual([true, { id: 'r2', name: 'Made-up Mara' }, ['r2']])
})

test('a free id is saved as it is; a refusal that is no conflict is passed on', async () => {
  const s = store([])
  expect((await saveAsNew(s.save, { id: 'r1' }, () => 'r2')).ch.id).toBe('r1')
  const refused = await saveAsNew(
    async () => ({ ok: false, error: 'too big' }),
    { id: 'r3' },
    () => 'r4',
  )
  expect([refused.ch.id, refused.r]).toEqual(['r3', { ok: false, error: 'too big' }])
})
