# User accounts — Design Spec

Date: 2026-09-28. Approved in conversation. Release 0.4.0.

Until now the app had no login and was LAN-only. Accounts let it sit
behind the owner's reverse proxy on the internet: people sign in with an
app password or through Authelia (single sign-on, two-factor), and each
role sees only what it should.

## 1. Decisions

| Question | Decision |
|---|---|
| How accounts are made | The admin creates them on a Users page. No self sign-up. |
| Books | Only the admin uploads/imports books and uses AI settings/keys. There is one shared catalog: all imported data (and the core data, see `2026-09-28-core-data-design.md`) is available to every signed-in user. No per-user book or data access. |
| Backup / restore | Admin only. |
| Catalog edits | Admin and editors. |
| Runners | Each user owns theirs. Admin and editors can view and print everyone's, read-only. |
| Exposure | Behind the owner's reverse proxy, which does HTTPS. |
| Sign-in | Built into the app (approach A) **plus** optional Authelia via OpenID Connect. |
| Authelia users | Must be pre-created on the Users page (matched by username or email). |
| Password vs Authelia | Per account: each account signs in with an app password *or* Authelia. |
| First admin | One-time setup code printed in the container log. |

## 2. Roles

| | admin | editor | player |
|---|---|---|---|
| Own runners: create, edit, delete | ✓ | ✓ | ✓ |
| Everyone's runners: view, print | ✓ | ✓ | – |
| Catalog edits, Add entry, house-rule sources | ✓ | ✓ | – |
| Catalog, descriptions, Rules, Data (read) | ✓ | ✓ | ✓ |
| Books page, imports, AI settings and keys | ✓ | – | – |
| Backup and restore | ✓ | – | – |
| Users page, Sign-in settings | ✓ | – | – |

- The server enforces every rule; the UI hiding a control is only
  convenience. A request outside the role gets 403.
- There is always at least one enabled admin: the last one can't be
  demoted, disabled or deleted.
- Users page (admin): list (name, username, email, role, sign-in method,
  enabled, last sign-in); add; edit name/email/role/method; disable/enable;
  reset password (sets a new one; signs that user out everywhere); delete
  (only with no runners, or after moving them); move a runner to another
  user.

## 3. Signing in

### App passwords
- Usernames: `[a-z0-9._-]{2,32}`, case-insensitive, unique. Emails
  optional, unique when set.
- Passwords: at least 10 characters. Stored as scrypt (Node `crypto.scrypt`,
  N=2^15, r=8, p=1, 16-byte salt, 64-byte key) with parameters kept per hash
  so they can be raised later. Compared with `timingSafeEqual`.
- Lockout: 5 failures for the same username + client IP → that pair is
  refused for 15 minutes (in memory). Failed and successful sign-ins are
  logged without the password.
- Change password (own, needs the current one) and admin reset both end
  every other session of that user.

### First admin and recovery
- On start with no users, the server generates a random setup code
  (e.g. `XXXX-XXXX-XXXX`), logs it once, and serves `/setup`: code +
  username + name + password → the first admin. The code changes on every
  restart and dies when used. `/setup` is 404 once any user exists.
- Recovery: `docker exec chummer-anarchy2 node server/users.mjs reset
  <username>` prints a one-time code (15 minutes) that `/setup/reset`
  accepts to set a new password for that user. Also works when Authelia is
  down (it switches the account to app password).

### Authelia (OpenID Connect)
- Settings → **Sign-in** (admin): issuer URL, client ID, client secret,
  and a "Test" button that fetches the discovery document. The secret is
  stored in its own file like `ai-keys.xml`, never returned, never logged.
- Login page shows **Sign in with Authelia** when configured.
- Flow: authorization code + PKCE (S256), random `state` and `nonce` kept
  server-side for 10 minutes; scope `openid profile email`; redirect URI
  `<public origin>/api/auth/oidc/callback`.
- The server exchanges the code at the token endpoint and verifies the ID
  token itself with Node `crypto`: signature against the issuer's JWKS
  (RS256 and ES256; keys cached, refetched on unknown `kid`), `iss`, `aud`,
  `exp`/`iat` (60 s leeway), `nonce`.
- The claim `preferred_username`, else `email`, is matched to an enabled
  account whose method is Authelia. No match → "Ask the admin for an
  account". Nothing is auto-created.
