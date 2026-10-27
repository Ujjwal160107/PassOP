import { describe, expect, it } from 'vitest'
import { normalizeSite, safeHref, siteLabel } from './site.js'
import { generatePassword, strength } from './generator.js'

describe('site helpers', () => {
  it('adds https to a bare domain and trims it', () => {
    expect(normalizeSite(' github.com ')).toBe('https://github.com')
    expect(normalizeSite('http://intranet.local')).toBe('http://intranet.local')
    expect(normalizeSite('   ')).toBe('')
    expect(normalizeSite('My bank app')).toBe('My bank app')
  })

  it('only links http and https', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull()
    expect(safeHref(' JavaScript:alert(1)')).toBeNull()
    expect(safeHref('data:text/html,hi')).toBeNull()
    expect(safeHref('My bank app')).toBeNull()
    expect(safeHref(' https://a.com ')).toBe('https://a.com/')
  })

  it('labels a site by hostname', () => {
    expect(siteLabel('https://www.github.com/login')).toBe('github.com')
    expect(siteLabel('My bank app')).toBe('My bank app')
    expect(siteLabel('')).toBe('')
  })
})

describe('password generator', () => {
  it('clamps length to 8..64', () => {
    expect(generatePassword({ length: 3 })).toHaveLength(8)
    expect(generatePassword({ length: 500 })).toHaveLength(64)
    expect(generatePassword()).toHaveLength(20)
  })

  it('always includes every enabled character class', () => {
    for (let i = 0; i < 200; i++) {
      const pw = generatePassword({ length: 8 })
      expect(pw).toMatch(/[a-z]/)
      expect(pw).toMatch(/[A-Z]/)
      expect(pw).toMatch(/[0-9]/)
      expect(pw).toMatch(/[^A-Za-z0-9]/)
    }
  })

  it('leaves out disabled classes', () => {
    for (let i = 0; i < 50; i++) {
      expect(generatePassword({ digits: false, symbols: false })).toMatch(/^[A-Za-z]+$/)
    }
  })
})

describe('strength', () => {
  it('scores weak and strong passwords', () => {
    expect(strength('')).toBe(0)
    expect(strength('password')).toBeLessThanOrEqual(1)
    expect(strength(generatePassword())).toBe(4)
  })
})

describe('setup validation', async () => {
  const { validateSetup } = await import('./setup.js')

  it('requires 8 characters and a matching confirmation for a new vault', () => {
    expect(validateSetup({ password: 'short', confirm: 'short', hasLegacy: false })).toEqual({ password: 'Use at least 8 characters' })
    expect(validateSetup({ password: 'long enough', confirm: 'other', hasLegacy: false })).toEqual({ confirm: "Passwords don't match" })
    expect(validateSetup({ password: 'long enough', confirm: 'long enough', hasLegacy: false })).toEqual({})
  })

  it('accepts any non-empty existing master password, since the old app had no minimum', () => {
    expect(validateSetup({ password: 'abc', confirm: '', hasLegacy: true })).toEqual({})
    expect(validateSetup({ password: '', confirm: '', hasLegacy: true })).toEqual({ password: 'Enter your existing master password' })
  })
})
