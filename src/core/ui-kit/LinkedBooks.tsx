import { useEffect, useState } from 'react'
import { getOffset, linkedBooks, pdfLinksSupported, setOffset, unlink } from './pdfLinks'

/** Settings: the rulebook PDFs linked in this browser, each with its page offset and Unlink. */
export function LinkedBooks() {
  const [books, setBooks] = useState<{ src: string; file: string }[] | null>(null)
  const [, bump] = useState(0)
  useEffect(() => {
    void linkedBooks().then(setBooks)
  }, [])
  if (!pdfLinksSupported()) return null
  return (
    <fieldset>
      <legend>Linked rulebooks</legend>
      <p className="muted">Your own PDFs, opened at the cited page. They stay in this browser and are never uploaded.</p>
      {books?.length === 0 && <p className="muted">None yet: click a page reference like “SR6 p.123” to pick a PDF.</p>}
      {books?.map(b => (
        <div key={b.src} role="group" aria-label={`${b.src} PDF`}>
          <b>{b.src}</b> <span className="muted">{b.file}</span>{' '}
          <label>
            Printed page 10 is PDF page
            <input
              type="number"
              aria-label={`${b.src}: PDF page of printed page 10`}
              value={10 + getOffset(b.src)}
              onChange={e => {
                if (e.target.value !== '') setOffset(b.src, Number(e.target.value) - 10)
                bump(n => n + 1)
              }}
            />
          </label>{' '}
          <button
            type="button"
            className="btn"
            aria-label={`Unlink ${b.src}`}
            onClick={() => void unlink(b.src).then(() => setBooks(x => x && x.filter(y => y.src !== b.src)))}
          >
            Unlink
          </button>
        </div>
      ))}
    </fieldset>
  )
}
