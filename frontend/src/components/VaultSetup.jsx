import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { api } from '../lib/api.js'
import { createVault } from '../lib/crypto.js'
import { legacyPasswordMatches } from '../lib/vaultSession.js'
import { validateSetup } from '../lib/setup.js'
import Button from './ui/Button.jsx'
import TextField from './ui/TextField.jsx'
import CenteredCard from './ui/CenteredCard.jsx'
import StrengthMeter from './ui/StrengthMeter.jsx'

export default function VaultSetup({ legacySecrets, onCreated, onLogout }) {
  const hasLegacy = legacySecrets.length > 0
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  const submit = async e => {
    e.preventDefault()
    const next = validateSetup({ password, confirm, hasLegacy })
    setErrors(next)
    if (Object.keys(next).length) return

    setBusy(true)
    try {
      // A typo here would lock old entries out for good, so prove it opens at least one.
      if (hasLegacy && !(await legacyPasswordMatches(legacySecrets, password))) {
        setErrors({ password: "This doesn't open your saved passwords. Use the master password you used before." })
        setBusy(false)
        return
      }
      const { record, key } = await createVault(password)
      await api.post('/api/vault', record)
      onCreated(record, key, password)
    } catch (err) {
      setErrors({ form: err.message })
      setBusy(false)
    }
  }

  return (
    <CenteredCard
      icon={KeyRound}
      title={hasLegacy ? 'Upgrade your vault' : 'Create your master password'}
      subtitle={hasLegacy
        ? `You have ${legacySecrets.length} saved ${legacySecrets.length === 1 ? 'password' : 'passwords'} from the old version. Enter the master password you used for them and we'll move them to stronger encryption.`
        : 'It encrypts everything on this device. We never see it and cannot reset it, so if you forget it your vault cannot be recovered.'}
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <TextField
          label={hasLegacy ? 'Existing master password' : 'Master password'}
          type="password"
          revealable
          autoComplete="off"
          autoFocus
          value={password}
          onChange={e => setPassword(e.target.value)}
          error={errors.password}
        />
        {!hasLegacy && (
          <>
            <StrengthMeter password={password} />
            <TextField label="Confirm master password" type="password" revealable autoComplete="off" value={confirm} onChange={e => setConfirm(e.target.value)} error={errors.confirm} />
          </>
        )}
        {errors.form && <p role="alert" className="rounded-ctl bg-danger/10 px-3 py-2 text-sm text-danger">{errors.form}</p>}
        <Button type="submit" variant="primary" loading={busy} className="w-full">
          {hasLegacy ? (busy ? 'Checking…' : 'Upgrade vault') : 'Create vault'}
        </Button>
        <Button variant="ghost" onClick={onLogout} className="w-full">Log out</Button>
      </form>
    </CenteredCard>
  )
}
