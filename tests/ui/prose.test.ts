import { describe, expect, it } from 'vitest'
import { blocks, runs } from '../../src/ui/Prose'

// src/ui/Prose.tsx on made-up text: the book text's blocks and its bold and italic runs (no raw HTML anywhere)
describe('Prose', () => {
  it('reads **bold** and *italic*; a lone asterisk stays', () => {
    expect(runs('A **zap** gun, *very* loud, 2 * 3')).toEqual([{ t: 'A ' }, { t: 'zap', b: true }, { t: ' gun, ' }, { t: 'very', i: true }, { t: ' loud, 2 * 3' }])
    expect(runs('<b>not html</b>')).toEqual([{ t: '<b>not html</b>' }])
  })

  it('paragraphs at blank lines; an older import’s line breaks join as in markdown', () => {
    expect(blocks('The made-up gun\nhums when\nready.\n\nA second one.')).toEqual([{ p: 'The made-up gun hums when ready.' }, { p: 'A second one.' }])
    expect(blocks('Ask the gamemas-\nter.')).toEqual([{ p: 'Ask the gamemas-ter.' }])
  })

  it('list items, label lines, headings and tables keep their own lines', () => {
    expect(blocks('**Cost:** 5\n**Avail:** 2\nPlain text\ngoes on.\n- one\nwraps\n- two\n1. first\n# Head\n| A | B |\n|---|---|\n| 1 | 2 |')).toEqual([
      { p: '**Cost:** 5' }, { p: '**Avail:** 2' }, { p: 'Plain text goes on.' }, { ul: ['one wraps', 'two'] }, { ol: ['first'] },
      { p: '**Head**' }, { table: [['A', 'B'], ['1', '2']] },
    ])
  })
})
