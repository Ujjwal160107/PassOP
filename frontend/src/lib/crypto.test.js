import { describe, expect, it } from 'vitest'
import CryptoJS from 'crypto-js'
import { createVault, openVault, encryptJson, decryptJson, ITERATIONS } from './crypto.js'
import { decryptLegacy, decryptWithDerivedKey } from './legacyCrypto.js'

const FAST = { iterations: 1000 }
const ENTRY = { site: 'https://github.com', username: 'octo', password: 's3cret!' }

// Verbatim copy of the pre-2026 frontend encrypt(), used to produce real legacy blobs.
function legacyEncrypt(data, key) {
  const salt = CryptoJS.lib.WordArray.random(128 / 8).toString()
  const iv = CryptoJS.lib.WordArray.random(128 / 8).toString()
  const derivedKey = CryptoJS.PBKDF2(key, salt, { keySize: 256 / 32, iterations: 100000 }).toString()
  const encrypted = CryptoJS.AES.encrypt(data, derivedKey, { iv: CryptoJS.enc.Hex.parse(iv) }).toString()
  return { ciphertext: encrypted, salt, iv }
}

describe('vault crypto', () => {
  it('uses 600k iterations by default', () => {
    expect(ITERATIONS).toBe(600000)
  })

  it('round-trips an entry', async () => {
    const { key } = await createVault('master pw', FAST)
    const sealed = await encryptJson(key, ENTRY)
    expect(sealed.ciphertext).not.toContain('octo')
    expect(await decryptJson(key, sealed)).toEqual(ENTRY)
  })

  it('creates a vault record with a 16-byte salt and a verifier', async () => {
    const { record } = await createVault('master pw', FAST)
    expect(atob(record.salt)).toHaveLength(16)
    expect(record.iterations).toBe(1000)
    expect(atob(record.verifier.iv)).toHaveLength(12)
  })

  it('opens with the right password and refuses the wrong one', async () => {
    const { record, key } = await createVault('master pw', FAST)
    const sealed = await encryptJson(key, ENTRY)
    expect(await openVault(record, 'master pwx')).toBeNull()
    const reopened = await openVault(record, 'master pw')
    expect(await decryptJson(reopened, sealed)).toEqual(ENTRY)
  })

  it('does not trim or normalise the master password', async () => {
    const password = '  pässwörd 🔑 '
    const { record } = await createVault(password, FAST)
    expect(await openVault(record, password)).not.toBeNull()
    expect(await openVault(record, password.trim())).toBeNull()
  })

  it('rejects tampered ciphertext', async () => {
    const { key } = await createVault('master pw', FAST)
    const sealed = await encryptJson(key, ENTRY)
    const bytes = Uint8Array.from(atob(sealed.ciphertext), c => c.charCodeAt(0))
    bytes[0] ^= 1
    const tampered = { ...sealed, ciphertext: btoa(String.fromCharCode(...bytes)) }
    await expect(decryptJson(key, tampered)).rejects.toThrow()
  })

  it('uses a fresh IV for every encryption', async () => {
    const { key } = await createVault('master pw', FAST)
    const a = await encryptJson(key, ENTRY)
    const b = await encryptJson(key, ENTRY)
    expect(a.iv).not.toBe(b.iv)
    expect(a.ciphertext).not.toBe(b.ciphertext)
  })

  it('keeps the derived key non-extractable', async () => {
    const { key } = await createVault('master pw', FAST)
    expect(key.extractable).toBe(false)
  })
})

describe('legacy decrypt', () => {
  it('decrypts a blob made by the old frontend', () => {
    const blob = legacyEncrypt('hunter2', 'old master')
    expect(decryptLegacy(blob, 'old master')).toBe('hunter2')
  })

  it('never accepts a wrong derived key (crypto-js does not check padding)', () => {
    const blob = legacyEncrypt('hunter2', 'old master')
    let accepted = 0
    for (let i = 0; i < 3000; i++) {
      if (decryptWithDerivedKey(blob, CryptoJS.lib.WordArray.random(32).toString()) !== null) accepted++
    }
    expect(accepted).toBe(0)
  })

  it('decrypts unicode plaintext', () => {
    const blob = legacyEncrypt('pässwörd🔑', 'old master')
    expect(decryptLegacy(blob, 'old master')).toBe('pässwörd🔑')
  })

  it('returns null for the wrong password', () => {
    const blob = legacyEncrypt('hunter2', 'old master')
    expect(decryptLegacy(blob, 'other master')).toBeNull()
  })
})
