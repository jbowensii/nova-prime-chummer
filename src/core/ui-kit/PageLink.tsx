import { openPdfAtPage, pdfLinksSupported } from './pdfLinks'

/** SettingsButton listens for this and opens Settings (its Linked rulebooks list). */
export const OPEN_LINKED_BOOKS = 'nova:open-linked-books'

/** "SR6 p.123": a link that opens the owner's own PDF at that page; plain text where the browser can't. */
export function PageLink({ source, page }: { source: string; page: number | string }) {
  const text = `${source} p.${page}`
  const n = Number(page)
  if (!pdfLinksSupported() || !source || !Number.isFinite(n)) return <>{text}</>
  return (
    <>
      <a
        href="#pdf"
        title="Open your own copy of this book at this page (picked once, kept only in this browser)"
        onClick={e => {
          e.preventDefault()
          void openPdfAtPage(source, n)
        }}
      >
        {text}
      </a>
      <button
        type="button"
        className="linkish"
        title={`Linked rulebooks: page offset / unlink (${source})`}
        aria-label={`PDF settings for ${source}`}
        onClick={() => window.dispatchEvent(new Event(OPEN_LINKED_BOOKS))}
      >
        ⚙
      </button>
    </>
  )
}
