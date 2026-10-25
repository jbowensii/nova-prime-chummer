---
name: my-full-code-review
description: >-
  Full multi-agent review-and-release pass on a project using the gossipcat team.
  Runs lint + format, consensus architecture/code/security/comment review (every
  finding verified against the real code), an impeccable UI design pass, a light
  guiding-comments pass, resolves all verified issues, then bumps the version
  +0.1.0 and pushes an updated README + release notes on a branch with a PR. Use
  when the user asks to "run the full review", "deploy gossipcat", "review and
  polish/ship this project", "lint + format + comment + UI + fix + release", or any
  comprehensive quality-and-release pass over a whole project. For a review-only
  pass that changes no code, use the my-code-review skill instead.
---

# Full Code Review & Release (gossipcat)

You are the **gossipcat orchestrator** for THIS project. Dispatch work to the team,
verify everything yourself against the real code, and never act on unverified
output. Work on a dedicated branch (or git worktree) — never on main — and commit
after each phase.

## Pre-flight

- Run `pwd` (bash) and confirm you are in this project's root (not a scratch / "No
  folder" directory). If not, `change_directory` here, then call
  `mcp__gossipcat__gossip_reload` and wait ~8s.
- `ToolSearch` select `mcp__gossipcat__gossip_status` and call it. Confirm all 5
  agents are online — `sonnet-implementer`, `opus-reviewer`, `gemini-reviewer`,
  `gpt-reviewer`, `qwen-reviewer` — and that the paths point at this project.
- If a relay agent later reports "no API keys configured," the session is rooted in
  the wrong folder — fix the root and `gossip_reload`; do **not** re-add keys (they
  live in `<project>/.gossip/keys.enc`).

## Guardrails (apply the whole way through)

- **Preserve behavior.** Nothing may break functionality. Run the full test suite
  BEFORE and AFTER; keep it green.
- **Verify before you fix.** For every issue (from reviews OR tooling), read the
  actual code and confirm it is real before changing anything. Record gossipcat
  signals as you verify. Never "fix" a hallucinated or unverified finding.
- **Light, high-value comments only.** Explain WHY and non-obvious WHAT — intent,
  invariants, gotchas, public-API contracts, and "start here" entry points for a new
  developer. No line-by-line narration, no restating the code; match the file's
  existing style.
- **Smallest correct change.** No unrequested refactors, no new dependencies. Flag
  over-engineering instead of adding it.
- **Pause for the user's approval** before: deleting code, changing public
  APIs/schemas, or any fix touching more than ~50 lines or shared state.
- **All pushes go to the working BRANCH plus a PR** — never push to main/master,
  never force-push.

## Phases (in order; commit between each)

### 0. Discover
Map the stack, entry points, the build/test/lint/format commands, the canonical
VERSION source (`package.json` / `pyproject.toml` / `Cargo.toml` / `VERSION` / etc.),
and whether the project has a UI. Report a short project map before proceeding.

### 1. Lint & format
Detect and run the project's formatter + linter (prettier+eslint, ruff/black, gofmt,
dotnet format, …). Auto-fix what is safe; resolve the rest by hand. End state: zero
lint errors, consistent formatting, tests still green. Commit.

### 2. Review program (gossipcat consensus)
Dispatch consensus reviews with `gossip_dispatch(mode:"consensus")`, run the native
opus Agent and relay it, `gossip_collect(consensus:true)`, run the cross-review
round, then VERIFY every finding against the real code and record signals. Cover:
- **Architecture** — opus + gemini + gpt
- **Correctness / bugs** — opus + gemini + gpt + qwen
- **Security** — gpt (lead) + opus + gemini (OWASP, injection, secrets, auth,
  trust-boundary input validation)
- **Comment accuracy** — qwen + opus spot-check (stale / misleading / missing docs)

Produce ONE ranked, de-duplicated CONFIRMED issue list (critical → low) plus a fix
plan, and show it to the user before the fix phase.

### 3. UI / design (only if the project has a UI)
Invoke the **Impeccable** design skill (`impeccable`) — audit/critique the current UI,
then polish it. Start the app in the browser pane (via `.claude/launch.json`) and work
against the REAL rendered UI: visual hierarchy, spacing, typography, color & contrast,
responsive layout (desktop + mobile), interactive/empty/error states, accessibility
(WCAG AA), motion/micro-interactions, and visual consistency. Target out-of-distribution,
intentional craft — not templated AI-slop defaults. Capture before/after screenshots.
Fold concrete UI fixes into the issue list.

### 4. Light comments pass
Add sparing, guiding comments where a new developer would stumble: file/module
purpose headers, non-obvious logic, invariants, public-API contracts, and entry
points. Keep it light per the guardrail — no doc-comment spam.

### 5. Resolve all verified issues
Implement a fix for every confirmed finding (dispatch `sonnet-implementer`,
`write_mode:"worktree"` or `"scoped"`; you verify and commit). After each fix: run
the relevant tests, re-run lint/format; for UI fixes, re-screenshot to confirm.
Record impl signals.

### 6. Final verification
Confirm zero lint/format violations, full test suite green, and every verified issue
fixed (or explicitly deferred WITH a reason).

### 7. Version, docs & push
- **Bump the version by +0.1.0 (minor)** in the canonical VERSION source from Phase
  0. Exactly one minor bump per run.
- **Update `README.md`** to reflect any changed behavior, usage, commands, or UI.
- **Write release notes** for this version into `CHANGELOG.md` (Keep a Changelog
  style: Added / Changed / Fixed / Security), summarizing this run and citing the
  resolved issues.
- **Commit** (`chore(release): vX.Y.0 — <one-line summary>`), create an annotated tag
  `vX.Y.0`, and **push the branch + tag** to origin. Open or update a PR to the
  default branch using the release notes as the body. If `gh` is available and origin
  is GitHub, also create a GitHub Release from the tag with those notes.

### 8. Report
Give the user: branch name, new version + tag, PR link, per-phase summary of changes,
before/after on lint/tests/coverage, UI before/after screenshots, the release notes,
and anything intentionally deferred. Then STOP for their review before merge.

## Definition of done
Zero lint/format violations, tests green, every verified issue resolved or
consciously deferred, light guiding comments in place, UI (if any) visibly improved,
version bumped +0.1.0, README + release notes updated and pushed on a branch with a
PR, and a clear evidence-backed report. Do not claim done without the evidence.
