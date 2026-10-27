# PassOP: hardening, speed and UI revamp — design

Date: 2026-10-27
Status: approved (owner asked for an unattended run; every call below marked
"builder's call" was made without them)

## Why

PassOP is a MERN password manager the owner wrote a while ago. They want it
robust, free of known vulnerabilities, fast to load, and with a fully redone UI.

An audit of the code (all files read, build measured, `npm audit` run) found:

### Security findings, ranked

| # | Severity | Finding | Where |
|---|----------|---------|-------|
| S1 | Critical | `backend/.env` is committed to a **public** GitHub repo: Mongo URI, JWT secret, Google OAuth secret. Anyone can mint a session for any user or read the DB. | `backend/.env` |
| S2 | Critical | Any malformed id (`GET /api/secrets/xyz`) throws an unhandled promise rejection in Express 4, which **crashes the Node process**. One request takes the API down. | `routes/secrets.js` |
| S3 | High | Client crypto is weaker than it looks. A PBKDF2 *hex string* is passed to `CryptoJS.AES.encrypt` as a passphrase, so crypto-js re-derives the key with OpenSSL `EVP_BytesToKey` (one MD5 round) and **ignores the supplied IV**. Ciphertext is AES-CBC with no integrity check. | `frontend/src/utils/crypto.js` |
| S4 | High | Master password is never verified. A typo "unlocks" the vault, every entry fails to decrypt, and new entries get saved under the typo, so one vault can hold entries under several different keys. | `Manager.jsx` |
| S5 | High | Site, username and entry metadata are stored in plaintext on the server. | `models/Secret.js` |
| S6 | High | 9 backend / 11 frontend `npm audit` advisories, one critical (`proxy-addr`). | lockfiles |
| S7 | Medium | NoSQL operator injection: `email` accepts objects (`{"$regex": "^a"}`). Combined with bcrypt only running when a user exists, login leaks which emails exist by timing. | `routes/auth.js` |
| S8 | Medium | Google OAuth has no `state` check (login CSRF), and links any Google account to an existing local account by email without checking the email is verified. | `auth/passport-setup.js` |
| S9 | Medium | Cookie is `SameSite=None` in production with no CSRF defence on state-changing routes. | `utils/authUtils.js` |
| S10 | Medium | No brute-force limit on login/signup beyond a global 200 req / 15 min. | `server.js` |
| S11 | Low | No input validation or size limits on secret fields; no per-user entry cap. | `routes/secrets.js` |
| S12 | Low | OAuth callback logs env values; dead `utils/cyrpto.js` uses a static IV and env keys that do not exist. | `routes/oauth.js`, `utils/cyrpto.js` |
| S13 | Low | Saved site URL is rendered as a raw `href`, so `javascript:` URLs are stored (React 19 blocks execution, but the data is still accepted). Password mask leaks length. | `Manager.jsx` |
| S14 | Low | ~2,100 files of `backend/node_modules` are committed. | repo |

### Why it is slow, measured

| Cause | Cost |
|---|---|
| crypto-js PBKDF2, 100k iterations, run **once per entry** on unlock and once per save, on the main thread | **~630 ms per entry** in Node (slower in browsers). 20 entries ≈ 13 s frozen tab. |
| `lordicon.js` loaded synchronously from a CDN, plus one remote JSON animation per icon per row | 334 KB script + N fetches |
| JS bundle (axios, crypto-js, toastify) | 116 KB gzip |
| 83 KB PNG favicon | 83 KB |
| `Secret.userId` has no index | full collection scan per list |
| Backend cold start on free hosting | 30–50 s, not fixable in code |

## Goals

1. Close S1–S14. S1 needs owner action (rotate secrets); the code side is
   untracking the file and shipping `.env.example`.
2. Unlock-to-list in well under a second for 100 entries.
3. A complete UI redesign that is accessible, responsive and themed.
4. Existing users keep their data: legacy entries migrate automatically.
5. Automated tests for the backend API and the crypto module.

