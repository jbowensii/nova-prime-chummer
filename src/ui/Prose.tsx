// Book text on the Rules and Game data pages (0.9.1): paragraphs, list items, tables and **bold** / *italic*, from the
// plain text the importer writes (importer/reflow.py). React elements only, never raw HTML. A text from an older import
// still has the PDF's line breaks: lines inside a paragraph join with a space, as in markdown.

export interface Run { t: string; b?: boolean; i?: boolean }
export type Block = { p: string } | { ul: string[] } | { ol: string[] } | { table: string[][] }

const UL = /^[-*•▪◦–]\s+/, OL = /^\d{1,2}[.)]\s+/, FIELD = /^\*\*[^*\n]+(?::\*\*|\*\*:)/, SEP = /^\|[\s:|-]+\|?$/

/** "**Bold** and *italic*" as runs; an asterisk that opens nothing stays as it is. */
export function runs(s: string): Run[] {
  const out: Run[] = []
  for (const part of s.split(/(\*\*[^*]+\*\*|\*[^*\s](?:[^*]*[^*\s])?\*)/)) {
    if (!part) continue
    if (part.length > 4 && part.startsWith('**') && part.endsWith('**')) out.push({ t: part.slice(2, -2), b: true })
    else if (part.length > 2 && part.startsWith('*') && part.endsWith('*') && !part.startsWith('**')) out.push({ t: part.slice(1, -1), i: true })
    else out.push({ t: part })
  }
  return out
}

/** The text's blocks: a blank line ends a paragraph; list items, table rows, headings and "**Label:** value" lines are
 *  their own; any other line joins the one before it. */
export function blocks(text: string): Block[] {
  const out: Block[] = []
  for (const para of text.trim().split(/\n[ \t]*\n/)) {
    let open = false // the last block is a paragraph that the next plain line joins
    for (const line of para.split('\n').map(l => l.trim()).filter(Boolean)) {
      const last = out[out.length - 1]
      if (line.startsWith('|')) {
        if (SEP.test(line)) continue
        const cells = line.replace(/^\||\|$/g, '').split('|').map(c => c.trim())
        if (last && 'table' in last) last.table.push(cells); else out.push({ table: [cells] })
        open = false
      } else if (UL.test(line) || OL.test(line)) {
        const k = UL.test(line) ? 'ul' : 'ol', item = line.replace(k === 'ul' ? UL : OL, '')
        if (last && k in last) (last as Record<string, string[]>)[k].push(item); else out.push(k === 'ul' ? { ul: [item] } : { ol: [item] })
        open = false
      } else if (line.startsWith('#')) {
        out.push({ p: `**${line.replace(/^#+\s*/, '')}**` })
        open = false
      } else if (open && !FIELD.test(line) && last && 'p' in last) {
        last.p = /[A-Za-z]-$/.test(last.p) && /^[a-z]/.test(line) ? last.p + line : `${last.p} ${line}` // (an old import's split word keeps its hyphen)
      } else if (!open && last && ('ul' in last || 'ol' in last) && !FIELD.test(line)) {
        const items = 'ul' in last ? last.ul : last.ol
        items[items.length - 1] += ` ${line}` // a list item's wrapped line
      } else {
        out.push({ p: line })
        open = !FIELD.test(line)
      }
    }
  }
  return out
}

const Runs = ({ s }: { s: string }) => <>{runs(s).map((r, i) => r.b ? <strong key={i}>{r.t}</strong> : r.i ? <em key={i}>{r.t}</em> : r.t)}</>

export function Prose({ text }: { text: string }) {
  return (
    <div className="prose">
      {blocks(text).map((b, i) => 'p' in b ? <p key={i}><Runs s={b.p} /></p>
        : 'ul' in b ? <ul key={i}>{b.ul.map((x, j) => <li key={j}><Runs s={x} /></li>)}</ul>
        : 'ol' in b ? <ol key={i}>{b.ol.map((x, j) => <li key={j}><Runs s={x} /></li>)}</ol>
        : <div key={i} className="scroll-x"><table className="data">
            <thead><tr>{b.table[0].map((c, j) => <th key={j}><Runs s={c} /></th>)}</tr></thead>
            <tbody>{b.table.slice(1).map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k}><Runs s={c} /></td>)}</tr>)}</tbody>
          </table></div>)}
    </div>
  )
}
