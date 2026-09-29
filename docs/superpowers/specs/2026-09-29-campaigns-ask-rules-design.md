# Campaigns and "Ask the rules" — Design Spec

Date: 2026-09-29. Approved in conversation. Release 0.5.0.

## 1. Decisions

| Question | Decision |
|---|---|
| Who creates campaigns | Admin or editor. The creator is its GM; the admin can add other editors as co-GMs. |
| Members | The GM picks the players (any accounts). A person can be in several campaigns. |
| Characters in a campaign | A player or editor assigns their own runners to a campaign they belong to. **One campaign per runner at a time**; to use it elsewhere, copy it. |
| Example characters | Loading examples already gives personal copies; a copy put in a campaign is that person's own — changes never affect anyone else's. |
| Editor visibility | **Only their campaigns** (plus their own runners), read-only + Print. The admin still sees everything. |
| Player visibility | Their own runners in full + a roster of each of their campaigns: GM, teammates' character names and archetypes; no sheets. |
| Ask the AI | Anyone signed in. |
| Limit | Per user per day, set by the admin; default unlimited. |
| History | No questions or answers are saved (server or browser). |

## 2. Campaigns

- Store: `custom/campaigns.xml` (schema `campaigns.xsd`, atomic writes, write-counted, in backups):
  `<campaign id name archived? created><note/><gm user=""/>…<member user=""/>…</campaign>`.
- A runner's campaign is recorded on the runner (`campaign="<id>"` in the character XML, schema updated),
  so it moves with the runner (copy, backup, trash/restore). Copying a runner clears it.
- Server rules (403 otherwise):
  - create/rename/archive/delete (only when empty), members, co-GMs: admin, or a GM of that campaign
    (adding co-GMs: admin only).
  - assign/unassign a runner: its owner, who must be a member or GM of that campaign; a GM may also
    remove any runner from their campaign.
  - read: admin all; GM full read-only sheets of every runner in their campaigns; member the roster
    (owner display name, street name, archetype/level only).
  - `GET /api/characters` for an editor: own + runners in campaigns they GM (was: everyone's).
- Removing a member: their runners leave the campaign (the runners stay theirs). Deleting an account:
  its memberships and GM roles go; last-GM guard — a campaign always keeps a GM (fall back to the admin).
- Rename of a username updates campaigns.xml under the same write lock.

UI:
- **Campaigns** page (nav): my campaigns (name, GM, members, characters), "New campaign" for admin/editor.
- **Campaign page**: characters grouped by player (GM/admin: open read-only/print; member: roster rows),
  roster, and GM tools (members, co-GMs for admin, rename, note, archive/unarchive, delete when empty).
- Runner list: a campaign tag on each runner; "Add to campaign…" / "Remove from campaign" actions;
  filter by campaign.

## 3. Ask the rules

- One component, `AskRules`: a compact prompt bar at the top of the character builder and of the campaign
  character list, and a **?** button in the header that opens the same component in a drawer on any page.
  The answer shows beneath with its sources (e.g. "CRB p.61 · QREF Base"). Closing or asking again clears
  it; nothing is stored (no localStorage either).
- Shown only when an AI provider is chosen, enabled and has a key (the server says so via /api/auth/me or a
  small status route).
- Server: `POST /api/ask` `{question}` (≤ 500 chars): counted per user per day (UTC date) against the
  user's limit (`dailyQuestions` on the account; empty = unlimited; admin sets it on the Users page). Then
  the importer's new `ask` command (existing spawn hygiene, key via the existing key path, 60 s timeout):
  1. retrieve the most relevant passages from the server's data: imported rules + private rule texts,
     amp/item/spell descriptions, core data names, enabled table rules — simple keyword/BM25 scoring,
     top ~8 passages, each with source + page;
  2. if nothing scores above a floor, answer "The books on this server don't cover that." without calling
     the AI;
  3. otherwise send the question + passages to the configured provider with instructions to answer only
     from them, cite `[SOURCE p.N]`, and say when they don't cover it; max ~600 output tokens.
  Returns `{answer, sources:[{source,page,title}]}`. Nothing logged but the user and the time (no text).
- Book text only ever goes to the admin's configured provider (as with AI imports). One request per user at
  a time; 429 with Retry-After when the daily limit is reached ("You've used today's N questions. Ask
  again tomorrow.").

## 4. Tests

- Campaigns: role × route, visibility (editor only their campaigns; member roster fields only), one
  campaign per runner, copy clears campaign, rename/delete account updates campaigns, backup/restore.
- Ask: retrieval on invented fixture texts, "not covered" path without AI, limit counting and reset,
  role (every signed-in user), nothing stored, fake provider; e2e for the bar, drawer and the limit.
