import { afterEach, describe, expect, it, vi } from 'vitest'
import CryptoJS from 'crypto-js'
import { createVault, encryptJson, decryptJson } from './crypto.js'

const legacyImports = vi.hoisted(() => ({ count: 0 }))
vi.mock('./legacyCrypto.js', async importOriginal => {
  legacyImports.count++
  return importOriginal()
})

const { loadEntries, recoverLegacy, legacyPasswordMatches, isLegacy, unlockEntries } = await import('./vaultSession.js')

function legacyEncrypt(data, key) {
  const salt = CryptoJS.lib.WordArray.random(16).toString()
  const iv = CryptoJS.lib.WordArray.random(16).toString()
  const derivedKey = CryptoJS.PBKDF2(key, salt, { keySize: 8, iterations: 100000 }).toString()
  return { ciphertext: CryptoJS.AES.encrypt(data, derivedKey, { iv: CryptoJS.enc.Hex.parse(iv) }).toString(), salt, iv }
}

const legacySecret = (id, password, master) => ({
  _id: id, site: 'https://old.com', username: 'olduser', createdAt: '2024-01-01T00:00:00.000Z',
  ...legacyEncrypt(password, master),
})

afterEach(() => { legacyImports.count = 0 })

describe('vault session', () => {
  it('does not load legacy crypto for a v2-only vault', async () => {
    const { key } = await createVault('m', { iterations: 1000 })
    const sealed = await encryptJson(key, { site: 'https://a.com', username: 'u', password: 'p' })
    const { entries } = await loadEntries(key, 'm', [{ _id: '1', v: 2, createdAt: 'x', ...sealed }])
    expect(entries).toEqual([{ id: '1', site: 'https://a.com', username: 'u', password: 'p', createdAt: 'x' }])
    expect(legacyImports.count).toBe(0)
  })

  it('decrypts v2, migrates legacy and reports the rest as broken', async () => {
    const { key } = await createVault('master', { iterations: 1000 })
    const v2 = { _id: 'a', v: 2, site: 's', username: 'u', createdAt: 'x', ...(await encryptJson(key, { site: 's', username: 'u', password: 'p' })) }
    const old = legacySecret('b', 'hunter2', 'master')
    const other = legacySecret('c', 'zzz', 'a typo master')
    const progress = vi.fn()

    const { entries, migrations, broken } = await loadEntries(key, 'master', [v2, old, other], progress)

    expect(entries.map(e => e.id)).toEqual(['a', 'b'])
    expect(entries[1]).toMatchObject({ site: 'https://old.com', username: 'olduser', password: 'hunter2' })
    expect(migrations).toHaveLength(1)
    expect(migrations[0].id).toBe('b')
    expect(await decryptJson(key, migrations[0].payload)).toEqual({ site: 'https://old.com', username: 'olduser', password: 'hunter2' })
    expect(broken.map(s => s._id)).toEqual(['c'])
    expect(progress.mock.calls).toEqual([[1, 2], [2, 2]])
  })

  it('recovers a broken legacy entry with its own password', async () => {
    const { key } = await createVault('master', { iterations: 1000 })
    const other = legacySecret('c', 'zzz', 'a typo master')
    expect(await recoverLegacy(key, 'wrong', other)).toBeNull()
    const { entry, migration } = await recoverLegacy(key, 'a typo master', other)
    expect(entry).toMatchObject({ id: 'c', password: 'zzz' })
    expect(await decryptJson(key, migration.payload)).toMatchObject({ password: 'zzz' })
  })

  it('checks a password against legacy entries', async () => {
    const secrets = [legacySecret('x', 'p1', 'one'), legacySecret('y', 'p2', 'two')]
    expect(await legacyPasswordMatches(secrets, 'two')).toBe(true)
    expect(await legacyPasswordMatches(secrets, 'three')).toBe(false)
  })

  it('reports a corrupted v2 entry as broken instead of failing the unlock', async () => {
    const { key } = await createVault('m', { iterations: 1000 })
    const good = { _id: 'g', v: 2, createdAt: 'x', ...(await encryptJson(key, { site: 's', username: 'u', password: 'p' })) }
    const bad = { ...good, _id: 'b', ciphertext: good.ciphertext.replace(/^./, c => (c === 'A' ? 'B' : 'A')) }
    const { entries, broken } = await loadEntries(key, 'm', [good, bad])
    expect(entries.map(e => e.id)).toEqual(['g'])
    expect(broken.map(s => s._id)).toEqual(['b'])
  })

  it('saves every migration before the vault opens, and survives a failed save', async () => {
    const { key } = await createVault('master', { iterations: 1000 })
    const secrets = [legacySecret('a', 'pw-a', 'master'), legacySecret('b', 'pw-b', 'master')]
    const puts = []
    const api = {
      get: async () => secrets,
      put: async path => {
        await new Promise(r => setTimeout(r, 20))
        if (path.endsWith('/b')) throw new Error('offline')
        puts.push(path)
      },
    }
    const result = await unlockEntries(key, 'master', api)
    expect(puts).toEqual(['/api/secrets/a'])
    expect(result.migrated).toBe(1)
    expect(result.entries.map(e => e.password)).toEqual(['pw-a', 'pw-b'])
  })

  it('treats entries without v: 2 as legacy', () => {
    expect(isLegacy({ v: 2 })).toBe(false)
    expect(isLegacy({ salt: 'x' })).toBe(true)
  })
})
