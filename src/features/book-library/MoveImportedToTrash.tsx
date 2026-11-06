// SR6 admin "Move imported NPCs & Critters to trash" / "Move example characters to trash": the button, its confirm (how
// many loaded book copies GET /api/sr6/books/clear/:kind would move, per user) and the move (POST, server/sr6clear.mjs). Admins only: renders
// nothing for anyone else. Used on the SR6 Books, NPCs & Critters and runners pages; `onDone` refreshes that page's list.
import { Icon } from '../../core/ui-kit/icons'
import { useState } from 'react'
import { api } from '../../core/ui-kit/api'
import { because, isAdmin, useMe } from '../../core/ui-kit/auth'
import { Modal } from '../../core/ui-kit/bits'

type Kind = 'npcs' | 'samples'
type Plan = { users: { user: string; count: number }[]; kept: number }
const TITLE: Record<Kind, string> = { npcs: 'Move imported NPCs & Critters to trash', samples: 'Move example characters to trash' }

export function MoveImportedToTrash({ kind, disabled, onDone }: { kind: Kind; disabled?: boolean; onDone?: () => void }) {
  const admin = isAdmin(useMe())
  const [targets, setTargets] = useState<Plan | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  if (!admin) return null
  const url = `sr6/books/clear/${kind}`
  const open = async () => {
    try {
      setTargets(await api<Plan>(url))
    } catch (e) {
      setMsg(because('Couldn’t list what would be moved', (e as Error).message))
    }
  }
  const move = async () => {
    setTargets(null)
    try {
      const r = await api<{ moved: number; trash: string }>(url, { method: 'POST' })
      setMsg(`Moved ${r.moved} to the trash. A copy is in Backups.`)
      onDone?.()
    } catch (e) {
      setMsg(because('Couldn’t move them to the trash', (e as Error).message))
    }
  }
  const total = targets?.users.reduce((n, u) => n + u.count, 0) ?? 0
  return (
    <>
      <button className="btn quiet ibtn" disabled={disabled} aria-label={TITLE[kind]} title={TITLE[kind]} onClick={() => void open()}>
        <Icon name="recycle" />
      </button>
      {msg && (
        <span className="muted bar-note" role="status">
          {msg}
        </span>
      )}
      <Modal
        open={!!targets}
        onClose={() => setTargets(null)}
        title={TITLE[kind]}
        actions={
          <>
            <button className="btn" onClick={() => setTargets(null)}>
              Cancel
            </button>
            <button className="btn primary" disabled={!total} onClick={() => void move()}>
              {total ? `Move ${total} to trash` : 'Nothing to move'}
            </button>
          </>
        }
      >
        {targets && (
          <>
            <p>
              These {total} loaded book {kind === 'npcs' ? 'NPCs and critters' : 'example characters'} will disappear from your{' '}
              {kind === 'npcs' ? 'NPC and Critter' : 'Example'} lists and go to the trash folder:
            </p>
            <ul>
              {targets.users.map(u => (
                <li key={u.user}>
                  {u.user}: {u.count}
                </li>
              ))}
            </ul>
            <p>
              Kept: {targets.kept} {kind === 'npcs' ? 'hand-made NPCs' : 'player characters'} (anything not loaded from a book). Your books and your custom
              items are not touched. A copy is kept in Backups/sr6-pre-clear-… and the files go to _to_delete/cleared-samples-… with a moves.csv; nothing is
              deleted. Loading them again from the books brings them back.
            </p>
          </>
        )}
      </Modal>
    </>
  )
}
