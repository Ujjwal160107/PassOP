import { useCallback, useEffect, useState } from 'react'
import { ToastContainer } from 'react-toastify'
import { CloudOff, LoaderCircle } from 'lucide-react'
import { api, setUnauthorizedHandler } from './lib/api.js'
import AuthScreen from './components/AuthScreen.jsx'
import VaultGate from './components/VaultGate.jsx'
import Button from './components/ui/Button.jsx'
import CenteredCard from './components/ui/CenteredCard.jsx'

const SLOW_AFTER_MS = 3000

function SessionCheck({ slow }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-sm text-muted" role="status">
      <LoaderCircle className="size-6 animate-spin text-accent" aria-hidden="true" />
      {slow ? 'Waking up the server… this can take up to a minute.' : 'Loading…'}
    </div>
  )
}

export default function App() {
  // undefined = still checking, null = signed out
  const [user, setUser] = useState(undefined)
  const [slow, setSlow] = useState(false)
  const [error, setError] = useState(null)

  const checkSession = useCallback(async () => {
    setUser(undefined)
    setError(null)
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS)
    try {
      const { user } = await api.get('/api/auth/session')
      setUser(user)
    } catch (err) {
      if (err.status === 401) setUser(null)
      else setError(err.message)
    } finally {
      clearTimeout(timer)
      setSlow(false)
    }
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null))
    checkSession()
    return () => setUnauthorizedHandler(null)
  }, [checkSession])

  const logout = async () => {
    await api.post('/api/auth/logout').catch(() => {})
    setUser(null)
  }

  let screen
  if (error) {
    screen = (
      <CenteredCard icon={CloudOff} title="Can't reach PassOP" subtitle={error}>
        <Button variant="primary" className="w-full" onClick={checkSession}>Try again</Button>
      </CenteredCard>
    )
  } else if (user === undefined) {
    screen = <SessionCheck slow={slow} />
  } else if (user === null) {
    screen = <AuthScreen onAuthed={setUser} />
  } else {
    screen = <VaultGate key={user.id} user={user} onLogout={logout} />
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="flex flex-1 flex-col">{screen}</main>
      <footer className="px-4 py-6 text-center text-xs text-muted">
        Made by <a href="https://github.com/BEAST6869" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-fg">Ujjwal Tiwari</a>
      </footer>
      <ToastContainer position="bottom-center" autoClose={2500} limit={3} hideProgressBar newestOnTop />
    </div>
  )
}
