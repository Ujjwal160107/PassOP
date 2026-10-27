# PassOP — Password Manager

PassOP is an end-to-end encrypted password manager built on the MERN stack (MongoDB, Express, React, Node.js). Every entry is encrypted in the browser with a key derived from your master password, so the server only ever stores ciphertext.

> **Security notice:** an earlier version of this repository committed `backend/.env`. The MongoDB URI, `JWT_SECRET` and Google OAuth secret in it were public. If you deployed with those values, rotate all three. The file is no longer tracked, but it is still in git history.

## Features

* **Zero-knowledge vault.** Site, username and password are encrypted together on your device (AES-GCM-256). The server never sees any of them.
* **Master password with verification.** A wrong master password is detected, never "accepted" with garbage results.
* **Accounts.** Email and password (bcrypt), or Google sign-in.
* **Password generator** with a strength meter.
* **Auto-lock** after 10 minutes idle. **Clipboard clears** 30 seconds after copying a password.
* **Automatic upgrade** of entries saved by older versions of PassOP.
* Light and dark themes that follow your system, usable from 360 px wide and by keyboard alone.

## Security model

```
master password ──PBKDF2-SHA256, 600k iterations, per-user salt──▶ AES-GCM key (memory only)
                                                                      │
              verifier: encrypt("passop-vault-v2") ◀──────────────────┤
              each entry: encrypt({site, username, password}) ◀───────┘
                          fresh 12-byte IV every time
```

* The key is derived **once per unlock** with WebCrypto, is non-extractable, and is dropped on lock, logout or idle.
* The server stores `{salt, iterations, verifier}` per user and `{ciphertext, iv}` per entry.
* Sessions are a 7-day HS256 JWT in an httpOnly cookie. Writes must come from `FRONTEND_URL` (Origin check). Login and signup are limited to 10 attempts per 15 minutes per IP.
* Inputs are validated with zod. Mongo query operators in request bodies are stripped.
* Google sign-in uses a `state` check, and only links to an existing account when Google reports the email as verified.

If you forget your master password, your vault cannot be recovered. That is the price of the server knowing nothing.

## Tech stack

| | |
|---|---|
| Frontend | React 19, Vite 7, Tailwind CSS 4, lucide-react, react-toastify, WebCrypto |
| Backend | Node.js, Express 5, Mongoose 8, zod, bcrypt, Passport (Google), helmet, express-rate-limit |
| Tests | node:test + supertest + mongodb-memory-server (backend), Vitest (frontend) |

## Project structure

```
backend/
  app.js            Express app factory (used by server.js and tests)
  server.js         loads config, connects to Mongo, listens
  config.js         env validation
  validation.js     zod schemas
  auth/google.js    Google strategy + OAuth state cookie
  middleware/       auth, origin check, errors
  models/           User (with vault record), Secret
  routes/           auth, oauth, vault, secrets
  test/
frontend/src/
  lib/              api client, crypto, legacy migration, site + generator helpers
  components/       screens (auth, setup, unlock, vault) and ui/ primitives
  hooks/            idle auto-lock
```

## Setup

Requires Node.js 20+ and a MongoDB database.

### Backend

```bash
cd backend
npm install
cp .env.example .env   # then fill it in
npm start              # http://localhost:3000
```

| Variable | Required | Notes |
|---|---|---|
| `MONGO_URI` | yes | MongoDB connection string |
| `JWT_SECRET` | yes | at least 32 characters, e.g. `openssl rand -hex 32` |
| `FRONTEND_URL` | yes | frontend origin, e.g. `http://localhost:5173` |
| `API_BASE_URL` | no | public API origin, used for the Google callback |
| `GOOGLE_ID`, `GOOGLE_SECRET` | no | leave empty to disable Google sign-in |
| `NODE_ENV` | no | `production` enables `Secure; SameSite=None` cookies |
| `PORT` | no | default 3000 |

The server refuses to start if a required variable is missing.

Interactive API docs (Swagger UI) are served at `/docs`, for example `http://localhost:3000/docs`. The raw OpenAPI spec is at `/docs/openapi.json`.

### Frontend

```bash
cd frontend
npm install
echo "VITE_API_URL=http://localhost:3000" > .env.local
npm run dev            # http://localhost:5173
```

## Tests

```bash
cd backend && npm test     # downloads a MongoDB binary on first run
cd frontend && npm test
```

## Deploying

Deploy the backend and frontend **together**. The API only accepts the new encrypted format, so an old frontend cannot talk to a new backend. Existing users are asked for their master password once and their entries are upgraded automatically.

## License

ISC
