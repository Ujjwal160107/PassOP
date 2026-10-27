# PassOP Hardening and Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every finding in the audit, make unlock fast, and replace the UI, without losing any existing user's entries.

**Architecture:** Backend becomes a testable `createApp(config)` on Express 5 with zod validation at the route edge and a vault record on the user. Frontend moves all crypto to WebCrypto (one PBKDF2 per unlock, AES-GCM per entry, whole entry encrypted), keeps crypto-js only behind a dynamic import for migrating legacy entries, and is rebuilt as small components on Tailwind v4 tokens.

**Tech Stack:** Node 24, Express 5, Mongoose 8, zod, bcrypt, passport-google-oauth20, node:test + supertest + mongodb-memory-server; React 19, Vite 7, Tailwind v4, lucide-react, react-toastify, vitest.

**Spec:** `docs/superpowers/specs/2026-10-27-passop-hardening-and-revamp-design.md`

## Global Constraints

- The server never receives a plaintext password, site or username for v2 entries.
- PBKDF2-SHA256, 600,000 iterations, 16-byte salt; AES-GCM-256 with a fresh 12-byte IV per encryption; all binary fields base64.
- Verifier plaintext is exactly `passop-vault-v2`.
- Legacy crypto must match crypto-js 4.2.0: `CryptoJS.PBKDF2(pw, salt, {keySize: 8, iterations: 100000}).toString()` used as a passphrase to `CryptoJS.AES.decrypt(ciphertext, derived, {iv: Hex.parse(iv)})`.
- Account password 8–72 bytes; email trimmed and lowercased.
- Ciphertext ≤ 16,384 base64 chars; IV decodes to exactly 12 bytes; ≤ 1,000 entries per user.
- Auth limiter 10 requests / 15 min / IP on `/api/auth/login` and `/api/auth/signup`.
- JWT HS256, 7 days, cookie `token`, httpOnly; `SameSite=None; Secure` in production, `Lax` otherwise.
- Non-GET/HEAD/OPTIONS requests must carry `Origin` equal to `FRONTEND_URL`, else 403.
- Idle auto-lock 10 minutes; clipboard cleared 30 s after a password copy.
- Colour tokens, type and motion exactly as spec §5. Text contrast ≥ 4.5:1, visible focus ring, 44 px targets.
- No new runtime dependency beyond: `zod` (backend); `lucide-react`, `@fontsource-variable/inter` (frontend).

- This run leaves work uncommitted for the owner: each "Commit" step is a checkpoint (tests green), not a `git commit`.

## Review Focus

1. A master password with leading/trailing spaces, emoji or non-Latin text must round-trip exactly; nothing trims it. (Task 6 test.)
2. Pasting a `javascript:` URL or a URL with surrounding whitespace as a site must never produce a clickable non-http link. (Task 7 test.)
3. The session cookie expiring while the vault is unlocked: the next API call returns 401 and the app must drop the key and show sign-in, not a stuck error. (Task 5 test.)
4. Email case: signing up as `Bob@X.com` then logging in as ` bob@x.com ` works, and a second signup with different case returns 409. (Task 2 test.)
5. A malformed id or oversized body must return JSON 4xx and leave the process serving. (Task 4 test.)

---

### Task 0: Repo hygiene

**Files:**
- Create: `.gitignore`, `backend/.env.example`
- Remove from index: `backend/.env`, `backend/node_modules/`, `backend/.vscode/`

- [ ] **Step 1:** Root `.gitignore` with `node_modules/`, `.env`, `.env.*` (but `!.env.example`), `dist/`, `coverage/`, `.vscode/`.
- [ ] **Step 2:** `git rm -r --cached backend/node_modules backend/.env backend/.vscode` (files stay on disk).
- [ ] **Step 3:** `backend/.env.example` with keys `MONGO_URI, JWT_SECRET, FRONTEND_URL, API_BASE_URL, GOOGLE_ID, GOOGLE_SECRET, NODE_ENV, PORT`, empty values, one comment line per key.
- [ ] **Step 4: Verify:** `git ls-files | grep -cE 'node_modules|\.env$'` prints `0`; `ls backend/.env` still exists.
- [ ] **Step 5: Commit** `chore: stop tracking secrets and node_modules`.

### Task 1: Backend foundation

