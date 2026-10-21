// Data issues and formulas on screen, both games (src/core/shared/formula.ts): the warning badge Game data and the pickers show
// beside an entry the book leaves a value out of (the field, the note, the page), and the edit dialog's "book: none
// printed" under a field.
import { fieldName, formulaText, ISSUE_BOOK, type Formula, type Issue } from '../shared/formula'

/** One badge per issue: "Issue · availability: no value printed · SW p.91". */
export function IssueBadges({ issues, source }: { issues?: Issue[]; source: string }) {
  return (
    <>
      {(issues ?? []).map((x, i) => {
        const what = x.note || `book: ${ISSUE_BOOK[x.code]}`,
          cite = x.page ? `${source} p.${x.page}` : ''
        return (
          <span
            key={i}
            className="issue-badge"
            title={`Needs attention: the ${fieldName(x.field)} (${ISSUE_BOOK[x.code]}). Set it with Edit, or in an override file.`}
          >
            <b>Issue</b> {fieldName(x.field)}: {what}
            {cite && <span className="src"> · {cite}</span>}
          </span>
        )
      })}
    </>
  )
}

/** Under an edit dialog's field: what the book has for it ("book: none printed, p.91") and its formula. */
export function FieldNotes({ field, issues, formulas }: { field: string; issues?: Issue[]; formulas?: Formula[] }) {
  const x = issues?.find(i => i.field === field),
    f = formulas?.find(g => g.field === field)
  if (!x && !f) return null
  return (
    <span className="field-notes">
      {x && (
        <span className="warn">
          book: {ISSUE_BOOK[x.code]}
          {x.page ? ` (p.${x.page})` : ''}
          {x.note ? ` · ${x.note}` : ''}
        </span>
      )}
      {f && <span className="muted">formula: {formulaText(f)}</span>}
    </span>
  )
}
