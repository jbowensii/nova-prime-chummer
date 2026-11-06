# Plan: adopt the good ideas from OMA3

Status: DRAFT v2, not started (2026-11-02). Team-reviewed (gossipcat: gpt-reviewer, gemini-reviewer, ca-reasoning);
findings verified against the code and folded in below. Awaiting owner go-ahead.
Source compared: https://github.com/HeyOmae/OMA3 (Shadowrun 6e character generator; Next.js + MUI + IndexedDB).

## Bottom line

Nine ideas were listed. Checking our code while writing this plan showed two are mostly already in place, so the
real work is seven items. Recommended order, cheapest and safest first:

| # | Item | Size | Risk | Order |
|---|------|------|------|-------|
| 3 | Pre-commit / pre-push checks | S | Low | 1 |
| 9 | Fork-safe release guard | XS | Low | 1 (same PR) |
| 4 | Automated version + changelog + in-app release notes | M | Low | 2 |
| 2 | Versioned SR6 save-format upgrades | M | Medium (touches saved runners) | 3 |
| 6 | Show problems on the current tab with "Go fix" buttons | S–M | Low | 4 |
| 1 | Open the owner's own PDF at the cited page | M | Low (browser-only, opt-in) | 5 |
| 8 | Split the largest UI files | L, ongoing | Medium (churn) | 6, piecemeal |
| 5 | Coverage target | S | Low | ride along with each item |
| 7 | Per-item / per-section URLs (tabs already done) | S–M | Low | 4, with item 6 |

Every item is SR6-first and must not change Anarchy behaviour ([[keep-games-separate]]); shared pieces (hooks, release
tooling, PDF links) apply to both only where they change no game rules.

## Corrections to the first comparison

- **Item 5 (coverage):** we already gate coverage — `npm run check` runs `vitest --coverage` with thresholds
  statements 80 / branches 72 / functions 70 / lines 80 (vite.config.ts:51). OMA3 aims at 100%. The adoptable part
  is narrower: raise thresholds gradually and require new files to arrive with tests, not chase 100%.
- **Item 7 (URLs) — only half done (team finding, verified).** Tab addresses work (`#/sr6/c/<id>/<tab>`,
  hashchange routing in src/core/app/App.tsx). Item-builder addresses do NOT: Sr6App.tsx:174 passes only the tab
  segment, and an unknown tab falls back to Concept. The `build/<uid path>` route mentioned in an EditorView.tsx
  comment is stale. Item 7 is therefore real work: add item/section destinations (e.g. `#/sr6/c/<id>/gear/<uid>`)
  so links and "fix it here" buttons can land on the exact row. The code-splitting half stays with the tab-speed to-do.
- **Item 6 — Review links already exist (team finding, verified).** Review.tsx resolves each problem to a tab and
  renders it as a link. The new work is showing problems on the tab you are on, and landing on the exact row.

## Item 3 — checks before code leaves the machine

**Why:** lint, format and type errors are only caught in CI today; several Forgejo/GitHub runs went red for that.
**How:**
- Add `husky` + `lint-staged` (dev dependencies only).
- pre-commit: Prettier + ESLint on staged files only (seconds, not minutes).
- pre-push: `tsc -b` (type-check). Not the full test suite — too slow for every push; CI keeps that.
- Python side (team finding): `pylint` is too slow for every commit on Windows. Pre-commit runs only
  `black --check` on staged `importer/`/`tools/` files; `pylint` moves to pre-push, staged-scope only.
  Optional later: replace black+pylint with `ruff` (much faster) — needs the owner's OK since it changes the
  lint rules CI enforces.
- Document the bypass (`--no-verify`) as owner-only, emergencies only.
**Done when:** a commit with a lint error is refused locally; a push with a type error is refused; CI unchanged.

## Item 9 — release jobs only run on the real repository

**Why it matters now (team finding, verified):** publish.yml's CI-completion path already checks the repo, but the
tag-push path (`push: tags: ['v*']`) and the desktop job do not — a fork pushing a `v*` tag would run them. The repo is
now public (2026-11-02), so forks are possible.
**How:** add `if: github.repository == 'jbowensii/nova-prime-chummer'` to every job in publish.yml (and the release
job), and the Forgejo equivalent. Fold into the item-3 PR.
**Done when:** a fork's run skips publish; ours still publishes.

## Item 4 — automatic version, changelog and release notes

**Why:** versions and notes are bumped by hand; mistakes and missing notes happen.
**How:**
- Adopt Conventional Commits (we mostly already write `feat(sr6):` / `fix(sr6):`) and enforce the format in the
  item-3 commit hook (`commitlint`).
- GitHub: `release-please` opens a release PR from main; merging it bumps `package.json`, writes `CHANGELOG.md`, tags,
  and creates the GitHub Release (installers still attached by the existing release step).
