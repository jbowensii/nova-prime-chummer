// SR6 admin "Move imported NPCs & Critters to trash" / "Move example characters to trash": the button, its confirm (what
// GET /api/sr6/books/clear/:kind would move, book by book) and the move (POST, server/sr6clear.mjs). Admins only: renders
// nothing for anyone else. Used on the SR6 Books, NPCs & Critters and runners pages; `onDone` refreshes that page's list.
import { useState } from 'react'
import { api } from '../../core/ui-kit/api'
import { because, isAdmin, useMe } from '../../core/ui-kit/auth'
import { Modal } from '../../core/ui-kit/bits'

type Kind = 'npcs' | 'samples'
const TITLE: Record<Kind, string> = { npcs: 'Move imported NPCs & Critters to trash', samples: 'Move example characters to trash' }

export function MoveImportedToTrash({ kind, disabled, onDone }: { kind: Kind; disabled?: boolean; onDone?: () => void }) {
  const admin = isAdmin(useMe())
  const [targets, setTargets] = useState<{ book: string; name: string }[] | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  if (!admin) return null
  const url = `sr6/books/clear/${kind}`
  const open = async () => {
    try {
      setTargets((await api<{ targets: { book: string; name: string }[] }>(url)).targets)
    } catch (e) {
      setMsg(because('Couldn’t list what would be moved', (e as Error).message))
    }
  }
  const move = async () => {
    setTargets(null)
    try {
      const r = await api<{ moved: unknown[]; trash: string }>(url, { method: 'POST' })
      setMsg(`Moved ${r.moved.length} to ${r.trash} (a copy is in Backups).`)
      onDone?.()
    } catch (e) {
      setMsg(because('Couldn’t move them to the trash', (e as Error).message))
    }
  }
  const books = new Set(targets?.map(t => t.book)).size
  return (
    <>
      <button className="btn small" disabled={disabled} onClick={() => void open()}>
        {TITLE[kind]}
      </button>
      {msg && (
        <span className="muted" role="status">
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
            <button className="btn primary" disabled={!targets?.length} onClick={() => void move()}>
              {targets?.length ? `Move ${targets.length} to trash` : 'Nothing to move'}
            </button>
          </>
        }
      >
        {targets && (
          <>
            <p>
              These will disappear from your {kind === 'npcs' ? 'NPC and Critter' : 'Example'} lists and go to the trash folder ({targets.length}{' '}
              {kind === 'npcs' ? 'list file(s)' : 'folder(s)'} from {books} book(s)):
            </p>
            <ul>
              {targets.map(t => (
                <li key={`${t.book}/${t.name}`}>
                  {t.book}/{t.name}
                </li>
              ))}
            </ul>
            <p>
              Your books, your own characters and your custom items are not touched{kind === 'npcs' ? ', nor the critter powers list' : ''}. A copy is kept in
              Backups/sr6-pre-clear-… and the files go to _to_delete/sr6-cleared-…; nothing is deleted. Re-importing brings them back.
            </p>
          </>
        )}
      </Modal>
    </>
  )
}
