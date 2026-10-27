const BASE_URL = (import.meta.env?.VITE_API_URL ?? 'http://localhost:3000').replace(/\/$/, '')
// Generous because a free-tier backend can take ~50 s to wake from sleep.
const TIMEOUT_MS = 60_000
// A 401 from these means "wrong credentials" or "not signed in yet", not "session expired".
const AUTH_PATHS = ['/api/auth/session', '/api/auth/login', '/api/auth/signup']

export const API_URL = BASE_URL

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

let onUnauthorized = null
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn
}

async function request(method, path, body) {
  let res
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      credentials: 'include',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.')
  }

  const data = await res.json().catch(() => null)
  if (res.ok) return data

  if (res.status === 401 && !AUTH_PATHS.includes(path)) onUnauthorized?.()
  throw new ApiError(res.status, data?.error || `Request failed (${res.status})`)
}

export const api = {
  get: path => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  del: path => request('DELETE', path),
}
