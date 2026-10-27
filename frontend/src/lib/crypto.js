// Vault crypto on WebCrypto: one PBKDF2 derivation per unlock, AES-GCM per entry.
export const ITERATIONS = 600_000
const VERIFIER_TEXT = 'passop-vault-v2'
const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function toBase64(bytes) {
  let binary = ''
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function fromBase64(text) {
  return Uint8Array.from(atob(text), c => c.charCodeAt(0))
}

async function deriveKey(password, salt, iterations) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function encryptText(key, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(text))
  return { ciphertext: toBase64(sealed), iv: toBase64(iv) }
}

async function decryptText(key, { ciphertext, iv }) {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(iv) }, key, fromBase64(ciphertext))
  return decoder.decode(plain)
}

export const encryptJson = (key, value) => encryptText(key, JSON.stringify(value))
export const decryptJson = async (key, sealed) => JSON.parse(await decryptText(key, sealed))

export async function createVault(password, { iterations = ITERATIONS } = {}) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await deriveKey(password, salt, iterations)
  const verifier = await encryptText(key, VERIFIER_TEXT)
  return { record: { salt: toBase64(salt), iterations, verifier }, key }
}

// Returns null for a wrong password: AES-GCM authentication fails on the verifier.
export async function openVault(record, password) {
  const key = await deriveKey(password, fromBase64(record.salt), record.iterations)
  try {
    return (await decryptText(key, record.verifier)) === VERIFIER_TEXT ? key : null
  } catch {
    return null
  }
}