- Forgejo builds stay untagged in-between builds; only GitHub big releases go through release-please (matches the
  owner's repo split).
- In-app "What's new": read the bundled `CHANGELOG.md` at build time (no live GitHub call — works offline and in the
  desktop app). Show it once after an upgrade, and on demand from Settings.
**Done when:** a merged release PR produces the tag, changelog section and release with no hand edits; the app shows
the new section.
**Open question for owner:** keep hand-written plain-English release notes on top of the generated list? (Recommend yes.)

## Item 2 — versioned upgrades for saved SR6 runners

**Why:** SR6 runners on the server and in exports keep whatever shape they were saved in. Today only item ids are
remapped (`migrateSr6Ids`, src/sr6/runner-builder/domain/career/migrate.ts). A future format change has no safe,
tested upgrade path. (Anarchy already has `migrate()` in src/ca2/formats/domain/file.ts.)
**How:**
- (Team finding, verified) SR6 files already carry `formatVersion` (character.ts:553; the reader rejects newer files at
  charxml.ts:971; the XSD requires it). Reuse it — do NOT add a second `schemaVersion`. Bump FORMAT_VERSION per
  upgrade step, as Anarchy does (src/ca2/formats/domain/file.ts MIGRATIONS + migrate()).
- An ordered list of small upgrade steps in `src/sr6/formats/domain/migrations/`, one file + one test each, each
  taking version N to N+1. Rule in the file header: never edit or reorder a shipped step, only add.
- (Team finding, verified) The server never parses runners — it returns raw XML (server.mjs:439) and saves after a
  root-attribute check. So upgrades run client-side in one place, `xmlToSr6` (charxml.ts), which covers editor load,
  import and Foundry export; autosave then writes the upgraded file. `migrateSr6Ids` (id remapping) stays separate and
  runs after.
- No no-op step needed: the loop ships with zero steps (formatVersion stays 1) plus its tests; the first real format
  change adds step 1→2.
- Safety: the server writes a backup copy of a runner before saving an upgraded version the first time
  (never-delete rule).
**Done when:** every sample and saved runner on tower04 loads and round-trips unchanged; a test proves an old-shape
fixture upgrades.

## Item 6 — "fix it here" links on missing steps

**Why:** our builder lists problems on Review; OMA3 shows the problem where you are, with a button to the screen that
fixes it.
**How:**
- Problems already carry a tab (rules.ts `r.tab`, `h.path`) and are computed once in EditorView and shared through
  context — no re-validation per tab needed.
- (Team finding) Separate *where a problem shows* from *where it is fixed*: e.g. "no Magic priority" shows on Magic
  but is fixed on Method. Add an optional `fixAt` (tab + item/section) to the SR6 rule hit; default = its tab.
- One reusable problem panel at the top of each tab: problems that concern this tab, each with a "Go fix" button to
  `fixAt` (uses item 7's row addresses).
- Review keeps its existing links; they switch to `fixAt` so they land on the exact row.
- Plain-English wording, same severity colours as today.
**Done when:** e.g. Magic with no Magic priority shows "Set the Magic priority" + a button to the Method tab; every
Review error is clickable.

## Item 1 — open the owner's own PDF at the cited page

**Why:** we show "CRB p.245" as text. OMA3 opens the reader's own PDF at that page; the file never leaves the PC
(fits our no-PDFs-to-cloud rule).
**How:**
- Browser File System Access API (Chrome/Edge; also works in our Electron desktop app). The user links a book's PDF
  once; the file handle is kept in IndexedDB, per browser, never uploaded.
- Per-book page offset (printed page → PDF page). We already import these books, so the importer can record the
  offset it saw; else a one-time "which PDF page is printed page 10?" prompt.
- Every page reference (hover cards, Rules page, Review) becomes a link; unlinked books show a "Link your PDF" hint.
- Firefox/Safari: plain text, as today.
- Desktop app: can open the PDF the user already imported from their library folder, no picking needed.
**Done when:** clicking a reference opens the right page in Chrome and in the desktop app; nothing is sent to the server.
**Open question for owner:** in the server (tower04) build, should a GM be able to open the imported PDFs from the server
for their own login? (Recommend no — keep PDFs local-only, as decided in the desktop-app plan.)

## Item 8 — smaller files

**Why:** Ledger.tsx is ~1,780 lines, Picker.tsx ~840, Method.tsx ~630; big files slow changes and reviews.
**How (team advice):** no line-count target and no big-bang refactor. Split along real seams when a task touches the
file — e.g. Ledger.tsx by ledger operation, Picker.tsx into the picker shell vs. per-kind sections — each piece with its
test beside it. Each split is its own small, behaviour-neutral PR.
**Done when:** ongoing; measured by the largest-files list shrinking.

## Item 5 — coverage

Raise thresholds a few points at a time as items land (e.g. branches 72 → 75 → 80); each new file arrives with a test.

## Delivery

- One PR per item (3+9 together), each through Forgejo CI; group into a GitHub release (e.g. 0.45.0) when 3, 9, 4, 2,
  6 have landed. Item 1 can be its own minor release.
- No re-import needed for any item except recording PDF page offsets (item 1, optional).

## Risks

- Hooks annoy if slow → staged-files-only, type-check on push only.
- Save upgrades touch real data → no-op first step, server backup before first upgraded save, round-trip test on all
  tower04 runners before release.
- release-please vs our two-repo split → only on GitHub; Forgejo stays untagged.

## Team review summary (2026-11-02)

Reviewers: gpt-reviewer (items 1–2), gemini-reviewer (3, 4, 5, 9), ca-reasoning (6, 7, 8). All three completed; the
cross-check round timed out, so I checked each main claim against the code myself. Confirmed and folded in:
1. Reuse SR6's existing `formatVersion`; don't add `schemaVersion`.
2. Run upgrades client-side in `xmlToSr6`; the server only handles raw XML.
3. Item-builder URLs don't exist — item 7 is real work, not "already done".
4. Review already links problems to tabs — item 6 is narrower than drafted.
5. publish.yml's tag-push and desktop paths run on forks — item 9 matters, more so now the repo is public.
6. pylint is too slow for every commit on Windows — moved to pre-push; ruff is an optional later switch.
Agreed as sound: release-please fits the GitHub-only big-release split; coverage gate already exists (raise gradually).
Not fully read: part of the PDF-link (item 1) and ordering feedback was cut off in the stored reports; item 1 stands as drafted.