**Files:**
- Create: `backend/config.js`, `backend/app.js`, `backend/middleware/errors.js`, `backend/test/helpers.js`, `backend/test/app.test.js`
- Modify: `backend/server.js`, `backend/package.json`
- Delete: `backend/utils/cyrpto.js`

**Interfaces:**
- Produces: `loadConfig(env = process.env) → { mongoUri, jwtSecret, frontendUrl, apiBaseUrl, google: {id, secret} | null, isProduction, port, authLimit: 10, maxEntries: 1000 }`; throws `Error('Missing or invalid env: A, B')`. `jwtSecret` must be ≥ 32 chars.
- Produces: `createApp(config) → express.Application`; stores config at `app.locals.config`.
- Produces: `errorHandler` maps `ZodError → 400 {error: <first issue message>}`, Mongoose `CastError → 404 {error: 'Not found'}`, `type === 'entity.too.large' → 413`, other → 500 `{error: 'Server error'}` (logs the error, never sends stack). `notFound` → 404 JSON.
- Produces (test helpers): `startDb() / stopDb()` (mongodb-memory-server, set `MONGOMS_DISTRO=ubuntu-22.04` if unset), `testConfig(overrides) → config` with `frontendUrl: 'http://app.test'`, `authLimit: 1000`, 40-char secret; `makeAgent(app)` returning a supertest agent that always sets `Origin: http://app.test`; `signup(agent, email?, password?) → user`.

- [ ] **Step 1:** Update deps: `express@^5`, add `zod`; remove `body-parser`, `env`, `mongodb`; devDeps `supertest`, `mongodb-memory-server`. Scripts: `"test": "node --test test/"`, `"start": "node server.js"`. Run `npm install && npm audit --omit=dev`; expected `found 0 vulnerabilities`.
- [ ] **Step 2: Failing tests** in `test/app.test.js`: `GET /api/health → 200 {ok: true}`; `GET /nope → 404` JSON with `error`; `loadConfig({})` throws listing `MONGO_URI, JWT_SECRET, FRONTEND_URL`; `loadConfig` with a 10-char JWT secret throws; `google` is `null` when `GOOGLE_ID` is absent.
- [ ] **Step 3:** Run `npm test`; expected FAIL (modules missing).
- [ ] **Step 4:** Implement. Middleware order: `trust proxy 1`, helmet, cors (`origin: frontendUrl, credentials: true`), `express.json({limit: '64kb'})`, cookie-parser, global limiter (300 / 15 min), routes, `notFound`, `errorHandler`. Set `mongoose.set('sanitizeFilter', true)` and `strictQuery` in `app.js`. `server.js`: load config (exit 1 with message on error), connect, listen. Mount routes that exist today unchanged.
- [ ] **Step 5:** `npm test` → PASS.
- [ ] **Step 6: Commit** `refactor(backend): testable app, Express 5, env validation`.

### Task 2: Local auth hardening

**Files:**
- Create: `backend/validation.js`, `backend/middleware/originCheck.js`, `backend/test/auth.test.js`
- Modify: `backend/routes/auth.js`, `backend/utils/authUtils.js`, `backend/middleware/auth.js`, `backend/models/User.js`, `backend/app.js`

**Interfaces:**
- Produces: `credentialsSchema` (zod; email → trimmed lowercase valid email ≤ 254; password string 8–72 UTF-8 bytes).
- Produces: `issueSession(res, user, config)`, `clearSession(res, config)`, `readSession(req, config) → userId | null` (cookie only, `algorithms: ['HS256']`).
- Produces: `requireAuth` reads `req.app.locals.config`, sets `req.user`.
- Produces: `requireSameOrigin` mounted on `/api` before routes.
- User model: `email` gets `lowercase: true, trim: true`.

- [ ] **Step 1: Failing tests:**
  - signup returns 200, sets `token` cookie with `HttpOnly`; body `{user: {id, email}}` has no `passwordHash`.
  - signup `Bob@X.com`, login ` bob@x.com ` → 200; second signup `BOB@x.com` → 409.
  - login with `{email: {$ne: null}, password: 'x'}` → 400.
  - password of 7 chars → 400; 73 bytes → 400.
  - wrong password and unknown email both → 401 `{error: 'Invalid credentials'}`.
  - `POST /api/auth/login` without `Origin` → 403; with `Origin: http://evil.test` → 403.
  - `GET /api/auth/session` with `Authorization: Bearer <valid jwt>` and no cookie → 401.
  - token signed with `HS512` and the right secret → 401.
  - limiter: app with `authLimit: 2`, third login attempt → 429.
  - logout clears the cookie; session afterwards → 401.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement. Unknown-user login compares against a module-level dummy hash (`bcrypt.hashSync('dummy-password', 12)` computed once) so timing matches.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** `fix(auth): validate input, pin JWT, origin check, rate limit`.

