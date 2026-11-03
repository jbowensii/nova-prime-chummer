// Open the owner's own book PDF at a cited page. Entirely browser-side: the file handle lives in this
// browser's IndexedDB and the PDF is opened from an object URL. Nothing is ever fetched or uploaded.
// Written from scratch (the OMA3 reference is GPL-3.0, so nothing is copied from it).

type PickerWindow = Window & {
  showOpenFilePicker?: (o: unknown) => Promise<FileSystemFileHandle[]>
}
type PermHandle = FileSystemFileHandle & {
  queryPermission?: (o: { mode: 'read' }) => Promise<PermissionState>
  requestPermission?: (o: { mode: 'read' }) => Promise<PermissionState>
}

const DB = 'nova-pdf-links'
const STORE = 'handles'
const OFFSETS = 'nova.pdfOffsets.v1'

export const pdfLinksSupported = () => typeof (window as PickerWindow).showOpenFilePicker === 'function'

function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
async function idb<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db()
  return new Promise((res, rej) => {
    const r = f(d.transaction(STORE, mode).objectStore(STORE))
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
const getHandle = (src: string) => idb<PermHandle | undefined>('readonly', s => s.get(src)).catch(() => undefined)

/** Every linked book: its source id and the PDF's file name. */
export async function linkedBooks(): Promise<{ src: string; file: string }[]> {
  const d = await db().catch(() => undefined)
  if (!d) return []
  return new Promise(res => {
    const out: { src: string; file: string }[] = [],
      r = d.transaction(STORE).objectStore(STORE).openCursor()
    r.onsuccess = () => {
      const c = r.result
      if (!c) return res(out)
      out.push({ src: String(c.key), file: (c.value as PermHandle).name ?? '' })
      c.continue()
    }
    r.onerror = () => res(out)
  })
}
export const isLinked = async (src: string) => !!(await getHandle(src))
export const unlink = (src: string) =>
  idb('readwrite', s => s.delete(src)).then(
    () => undefined,
    () => undefined,
  )

function offsets(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(OFFSETS) ?? '{}')
  } catch {
    return {}
  }
}
export const getOffset = (src: string) => offsets()[src] ?? 0
export function setOffset(src: string, n: number) {
  try {
    localStorage.setItem(OFFSETS, JSON.stringify({ ...offsets(), [src]: Number.isFinite(n) ? Math.trunc(n) : 0 }))
  } catch {
    /* storage blocked: the offset just won't stick */
  }
}

/** Open `src`'s PDF at printed page `page`. Returns false if the user cancelled or the file can't be read. */
export async function openPdfAtPage(src: string, page: number): Promise<boolean> {
  // open the tab synchronously (inside the click) so popup blockers allow it
  const tab = window.open('', '_blank')
  try {
    let h = await getHandle(src)
    if (!h) {
      const [picked] = (await (window as PickerWindow).showOpenFilePicker!({
        id: 'nova-pdf',
        types: [{ description: `${src} PDF`, accept: { 'application/pdf': ['.pdf'] } }],
      })) as PermHandle[]
      h = picked
      await idb('readwrite', s => s.put(h, src)).catch(() => undefined) // storage blocked: just re-ask next time
    }
    if ((await h.queryPermission?.({ mode: 'read' })) === 'prompt' && (await h.requestPermission?.({ mode: 'read' })) !== 'granted') throw new Error('denied')
    const url = URL.createObjectURL(await h.getFile())
    const to = `${url}#page=${Math.max(1, page + getOffset(src))}`
    if (tab) tab.location.href = to
    else window.open(to, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60_000) // the tab has loaded it: free the PDF's memory
    return true
  } catch {
    tab?.close()
    return false
  }
}
// ponytail: the Electron desktop build could open its own imported-PDF library path without a picker; not wired.