## Non-goals

- Changing the master password, account deletion, export/import, sharing,
  passkeys, 2FA, browser extension. Each is a feature, not hardening.
- Server-side token revocation. Logout clears the cookie; tokens expire.
- Rewriting git history to purge `.env`. That is a force-push, owner's call.

## Anti-goals

- Any path where the server sees a plaintext password, site or username.
- Losing an existing user's entries during migration.
- A UI that hides the "wrong master password" case behind garbage text.

## Constraints

- Keep the stack: React 19, Vite, Tailwind v4, Express, Mongoose, MongoDB.
- Frontend and backend live on different origins in production
  (`VITE_API_URL`, `FRONTEND_URL`), so the auth cookie stays
  `SameSite=None; Secure` in production.
- Legacy data was written with crypto-js 4.2.0 (verified from the lockfile
  history). Its PBKDF2 default hasher is SHA-256.

## Design

### 1. Crypto model (the core change)

```
master password ──PBKDF2-SHA256, 600k iter, per-user salt──▶ AES-GCM-256 key (non-extractable, memory only)
                                                                │
                      ┌─────────────────────────────────────────┼──────────────────────┐
                      ▼                                         ▼                      ▼
             verifier: encrypt("passop-vault-v2")     entry: encrypt(JSON{site,     lock = drop key
             stored on the user                        username, password})
                                                       random 12-byte IV each
```

- WebCrypto only (`crypto.subtle`). Key derived **once per unlock**.
- The **vault record** on the user: `{ salt, iterations, verifier: { ciphertext, iv } }`,
  all base64. `iterations` is stored so it can be raised later.
- Unlock = derive key, decrypt verifier. AES-GCM authentication failure means
  wrong password. No guessing from garbage output.
- Entry v2 = `{ v: 2, ciphertext, iv }`. The server stores nothing else.
- crypto-js survives only in `crypto/legacy.js`, loaded by dynamic `import()`
  when a legacy entry is present, so it is out of the main bundle.

### 2. Vault lifecycle

```
signed in ─▶ GET /api/vault
              │
   vault == null ──▶ SETUP
              │       • no legacy entries: "create master password" + confirm
              │       • legacy entries: "enter your existing master password";
              │         must decrypt at least one legacy entry before the vault
              │         is created, so a typo cannot lock data out
              │
   vault exists ─▶ LOCKED ─(correct password)─▶ UNLOCKED ─(lock / 10 min idle / logout)─▶ LOCKED
                                                   │
                                     legacy entries left? decrypt with legacy
                                     routine, re-encrypt v2, PUT one by one
```

- Migration is lazy and self-healing: any entry still legacy is migrated on
  the next unlock. A failed PUT leaves it legacy; nothing is lost.
- A legacy decrypt only counts as success when the output is non-empty and
  printable (no control characters). CBC has no integrity check, so this is
  what stops a typo from "passing" setup.
- A legacy entry that the confirmed password cannot decrypt (possible because
  of S4) shows as a **"Can't decrypt"** row with two actions: **Try another
  password** (decrypts with the legacy routine and migrates it under the
  current vault key) and delete. No legacy data is a dead end.
- The first unlock after migration is slow once (~0.6 s per legacy entry).
  It shows "Upgrading encryption n / N" and yields to the browser between
  entries. Goal 2 applies to every unlock after that.

### 3. Backend

Layout: `app.js` builds the Express app (no listen); `server.js` validates
env, connects Mongo, listens. Tests import `app.js`.

