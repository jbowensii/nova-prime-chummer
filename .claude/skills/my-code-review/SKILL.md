---
name: my-code-review
description: >-
  Multi-agent consensus CODE REVIEW of a project (or a named scope) using the
  gossipcat team — architecture, correctness, security, and comment accuracy — with
  every finding verified against the real code and reported as one ranked, confirmed
  issue list. REVIEW ONLY: it does not fix, format, or release anything. Use when the
  user wants a thorough team review — "review this with the team", "consensus review",
  "team code review", "review the project/module X" — without changing code. For the
  full lint + format + fix + release program, use the my-full-code-review skill instead.
---

# Code Review (gossipcat consensus — review only)

You are the **gossipcat orchestrator**. Dispatch the review to the team, then verify
every finding yourself against the real code. This skill REVIEWS ONLY — it does not
modify, format, or release code. Do not edit source files; produce a report.

## Pre-flight

- Run `pwd` (bash) and confirm you are in this project's root (not a scratch / "No
  folder" directory). If not, `change_directory` here, then call
  `mcp__gossipcat__gossip_reload` and wait ~8s.
- `ToolSearch` select `mcp__gossipcat__gossip_status` and call it. Confirm the 5
  agents are online (`sonnet-implementer`, `opus-reviewer`, `gemini-reviewer`,
  `gpt-reviewer`, `qwen-reviewer`) and that paths point at this project.
- If a relay agent later reports "no API keys configured," the session is rooted in
  the wrong folder — fix the root and `gossip_reload`; do not re-add keys.

## Scope

Review the whole project by default. If the user named a scope (a module, package,
path, or "the recent changes" / a diff), review exactly that and say so.

## Review program (gossipcat consensus)

Dispatch consensus reviews with `gossip_dispatch(mode:"consensus")`, run the native
opus Agent and relay it, `gossip_collect(consensus:true)`, run the cross-review
round, then collect again. Cover these concerns (split across the team):
- **Architecture** — opus + gemini + gpt
- **Correctness / bugs** — opus + gemini + gpt + qwen
- **Security** — gpt (lead) + opus + gemini (OWASP, injection, secrets, auth,
  trust-boundary input validation)
- **Comment accuracy** — qwen + opus spot-check (stale / misleading / missing docs)

## Verify every finding (mandatory)

For EVERY finding — including UNVERIFIED ones — read the cited code yourself and
confirm it before reporting it. Record gossipcat signals as you verify
(`unique_confirmed`, `agreement`, `hallucination_caught`, …) with proper
`finding_id`s. Never report an unverified or hallucinated finding as real.

## Report

Produce ONE ranked, de-duplicated **CONFIRMED** issue list, critical → low, each with:
file:line, a one-line description, the concrete failure (inputs → wrong result), and a
suggested fix. Note anything DISPUTED or that you could not verify, separately. End
with a short overall assessment.

Do not change any code. If the user then wants the issues fixed (and formatted,
commented, versioned, and released), run the **my-full-code-review** skill.
