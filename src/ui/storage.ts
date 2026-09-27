// The character library lives in this browser's localStorage. It is a convenience:
// the .ca2.json export is the durable copy, so every call tolerates storage failing.
import type { Character } from '../model/types'

const KEY = 'ca2.library.v1'
const WEEK = 7 * 24 * 3600 * 1000

export function listCharacters(): Character[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
}

export function getCharacter(id: string): Character | undefined {
  return listCharacters().find(c => c.id === id)
}

export function saveCharacter(ch: Character): { ok: boolean } {
  try {
    const all = listCharacters().filter(c => c.id !== ch.id)
    localStorage.setItem(KEY, JSON.stringify([ch, ...all]))
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

export function deleteCharacter(id: string): { ok: boolean } {
  try {
    localStorage.setItem(KEY, JSON.stringify(listCharacters().filter(c => c.id !== id)))
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