### Task 3: Google OAuth hardening

**Files:**
- Create: `backend/auth/google.js` (replaces `auth/passport-setup.js`), `backend/test/google.test.js`
- Modify: `backend/routes/oauth.js`, `backend/app.js`
- Delete: `backend/auth/passport-setup.js`

**Interfaces:**
- Produces: `findOrCreateGoogleUser(profile) → User` — looks up by `oauth.providerId`; else by email; links an existing email account **only** if `profile.emails[0].verified === true` (passport-google-oauth20 exposes `verified`; also accept `profile._json.email_verified === true`), otherwise throws `Error('Google email not verified')`; creates a new user when no account exists and the email is verified.
- Produces: `cookieStateStore` implementing passport-oauth2's `store(req, cb)` / `verify(req, state, cb)` — 16 random bytes hex in cookie `oauth_state` (httpOnly, 10 min, same `secure`/`sameSite` rule as session, path `/auth`), cleared on verify.
- `oauthRoutes` mounted only when `config.google` is set; otherwise `/auth/google` → 404.

- [ ] **Step 1: Failing tests:** `findOrCreateGoogleUser` creates user; links verified email to existing local user; refuses unverified email when an account exists; reuses by providerId. `GET /auth/google` → 302 to `accounts.google.com` with a `state` query equal to the `oauth_state` cookie. `GET /auth/google/callback?code=x&state=wrong` → 302 to `${frontendUrl}/?auth=fail`. App with `google: null` → `/auth/google` 404.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement; remove the debug `console.log` block; callback uses `issueSession` then redirects to `frontendUrl`.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** `fix(oauth): state check and verified-email linking`.

### Task 4: Vault API and v2 secrets

**Files:**
- Create: `backend/routes/vault.js`, `backend/test/vault.test.js`, `backend/test/secrets.test.js`
- Modify: `backend/models/User.js`, `backend/models/Secret.js`, `backend/routes/secrets.js`, `backend/validation.js`, `backend/app.js`

**Interfaces:**
- User: `vault: { salt: String, iterations: Number, verifier: { ciphertext: String, iv: String } }` (absent until created).
- Secret: `userId` (required), `v: Number` (2 for new), `ciphertext`, `iv`, legacy optional `site`, `username`, `salt`, `createdAt`, `updatedAt` (timestamps). Index `{userId: 1, createdAt: -1}`.
- `vaultSchema`: `salt` base64 of 16 bytes, `iterations` int 100,000–10,000,000, `verifier` = `encryptedSchema`.
- `encryptedSchema`: `{ciphertext: base64 1..16384 chars, iv: base64 of 12 bytes}`; `.strict()` so extra fields → 400.
- `GET /api/vault → {vault: {salt, iterations, verifier} | null}`; `POST /api/vault → 201 {vault}`, 409 if set.
- Secret JSON sent to clients: `{_id, v, ciphertext, iv, site?, username?, salt?, createdAt, updatedAt}` (legacy fields only when present; never `userId`).
- `POST /api/secrets` → 201, sets `v: 2`; 409 `{error: 'Entry limit reached'}` at `config.maxEntries`.
- `PUT /api/secrets/:id` → sets `v: 2, ciphertext, iv` and **unsets** `site, username, salt`.