- Two-factor is Authelia's policy for this client; the docs include the
  Authelia client snippet with `authorization_policy: two_factor`.

### Sessions and request safety
- Session: 32 random bytes, sent as cookie `ca2_session` (HttpOnly,
  SameSite=Lax, Path=/, Secure when the request is https). Stored on the
  server as a SHA-256 hash with user, created, last seen; 30-day sliding
  expiry; persisted in `library/.config/sessions.xml` (written at most once
  a minute) so restarts and updates keep people signed in.
- Every `/api/*` route needs a session except `POST /api/auth/login`,
  the setup routes, the OIDC start/callback, `GET /api/auth/me` and
  `GET /api/health`. The static app loads and shows the sign-in page.
- Every non-GET request must carry an `Origin` (or `Referer`) matching
  the request's own origin; otherwise 403. With SameSite=Lax this blocks
  cross-site forgery.
- Trusted proxy: template variable `TRUST_PROXY` (comma-separated IPs or
  CIDRs; empty = none). `X-Forwarded-For/-Proto/-Host` are honoured only
  when the TCP peer is in that list; they decide the client IP (lockout,
  logs), https (Secure cookie) and the public origin (Origin check, OIDC
  redirect).

## 4. Data

```
library/.config/users.xml        accounts (hash + salt, never plain passwords)
library/.config/sessions.xml     session hashes
library/.config/auth.xml         Authelia issuer + client id
library/.config/auth-secret.xml  Authelia client secret (like ai-keys.xml)
characters/<username>/*.xml      each user's runners
characters/<username>/.trash/    their deleted runners
custom/edits/edits.xml           entries gain by="<username>"
```

- All XML, atomic writes, validated by schemas (`users.xsd`, `auth.xsd`).
- Renaming a user renames their runner folder (under the same write lock).
- Upgrade (0.3 → 0.4): when the first admin is created, runner files at
  the top of `characters/` (and `characters/.trash/`) move into that
  admin's folder.
- The existing character API keeps its shape but is scoped:
  `GET /api/characters` returns the caller's runners, plus everyone's
  (with `owner`) for admin/editor; `PUT/DELETE` only on your own.

## 5. Backup and restore

- Backups include `users.xml`, `auth.xml` and every runner folder;
  `sessions.xml` never; `auth-secret.xml` only with "Include my API keys"
  (same rule as `ai-keys.xml`, including dropping it when the issuer
  changes on a restore without keys).
- After a restore, all sessions end; people sign in with the accounts in
  the backup. The restore confirm says so.
- Restoring a pre-0.4 backup (no `users.xml`) puts the server back in
  setup mode; the runners go to the new admin as in the upgrade.

## 6. UI

- Sign-in page (username, password, Sign in; "Sign in with Authelia"
  when set up; plain errors: wrong username or password; paused for 15
  minutes after too many tries).
- Setup page (setup code, name, username, password twice).
- Account menu in the header: name, role, Change password, Sign out.
- Users page (admin) as in §2; Settings → Sign-in (admin).
- Runner list: admin/editors see "My runners" and then one group per
  owner. Someone else's runner opens read-only with a bar "Read only —
  Kim's runner" and Print still available.
- Controls a role can't use are not shown (Books, Backup, Users, Sign-in
  settings, Edit/Add entry).

## 7. Tests

- Server: each role × each route (allowed / 403); sign-in, lockout,
  sessions persist across restart and end on reset/restore; setup code
  single use; recovery code; Origin check; forwarded headers ignored from
  an untrusted peer and honoured from a trusted one; upgrade moves
  runners; last-admin guard; rename moves the folder.
- OIDC against a local fake issuer (discovery, JWKS, token endpoint):
  success, bad signature, wrong `aud`/`iss`, expired, wrong nonce, reused
  state, unknown user, password-method user.
- Python: backup/restore with users and the auth secret (keys on/off).
- e2e: setup → admin; create a player and an editor; player can't see
  Books/Edit; editor edits an entry and views the player's runner
  read-only; sign out/in.

## 8. Release

0.4.0: README (accounts, reverse proxy, Authelia snippet), deploy doc,
CHANGELOG, template field **Trusted proxy** (`TRUST_PROXY`) in both
template copies, merge, tag, publish, install on tower04 through the
template (pull first), read the setup code from the container log.
