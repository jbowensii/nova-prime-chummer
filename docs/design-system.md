# Design system: the Anarchy 2.0 book look

The app is styled after the published *Shadowrun: Anarchy 2.0 Alternative
Core Rulebook* v1.8 PDF. Everything here was observed in that PDF: colors
were read from its vector fills and text colors, fonts from its embedded font
list, and layout from rendered pages (cover, p.61, 83, 88, 144). The CSS
(`src/ui/app.css`, `src/print/sheet.css`) follows this document.

## What the book looks like

- **Paper.** Pages are light: an off-white sheet with faint grey grunge and
  spray-paint texture, not a dark cyberpunk screen.
- **Body text** is a humanist serif (Warnock Pro, 9.8pt) in near-black ink.
- **Headings** use a squared techno display face (Stolzl Display) in rust,
  all caps:
  - chapter-level heads have a thick yellow bar that runs out to the page
    edge;
  - section heads have a yellow underline bar under just the words;
  - minor heads are smaller rust caps with no bar.
- **Tables:**
  - an indigo title bar with white caps;
  - a second indigo band with white column heads;
  - white and cream zebra rows in Rethink Sans with hairline rules;
  - a bold first row per group;
  - notes rows sit on cream.
- **Sidebars:** an indigo panel with halftone dots fading in from one edge.
  A yellow header strip carries the title in light display caps, with body
  text in Rethink Sans, in white on indigo or ink on cream.
- **Page furniture:**
  - yellow paint strokes across the top corner, carrying the "ANARCHY" /
    "SHADOWRUN" logotype in a brush face (BMX Radical);
  - big graffiti page numbers in the bottom corner;
  - the chapter name set vertically in yellow on the outer edge.
- **Pregen names** are rust caps. Their role line ("Social adept face, male
  dwarf") is set in white caps on a rust bar.
- **Inline emphasis** in running text is bold yellow-gold (named products).
  Bullets are small yellow circles.

## Tokens

| Token | Hex | Book use |
|---|---|---|
| `--ink` | `#12120c` | body text, rules |
| `--paper` | `#f5f4f0` | page (the book's white plus grunge) |
| `--cream` | `#fcf1d1` | zebra rows, notes rows, sidebar bodies |
| `--yellow` | `#f1bb00` | paint strokes, underline bars, column-head band, page numbers |
| `--rust` | `#7b361e` | headings, pregen role bar |
| `--indigo` | `#36305b` | table title bars, sidebars |
| `--indigo-deep` | `#25204b` | sidebar edges, deep panels |
| `--oxblood` | `#581500` | dark emphasis text |
| `--grey` | `#555756` | secondary text |

**Dark theme** (a toggle, not in the book): built from the book's own
sidebar. The ground is `--indigo-deep`, panels are `--indigo`, text is
cream, headings are yellow, and rust is lifted to `#c86a45` for contrast.

## Type

| Role | Book font | App font (free) | Fallback order |
|---|---|---|---|
| Display / headings | Stolzl Display | Goldman (the face Daegann's lists use to echo the book) | `"Stolzl Display", Goldman` |
| Body prose | Warnock Pro | Crimson Pro | `"Warnock Pro", "Crimson Pro"` |
| Tables, sidebars, UI | Rethink Sans | Rethink Sans (the same, free) | `"Rethink Sans"` |
| Graffiti | BMX Radical / Cut the Crap | Permanent Marker | `"BMX Radical", "Permanent Marker"` |

Each stack names the book font first, so installing licensed copies of
Warnock Pro, Stolzl Display or BMX Radical makes the app use them with no
code change.

## Texture levels (Settings)

| Level | Adds |
|---|---|
| **Flat** | palette and fonts only; plain paper, no strokes, no halftones |
| **Accents** (default) | paper grain; a yellow paint stroke behind the top bar's logotype; yellow heading bars; halftone dots in indigo panels |
| **Full** | everything in Accents, plus graffiti tab labels, a vertical chapter tab on the page edge, and a painted edge on the receipt panel |

## Components

| App piece | Book source |
|---|---|
| Top bar | page header: paper, yellow paint stroke, brush logotype |
| Tabs | display caps; the active tab gets a yellow bar underneath |
| Page title (`h2`) | section head: rust caps with a yellow underline bar |
| Sub-heads (`h3`) | minor head: rust caps |
| Data tables | book tables: indigo head band, cream zebra rows |
| The receipt | a sidebar: indigo panel, yellow title strip, halftone dots |
| Dialogs | a sidebar on paper: indigo title strip, cream body |
| Primary button | a yellow band with ink text (the column-head band) |
| Chips | cream with a rust hairline |
| Printed sheet | book tables and headings on white; the full-color option adds paper and paint |

## Rules

- Rust and yellow carry meaning (headings, money, primary action). Don't
  add other accent colors.
- Keep tables clean: textures never sit behind numbers.
- All-caps is only for display-face headings and table heads, as in the
  book.
- Check contrast in both themes: rust on paper and cream on indigo both
  pass AA for body sizes.