- [ ] **Step 1: Failing tests:**
  - vault: unauthenticated → 401; `GET` → `{vault: null}`; `POST` valid → 201; second `POST` → 409; salt of 8 bytes → 400.
  - secrets: create/list/update/delete round trip; list newest first; user B gets 404 on user A's id for PUT and DELETE and does not see it in the list.
  - `PUT` on a legacy doc (insert directly with `site, username, salt`) removes those fields.
  - extra field `site` in POST body → 400; IV of 16 bytes → 400; ciphertext of 16,385 chars → 400.
  - `PUT /api/secrets/not-an-id` → 404, then `GET /api/health` → 200 (process survived).
  - body over 64 KB → 413 JSON.
  - `maxEntries: 2` app: third create → 409.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement. Validate `:id` with `mongoose.isValidObjectId` → 404 before querying. Drop `GET /api/secrets/:id`.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(vault): vault record and fully encrypted v2 entries`.

### Task 5: Frontend tooling and API client

**Files:**
- Create: `frontend/src/lib/api.js` (replaces `src/api.js`), `frontend/src/lib/api.test.js`
- Modify: `frontend/package.json`, `frontend/vite.config.js`, `frontend/eslint.config.js`
- Delete: `frontend/src/api.js`

**Interfaces:**
- Produces: `api.get(path)`, `api.post(path, body?)`, `api.put(path, body)`, `api.del(path)` → parsed JSON. Base URL `import.meta.env.VITE_API_URL ?? 'http://localhost:3000'`, `credentials: 'include'`, JSON content type, 60 s `AbortSignal.timeout`.
- Produces: `class ApiError extends Error { status }` — `status` 0 for network/timeout; `message` from the body's `error` or a generic text.
- Produces: `setUnauthorizedHandler(fn)` — called on any 401 except from `/api/auth/session`, `/api/auth/login`, `/api/auth/signup`.

- [ ] **Step 1:** Deps: remove `axios`, `uuid`, `cors`; keep `crypto-js` (legacy only); add `lucide-react`, `@fontsource-variable/inter`; devDeps `vitest`. Script `"test": "vitest run"`. Vitest env `node`. `npm audit --omit=dev` → 0 vulnerabilities.
- [ ] **Step 2: Failing tests** (stub `globalThis.fetch`): JSON body and `credentials: 'include'` sent; 409 with `{error: 'x'}` rejects `ApiError` status 409 message `x`; fetch throwing → `ApiError` status 0; 401 on `/api/secrets` calls the unauthorized handler; 401 on `/api/auth/session` does not.
- [ ] **Step 3:** `npm test` → FAIL. **Step 4:** implement. **Step 5:** `npm test` → PASS.
- [ ] **Step 6: Commit** `refactor(frontend): fetch client, trimmed deps, vitest`.

### Task 6: WebCrypto vault module and legacy decrypt

**Files:**
- Create: `frontend/src/lib/crypto.js`, `frontend/src/lib/legacyCrypto.js`, `frontend/src/lib/crypto.test.js`
- Delete: `frontend/src/utils/crypto.js`

**Interfaces:**
- Produces (`crypto.js`): `ITERATIONS = 600000`; `createVault(password) → Promise<{record: {salt, iterations, verifier}, key: CryptoKey}>`; `openVault(record, password) → Promise<CryptoKey | null>` (null on wrong password); `encryptJson(key, value) → Promise<{ciphertext, iv}>`; `decryptJson(key, {ciphertext, iv}) → Promise<any>` (rejects on tamper/wrong key). Key is non-extractable.
- Produces (`legacyCrypto.js`): `decryptLegacy({ciphertext, salt, iv}, password) → string | null` — null when output is empty, contains a control character (`/[\u0000-\u001f\u007f]/`), or decoding throws.

- [ ] **Step 1: Failing tests:** round trip of `{site, username, password}`; `openVault` with wrong password → null; right password → key that decrypts an entry made at creation; flipping one ciphertext byte → rejects; two encryptions of the same value have different IVs; password `"  pässwörd 🔑 "` round-trips and `"pässwörd 🔑"` (trimmed) fails; a legacy blob produced in-test with the exact old `encrypt` code (copy it into the test as `legacyEncrypt`) decrypts via `decryptLegacy`, and the wrong password returns null. Use a lowered iteration count only through a test-only parameter `createVault(password, {iterations})` so tests stay fast.
- [ ] **Step 2:** `npm test` → FAIL. **Step 3:** implement. **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat(crypto): WebCrypto vault, legacy decrypt for migration`.

### Task 7: Pure UI helpers

**Files:**
- Create: `frontend/src/lib/site.js`, `frontend/src/lib/generator.js`, `frontend/src/lib/helpers.test.js`