| Area | Change |
|---|---|
| Framework | Express 5 (async errors reach the error handler natively; fixes S2 and the path-to-regexp/qs advisories). One central error handler returns JSON; no stack traces leak. |
| Env | Boot fails fast if `MONGO_URI`, `JWT_SECRET` (≥ 32 chars) or `FRONTEND_URL` is missing. Google routes are mounted only when `GOOGLE_ID`/`GOOGLE_SECRET` exist. |
| Validation | zod schemas at the route edge. Email trimmed and lowercased; password 8–72 bytes (bcrypt's limit). `mongoose.set('sanitizeFilter', true)`. |
| Login | Constant-ish time: compare against a dummy bcrypt hash when the user does not exist. Auth limiter: 10 attempts / 15 min / IP on login and signup. |
| Session | JWT HS256, algorithm pinned on verify, 7-day expiry, cookie-only (drop the `Authorization` header path). |
| CSRF | Middleware rejects non-GET `/api` requests whose `Origin` is not `FRONTEND_URL`. |
| OAuth | `state` stored in a short-lived httpOnly cookie and checked on callback. Link to an existing account only when Google reports `email_verified`. Debug logs removed. |
| Models | `User.vault` sub-document. `Secret` = `userId` (indexed with `createdAt`), `v`, `ciphertext`, `iv`, plus optional legacy `site`, `username`, `salt`. |
| Limits | ciphertext ≤ 16 KB base64, IV exactly 12 bytes, ≤ 1,000 entries per user. Invalid ObjectId → 404. |
| Health | `GET /api/health` → `{ ok: true }` for uptime pings. |
| Cleanup | Delete `utils/cyrpto.js`; drop `body-parser`, `env`, `mongodb` deps; `npm audit` clean. |

API surface after the change:

| Method | Path | Body / result |
|---|---|---|
| POST | `/api/auth/signup` | `{email, password}` → `{user}` + cookie |
| POST | `/api/auth/login` | `{email, password}` → `{user}` + cookie |
| POST | `/api/auth/logout` | clears cookie |
| GET | `/api/auth/session` | `{user: {id, email}}` or 401 |
| GET | `/api/vault` | `{vault \| null}` |
| POST | `/api/vault` | `{salt, iterations, verifier}` → 201; 409 if it exists |
| GET | `/api/secrets` | list, newest first |
| POST | `/api/secrets` | `{ciphertext, iv}` → 201 |
| PUT | `/api/secrets/:id` | `{ciphertext, iv}` → updated (also how legacy entries migrate) |
| DELETE | `/api/secrets/:id` | 200 / 404 |
| GET | `/auth/google`, `/auth/google/callback` | OAuth |
| GET | `/api/health` | `{ok: true}` |

`GET /api/secrets/:id` is removed; nothing calls it.

### 4. Frontend

Screens and states:

```
App ── checking session (skeleton; "Waking up the server…" after 3 s)
 ├── signed out ─▶ AuthScreen: Sign in | Create account tabs, email+password, "Continue with Google"
 └── signed in  ─▶ VaultGate
                    ├── SETUP   ─▶ VaultSetup (create, or confirm legacy password)
                    ├── LOCKED  ─▶ UnlockScreen
                    └── UNLOCKED ─▶ VaultView
                                     ├── header: wordmark · search · New · Lock · account menu (Log out)
                                     ├── entry list: avatar letter · site · username · masked password
                                     │    actions: copy username, copy password, reveal, open site, edit, delete
                                     ├── EntryDialog (native <dialog>): site, username, password,
                                     │    show/hide, generator (length 8–64, symbols, digits), strength meter
                                     └── ConfirmDialog for delete
```

| Concern | Decision |
|---|---|
| HTTP | Replace axios with a ~30-line `fetch` wrapper (`credentials: 'include'`, JSON, typed error with status). |
| Icons | `lucide-react`, tree-shaken. Remove the lordicon CDN script and eye SVGs. Every icon-only button has an `aria-label`. |
| Toasts | Keep `react-toastify`, mounted once in `App`, themed to tokens. |
| Clipboard | Copy shows a toast; the clipboard is cleared 30 s after a password copy. |
| Auto-lock | 10 minutes without pointer/keyboard activity drops the key and decrypted entries. |
| URLs | Site normalised: bare domains get `https://`; only `http(s)` opens as a link (`rel="noopener noreferrer"`). No remote favicons (would leak the site list to a third party). |
| Masking | Fixed `••••••••` regardless of length. |
| Forms | Visible labels, inline errors under the field, `autocomplete` attributes, paste allowed, show/hide toggle. |
| Dead deps | Remove `axios`, `uuid`, `cors`, top-level `crypto-js` import; delete unused public assets. |

### 5. Visual system

Generated with ui-ux-pro-max (`password manager security tool minimal trustworthy`,
variance 3, motion 3, density 5): **Minimalism / Swiss**, "vault navy + secure
green", Inter. Builder's call: dark and light themes both follow
`prefers-color-scheme`, defined as CSS tokens in Tailwind v4 `@theme`.

| Token | Dark | Light |
|---|---|---|
| `bg` | `#0B1220` | `#F7F8FA` |
| `surface` | `#131C2E` | `#FFFFFF` |
| `surface-2` | `#1A2540` | `#F1F3F7` |
| `border` | `rgba(255,255,255,.08)` | `#E3E7EE` |
| `fg` | `#F1F5F9` | `#0F172A` |
| `muted` | `#94A3B8` | `#55627A` |
| `accent` | `#10B981` (text on it `#04130D`) | `#047857` (text on it `#FFFFFF`) |
| `danger` | `#F87171` | `#B91C1C` |
| `ring` | `#34D399` | `#047857` |

- Type: Inter Variable self-hosted via `@fontsource-variable/inter` (latin
  only, no third-party font request). Passwords and generator output use
  `ui-monospace`.
- Radius 10 px on controls, 14 px on cards/dialogs. Spacing on a 4 px grid.
- Motion: 150–200 ms colour/opacity transitions only; none under
  `prefers-reduced-motion`.
- Wordmark keeps the `<PassOP/>` identity, brackets in the accent colour.
- Favicon: an inline SVG lock in the accent colour.
- Accessibility floor: 4.5:1 text contrast, visible 2 px focus ring, 44 px
  touch targets, keyboard-only use of every flow, `aria-live` for status.
- Layout: single column, max width 720 px, works from 360 px up.

### 6. Repo hygiene

- Root `.gitignore`: `node_modules`, `.env`, `dist`, `coverage`.
- `git rm --cached` `backend/.env` and `backend/node_modules`.
- `backend/.env.example` listing every variable, no values.
- README: setup, env vars, security model, the rotation warning.

## Testing

- Backend: `node --test` + `supertest` + `mongodb-memory-server`.
  Cover signup/login/validation/injection, auth guard, CSRF origin check,
  vault create/409, secret CRUD with ownership isolation, bad ids → 404 (and
  the process survives), limits.
- Frontend: `vitest` for the crypto module (round trip, wrong password fails,
  verifier, legacy blob produced by real crypto-js 4.2 decrypts), URL
  normaliser and password generator.
- End to end: run both servers against a memory Mongo and drive sign-up →
  setup → add → search → edit → lock → unlock → delete in a real browser.

## Left to the builder

Component file layout, exact copy text, Tailwind class choices within the
tokens above, test file layout.

## Builder's calls made without the owner

1. Expose the existing email/password auth in the UI (the README already
   advertises it; the backend already had it).
2. Encrypt site and username too, not just the password.
3. Express 5 instead of an async wrapper on Express 4.
4. 600k PBKDF2 iterations (OWASP 2023 figure for PBKDF2-SHA256).
5. 10-minute idle auto-lock, 30-second clipboard clear.
6. Dark + light themes following the OS setting; no manual toggle.
7. Undecryptable legacy entries are shown, not hidden, with "try another
   password" and delete.
8. No deployment config exists and `.env` points at localhost, so no
   compatibility window for the old frontend. Backend and frontend must
   deploy together.
9. Nothing is pushed; changes are left uncommitted for the owner.
