import { openPdfAtPage, getOffset, setOffset, unlink, pdfLinksSupported } from './pdfLinks'

/** "SR6 p.123": a link that opens the owner's own PDF at that page; plain text where the browser can't. */
export function PageLink({ source, page }: { source: string; page: number | string }) {
  const text = `${source} p.${page}`
  const n = Number(page)
  if (!pdfLinksSupported() || !source || !Number.isFinite(n)) return <>{text}</>
  const settings = () => {
    const v = window.prompt(
      `${source}: printed page 10 is PDF page ___ (enter a number; 10 means no offset). Type "unlink" to forget this PDF.`,
      String(10 + getOffset(source)),
    )
    if (v === null) return
    if (v.trim().toLowerCase() === 'unlink') void unlink(source)
    else if (Number.isFinite(Number(v))) setOffset(source, Number(v) - 10)
  }
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
      <button type="button" className="linkish" title={`PDF page offset / unlink for ${source}`} aria-label={`PDF settings for ${source}`} onClick={settings}>
        ⚙
      </button>
    </>
  )
}
