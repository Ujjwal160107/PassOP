import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { api, API_URL } from '../lib/api.js'
import Button from './ui/Button.jsx'
import TextField from './ui/TextField.jsx'
import CenteredCard from './ui/CenteredCard.jsx'

const MODES = {
  signin: { tab: 'Sign in', title: 'Welcome back', submit: 'Sign in', path: '/api/auth/login', autoComplete: 'current-password' },
  signup: { tab: 'Create account', title: 'Create your account', submit: 'Create account', path: '/api/auth/signup', autoComplete: 'new-password' },
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09a6.6 6.6 0 0 1 0-4.18V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.96 10.96 0 0 0 12 1 11 11 0 0 0 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  )
}

export default function AuthScreen({ onAuthed }) {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const current = MODES[mode]

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('auth') === 'fail') {
      setError('Google sign-in failed. If you created a PassOP account with this email and a password, sign in with that password instead.')
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  const switchMode = next => {
    setMode(next)
    setError(null)
  }

  const submit = async e => {
    e.preventDefault()
    if (mode === 'signup' && password.length < 8) return setError('Password must be at least 8 characters')
    setBusy(true)
    setError(null)
    try {
      const { user } = await api.post(current.path, { email, password })
      onAuthed(user)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <CenteredCard icon={ShieldCheck} title={current.title} subtitle="Your passwords are encrypted on this device before they leave it.">
      <div role="tablist" aria-label="Account" className="mb-6 grid grid-cols-2 rounded-ctl bg-surface-2 p-1">
        {Object.entries(MODES).map(([key, m]) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={mode === key}
            onClick={() => switchMode(key)}
            className={`h-9 rounded-[8px] text-sm font-medium transition-colors duration-150 cursor-pointer ${mode === key ? 'bg-surface text-fg ring-1 ring-border' : 'text-muted hover:text-fg'}`}
          >
            {m.tab}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <TextField label="Email" type="email" name="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
        <TextField
          label="Account password"
          type="password"
          name="password"
          revealable
          autoComplete={current.autoComplete}
          required
          value={password}
          onChange={e => setPassword(e.target.value)}
          hint={mode === 'signup' ? 'At least 8 characters. Your master password is set separately next.' : undefined}
        />
        {error && <p role="alert" className="rounded-ctl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <Button type="submit" variant="primary" loading={busy} className="w-full">{current.submit}</Button>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-muted" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" />
      </div>
      <a
        href={`${API_URL}/auth/google`}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-ctl border border-border bg-surface text-sm font-medium transition-colors duration-150 hover:bg-surface-2"
      >
        <GoogleIcon /> Continue with Google
      </a>
    </CenteredCard>
  )
}
