import { decryptJson, encryptJson } from './crypto.js'

export const isLegacy = secret => secret.v !== 2

const loadLegacy = () => import('./legacyCrypto.js')
const yieldToBrowser = () => new Promise(resolve => setTimeout(resolve))

async function migrateLegacy(key, password, secret, decryptLegacy) {
  const plain = decryptLegacy(secret, password)
  if (plain === null) return null
  const fields = { site: secret.site ?? '', username: secret.username ?? '', password: plain }
  return {
    entry: { id: secret._id, ...fields, createdAt: secret.createdAt },
    migration: { id: secret._id, payload: await encryptJson(key, fields) },
  }
}

// Legacy decryption costs ~0.6 s per entry (crypto-js PBKDF2), so it yields between entries
// and reports progress. It only happens once: migrated entries are saved back as v2.
export async function loadEntries(key, password, secrets, onProgress) {
  const legacyCount = secrets.filter(isLegacy).length
  const { decryptLegacy } = legacyCount ? await loadLegacy() : {}
  const entries = []
  const migrations = []
  const broken = []
  let done = 0

  for (const secret of secrets) {
    if (!isLegacy(secret)) {
      try {
        const fields = await decryptJson(key, secret)
        entries.push({ id: secret._id, ...fields, createdAt: secret.createdAt })
      } catch {
        broken.push(secret) // corrupted or tampered; one bad row must not block the vault
      }
      continue
    }
    await yieldToBrowser()
    const result = await migrateLegacy(key, password, secret, decryptLegacy)
    if (result) {
      entries.push(result.entry)
      migrations.push(result.migration)
    } else {
      broken.push(secret)
    }
    onProgress?.(++done, legacyCount)
  }
  return { entries, migrations, broken }
}

export async function recoverLegacy(key, password, secret) {
  const { decryptLegacy } = await loadLegacy()
  return migrateLegacy(key, password, secret, decryptLegacy)
}

export async function legacyPasswordMatches(secrets, password) {
  const { decryptLegacy } = await loadLegacy()
  for (const secret of secrets.filter(isLegacy)) {
    await yieldToBrowser()
    if (decryptLegacy(secret, password) !== null) return true
  }
  return false
}

// Fetches and decrypts the vault, then writes migrated entries back *before* resolving, so a
// late migration PUT can never overwrite an edit the user makes right after unlocking.
// A failed save leaves that entry legacy on the server; it is retried on the next unlock.
export async function unlockEntries(key, password, api, onProgress) {
  const secrets = await api.get('/api/secrets')
  const { entries, migrations, broken } = await loadEntries(key, password, secrets, onProgress)
  let migrated = 0
  for (const { id, payload } of migrations) {
    try {
      await api.put(`/api/secrets/${id}`, payload)
      migrated++
    } catch {
      // stays legacy; retried next unlock
    }
  }
  return { entries, broken, migrated }
}