**Interfaces:**
- `normalizeSite(input) → string`: trim; empty → `''`; no scheme and looks like a host → prefix `https://`; otherwise unchanged.
- `safeHref(site) → string | null`: only `http:`/`https:` URLs that parse.
- `siteLabel(site) → string`: hostname without `www.` when parseable, else the trimmed text.
- `generatePassword({length = 20, digits = true, symbols = true}) → string`: `crypto.getRandomValues` with rejection sampling; always lower+upper; at least one of each enabled class; length clamped to 8–64.
- `strength(password) → 0..4`: `bits = length × log2(pool)`; thresholds `<28 → 0, <40 → 1, <60 → 2, <80 → 3, else 4`.

- [ ] **Step 1: Failing tests:** `normalizeSite(' github.com ')` → `https://github.com`; `safeHref('javascript:alert(1)')` → null; `safeHref(' https://a.com ')` → `https://a.com/`; `siteLabel('https://www.github.com/login')` → `github.com`; generator length 8/64 clamp, class guarantees over 200 runs, no digits when `digits: false`; `strength('password')` ≤ 1, `strength(generatePassword())` = 4.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(frontend): site, generator and strength helpers`.

### Task 8: Vault session logic

**Files:**
- Create: `frontend/src/lib/vaultSession.js`, `frontend/src/lib/vaultSession.test.js`

**Interfaces:**
- Consumes: Task 6 functions, `decryptLegacy` via `await import('./legacyCrypto.js')` only when a legacy secret is present.
- Produces: `Entry = {id, site, username, password, createdAt}`.
- Produces: `isLegacy(secret) → boolean` (`secret.v !== 2`).
- Produces: `legacyPasswordMatches(secrets, password) → Promise<boolean>` (tries legacy secrets in order, true on the first that decrypts).
- Produces: `loadEntries(key, password, secrets, onProgress?) → Promise<{entries: Entry[], migrations: {id, payload: {ciphertext, iv}}[], broken: Secret[]}>` — v2 entries decrypted; legacy entries decrypted with `decryptLegacy`, turned into entries, and re-encrypted into `migrations`; failures go to `broken` (raw secret kept so it can be retried). Between legacy entries it awaits `new Promise(r => setTimeout(r))` and calls `onProgress(done, total)`.
- Produces: `recoverLegacy(key, password, secret) → Promise<{entry, migration} | null>` — the "Try another password" path for one broken row.

- [ ] **Step 1: Failing tests:** mixed list (one v2, one legacy, one legacy under a different password) → 2 entries, 1 migration whose payload decrypts with `key` to the legacy plaintext, 1 broken; `recoverLegacy` with the second password returns an entry and a migration, with a wrong one returns null. `onProgress` called with `(1, 2)` and `(2, 2)`. `legacyPasswordMatches` true/false. With no legacy secrets, `loadEntries` must not import `legacyCrypto` (spy via `vi.mock` call count).
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(vault): unlock, decrypt and lazy legacy migration`.

### Task 9: Design system, shell and auth screen

**Files:**
- Create: `frontend/src/styles.css` (replaces `App.css`, `index.css`), `frontend/src/components/ui/{Button,TextField,Dialog,Wordmark}.jsx`, `frontend/src/components/AuthScreen.jsx`, `frontend/public/favicon.svg`
- Modify: `frontend/index.html`, `frontend/src/main.jsx`, `frontend/src/App.jsx`
- Delete: `src/App.css`, `src/index.css`, `src/components/{Navbar,Footer,LoginPage}.jsx`, `src/assets/react.svg`, `public/{favicon.png,heart.png,vite.svg,eyeopen.svg,eyeclosed.svg}`

**Interfaces:**
- `styles.css`: `@import "tailwindcss"`, `@import "@fontsource-variable/inter"`; tokens from spec §5 as CSS variables for light, overridden in `@media (prefers-color-scheme: dark)`, exposed through `@theme inline` as `bg, surface, surface-2, border, fg, muted, accent, accent-fg, danger, ring`; global `:focus-visible` 2 px ring; reduced-motion rule.
- `Button({variant: 'primary'|'secondary'|'ghost'|'danger', size: 'md'|'icon', loading, ...})`; icon size requires `aria-label`. Min height 44 px.
- `TextField({label, error, type, revealable, hint, ...inputProps})` — label element, `aria-invalid`, `aria-describedby` to error/hint, eye toggle when `revealable`.
- `Dialog({open, onClose, title, children})` on native `<dialog>` + `showModal()`; Escape and backdrop click close; focus returns to the opener.
- `App` state: `user: undefined (checking) | null | {id, email}`; registers `setUnauthorizedHandler(() => setUser(null))`; shows "Waking up the server…" after 3 s of checking; status 0 shows a retry. Signed in renders `<VaultGate user onLogout>` (Task 10).
- `AuthScreen({onAuthed})`: tabs Sign in / Create account, `autocomplete` `email` / `current-password` / `new-password`, inline errors, "Continue with Google" link to `${API}/auth/google`, reads `?auth=fail` and shows an error.
- `index.html`: title `PassOP — password manager`, `theme-color`, SVG favicon, no lordicon script.

