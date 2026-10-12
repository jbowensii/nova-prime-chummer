// The server's API: JSON from it, and a file posted with upload progress (Books, Backup, the editors, AI settings)
import { accountHeader, sessionEnded } from './auth'

const UNREACHABLE = 'the server can’t be reached'

/** JSON from the Books API, or an Error carrying the server's own message. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`./api/${path}`, { cache: 'no-store', ...init }).catch(() => {
    throw new Error(UNREACHABLE)
  })
  if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? `the server answered ${r.status}`)
  return (r.status === 204 ? null : r.headers.get('content-type')?.includes('json') ? r.json() : r.text()) as Promise<T>
}

/** POST one file with upload progress (fetch can't report it; a book can be hundreds of MB, a backup GBs); the response text. */
export function sendFile(path: string, file: File, headers: Record<string, string>, onProgress: (pct: number) => void): Promise<string> {
  return new Promise((ok, fail) => {
    const x = new XMLHttpRequest()
    x.open('POST', `./api/${path}`)
    for (const [k, v] of Object.entries({ ...headers, ...accountHeader() })) x.setRequestHeader(k, v)
    x.upload.onprogress = e => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100))
    x.onload = () => {
      if (x.status === 401) {
        // the sign-in form comes up over the page
        sessionEnded()
        return fail(Object.assign(new Error('you were signed out: sign in again, then send it again'), { status: 401 }))
      }
      return x.status < 300
        ? ok(x.responseText)
        : fail(
            Object.assign(
              new Error(
                (() => {
                  try {
                    return JSON.parse(x.responseText).error
                  } catch {
                    return `the server answered ${x.status}`
                  }
                })(),
              ),
              { status: x.status },
            ),
          )
    }
    x.onerror = () => fail(new Error(UNREACHABLE))
    x.send(file)
  })
}
