// The character library lives in this browser's localStorage. It is a convenience:
// the .ca2.json export is the durable copy, so every call tolerates storage failing.
import type { Character } from '../../model/types'
import { migrate } from '../../engine/file'

const KEY = 'ca2.library.v1'
/** NPCs in browser mode: a key of their own, so the runner list never sees them */
export const NPC_KEY = 'ca2.npcs.v1'
const WEEK = 7 * 24 * 3600 * 1000

export function listCharacters(key = KEY): Character[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '[]').map(migrate)
  } catch {
    return []
  }
}

export function getCharacter(id: string, key = KEY): Character | undefined {
  return listCharacters(key).find(c => c.id === id)
}

export function saveCharacter(ch: Character, key = KEY): { ok: boolean } {
  try {
    const all = listCharacters(key).filter(c => c.id !== ch.id)
    localStorage.setItem(key, JSON.stringify([ch, ...all]))
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

export function deleteCharacter(id: string, key = KEY): { ok: boolean } {
  try {
    localStorage.setItem(key, JSON.stringify(listCharacters(key).filter(c => c.id !== id)))
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

/** Changed since the last export, and that export is over a week old (or never happened). */
export function needsExportReminder(ch: Character, now = Date.now()): boolean {
  const exported = ch.lastExportedAt ? Date.parse(ch.lastExportedAt) : 0
  return Date.parse(ch.updatedAt) > exported && now - exported > WEEK
}
