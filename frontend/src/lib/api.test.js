import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, setUnauthorizedHandler } from './api.js'

function respond(status, body) {
  return vi.fn().mockResolvedValue(new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
  setUnauthorizedHandler(null)
})

describe('api', () => {
  it('sends JSON with credentials and returns the parsed body', async () => {
    const fetch = respond(200, { ok: true })
    vi.stubGlobal('fetch', fetch)
    await expect(api.post('/api/vault', { a: 1 })).resolves.toEqual({ ok: true })
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('http://localhost:3000/api/vault')
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.body).toBe('{"a":1}')
  })

  it('rejects with the server error message and status', async () => {
    vi.stubGlobal('fetch', respond(409, { error: 'x' }))
    const err = await api.post('/api/vault', {}).catch(e => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(409)
    expect(err.message).toBe('x')
  })

  it('maps network failures to status 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const err = await api.get('/api/secrets').catch(e => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(0)
  })

  it('reports an expired session on data routes', async () => {
    vi.stubGlobal('fetch', respond(401, { error: 'Not authenticated' }))
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    await api.get('/api/secrets').catch(() => {})
    expect(onUnauthorized).toHaveBeenCalledOnce()
  })

  it('does not report 401 from the session check or login', async () => {
    vi.stubGlobal('fetch', respond(401, { error: 'Invalid credentials' }))
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    await api.get('/api/auth/session').catch(() => {})
    await api.post('/api/auth/login', {}).catch(() => {})
    expect(onUnauthorized).not.toHaveBeenCalled()
  })
})
