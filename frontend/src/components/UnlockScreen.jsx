import { useRef, useState } from 'react'
import { Lock } from 'lucide-react'
import { openVault } from '../lib/crypto.js'
import Button from './ui/Button.jsx'
import TextField from './ui/TextField.jsx'
import CenteredCard from './ui/CenteredCard.jsx'

export default function UnlockScreen({ email, record, onUnlocked, onLogout }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)

  const submit = async e => {
    e.preventDefault()
    if (!password) return setError('Enter your master password')
    setBusy(true)
    setError(null)
    const key = await openVault(record, password)
    if (key) return onUnlocked(key, password)
    setBusy(false)
    setError('Wrong master password')
    inputRef.current?.select()
  }

  return (
    <CenteredCard icon={Lock} title="Unlock your vault" subtitle={`Signed in as ${email}`}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <TextField
          ref={inputRef}
          label="Master password"
          type="password"
          revealable
          autoComplete="off"
          autoFocus
          value={password}
          onChange={e => setPassword(e.target.value)}
          error={error}
        />
        <Button type="submit" variant="primary" loading={busy} className="w-full">Unlock</Button>
        <Button variant="ghost" onClick={onLogout} className="w-full">Log out</Button>
      </form>
    </CenteredCard>
  )
}