- [ ] **Step 1:** Implement.
- [ ] **Step 2: Verify:** `npm run lint` → 0 problems; `npm run build` succeeds; `grep -r lordicon frontend/index.html frontend/src` → nothing.
- [ ] **Step 3: Commit** `feat(ui): design tokens, primitives and auth screen`.

### Task 10: Vault screens

**Files:**
- Create: `frontend/src/components/{VaultGate,VaultSetup,UnlockScreen,VaultView,EntryRow,EntryDialog,PasswordGenerator,ConfirmDialog}.jsx`, `frontend/src/hooks/useIdleLock.js`, `frontend/src/lib/clipboard.js`
- Delete: `frontend/src/components/Manager.jsx`

**Interfaces:**
- `VaultGate({user, onLogout})` state: `loading | setup | locked | unlocking | unlocked`; holds `key`, `entries`, `broken`; `unlocking` shows "Upgrading encryption n / N" when legacy entries exist; after unlock runs `migrations` sequentially with `api.put` and toasts "Upgraded N entries" (failures stay legacy silently and retry next unlock).
- Broken rows render in a "Can't decrypt" section with **Try another password** (small dialog → `recoverLegacy` → `api.put` → moves into `entries`) and delete.
- `VaultSetup({hasLegacy, onCreated(key, password)})`: no legacy → password + confirm, strength meter, min 8 chars; legacy → single field "existing master password", checked with `legacyPasswordMatches` before `createVault` + `POST /api/vault`.
- `UnlockScreen({record, onUnlocked(key, password)})`: wrong password shows inline "Wrong master password" and keeps focus in the field.
- `VaultView({entries, broken, onSave, onDelete, onLock, onLogout, email})`: search filters on `siteLabel(site)` and `username`, case-insensitive; empty vault and no-results states each have an action.
- `EntryRow`: letter avatar, `siteLabel`, username, `••••••••`, reveal toggle, copy username, copy password, open (only when `safeHref`), edit, delete — all labelled icon buttons.
- `EntryDialog({entry | null, onSubmit})`: site (required, normalised on blur), username, password (required, revealable) + `PasswordGenerator` (length slider 8–64, digits, symbols, regenerate, "Use password").
- `copySecret(text, {clearAfterMs})` in `clipboard.js`; `useIdleLock(onIdle, 600000)` listens to `pointerdown`, `keydown`, `visibilitychange`.

- [ ] **Step 1:** Implement.
- [ ] **Step 2: Verify:** `npm run lint`, `npm test`, `npm run build` all clean; `dist/assets/*.js` main chunk gzip < 90 KB and crypto-js lives in a separate chunk (`grep -l PBKDF2 dist/assets/*.js` lists only a non-entry chunk).
- [ ] **Step 3: Commit** `feat(ui): vault setup, unlock, list and entry editor`.

### Task 11: Docs and end-to-end check

**Files:**
- Modify: `README.md`, `frontend/README.md` (delete the Vite boilerplate)

- [ ] **Step 1:** README: what it is, security model (one diagram), setup, env vars, tests, and a top warning that the old `.env` values were public and must be rotated.
- [ ] **Step 2: E2E:** start a memory Mongo, backend on :3000 with `FRONTEND_URL=http://localhost:5173`, `vite` on :5173. In a browser: sign up → create master password → add 2 entries (one via generator) → search → edit → copy → lock → wrong password shows error → unlock → delete → log out → log in. Then seed a legacy entry (crypto-js format) for a fresh user and confirm setup-with-existing-password migrates it (DB doc gets `v: 2`, no `site`). Check 360 px width and dark/light.
- [ ] **Step 3:** Fix anything found; re-run both test suites.
- [ ] **Step 4: Commit** `docs: security model and setup`.
