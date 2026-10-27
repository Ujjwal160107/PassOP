import { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { CloudOff, LoaderCircle } from 'lucide-react'
import { api } from '../lib/api.js'
import { encryptJson } from '../lib/crypto.js'
import { isLegacy, recoverLegacy, unlockEntries } from '../lib/vaultSession.js'
import useIdleLock from '../hooks/useIdleLock.js'
import Button from './ui/Button.jsx'
import CenteredCard from './ui/CenteredCard.jsx'
import VaultSetup from './VaultSetup.jsx'
import UnlockScreen from './UnlockScreen.jsx'
import VaultView from './VaultView.jsx'

const IDLE_LOCK_MS = 10 * 60 * 1000

function Busy({ children }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-sm text-muted" role="status">
      <LoaderCircle className="size-6 animate-spin text-accent" aria-hidden="true" />
      {children}
    </div>
  )
}

// Owns the vault lifecycle: setup → locked → unlocking → unlocked. The key lives only here, in memory.
export default function VaultGate({ user, onLogout }) {
  const [phase, setPhase] = useState('loading') // loading | error | setup | locked | unlocking | unlocked
  const [error, setError] = useState(null)
  const [record, setRecord] = useState(null)
  const [legacySecrets, setLegacySecrets] = useState([])
  const [key, setKey] = useState(null)
  const [entries, setEntries] = useState([])
  const [broken, setBroken] = useState([])
  const [progress, setProgress] = useState(null)

  const load = useCallback(async () => {
    setPhase('loading')
    try {
      const { vault } = await api.get('/api/vault')
      setRecord(vault)
      if (vault) return setPhase('locked')
      const secrets = await api.get('/api/secrets')
      setLegacySecrets(secrets.filter(isLegacy))
      setPhase('setup')
    } catch (err) {
      setError(err.message)
      setPhase('error')
    }
  }, [])

  useEffect(() => { load() }, [load])

  const lock = useCallback(() => {
    setKey(null)
    setEntries([])
    setBroken([])
    setPhase(p => (p === 'unlocked' ? 'locked' : p))
  }, [])

  useIdleLock(lock, IDLE_LOCK_MS, phase === 'unlocked')

  const unlock = async (vaultKey, password) => {
    setPhase('unlocking')
    setProgress(null)
    try {
      const result = await unlockEntries(vaultKey, password, api, (done, total) => setProgress({ done, total }))
      setKey(vaultKey)
      setEntries(result.entries)
      setBroken(result.broken)
      setPhase('unlocked')
      if (result.migrated) toast.success(`Upgraded ${result.migrated} ${result.migrated === 1 ? 'entry' : 'entries'} to stronger encryption`)
    } catch (err) {
      setError(err.message)
      setPhase('error')
    }
  }

  const save = async (fields, id) => {
    const payload = await encryptJson(key, fields)
    if (id) {
      await api.put(`/api/secrets/${id}`, payload)
      setEntries(list => list.map(e => (e.id === id ? { ...e, ...fields } : e)))
      toast.success('Saved')
    } else {
      const created = await api.post('/api/secrets', payload)
      setEntries(list => [{ id: created._id, ...fields, createdAt: created.createdAt }, ...list])
      toast.success('Password saved')
    }
  }

  const remove = async id => {
    await api.del(`/api/secrets/${id}`)
    setEntries(list => list.filter(e => e.id !== id))
    setBroken(list => list.filter(s => s._id !== id))
  }

  const recover = async (secret, password) => {
    const result = await recoverLegacy(key, password, secret)
    if (!result) return false
    await api.put(`/api/secrets/${secret._id}`, result.migration.payload)
    setBroken(list => list.filter(s => s._id !== secret._id))
    setEntries(list => [result.entry, ...list])
    toast.success('Entry recovered')
    return true
  }

  const logout = () => {
    lock()
    onLogout()
  }

  switch (phase) {
    case 'loading':
      return <Busy>Opening your vault…</Busy>
    case 'error':
      return (
        <CenteredCard icon={CloudOff} title="Something went wrong" subtitle={error}>
          <Button variant="primary" className="w-full" onClick={load}>Try again</Button>
        </CenteredCard>
      )
    case 'setup':
      return (
        <VaultSetup
          legacySecrets={legacySecrets}
          onLogout={logout}
          onCreated={(vaultRecord, vaultKey, password) => { setRecord(vaultRecord); unlock(vaultKey, password) }}
        />
      )
    case 'locked':
      return <UnlockScreen email={user.email} record={record} onUnlocked={unlock} onLogout={logout} />
    case 'unlocking':
      return (
        <Busy>
          {progress ? `Upgrading encryption ${progress.done} / ${progress.total}…` : 'Decrypting…'}
        </Busy>
      )
    default:
      return (
        <VaultView
          email={user.email}
          entries={entries}
          broken={broken}
          onSave={save}
          onDelete={remove}
          onRecover={recover}
          onLock={lock}
          onLogout={logout}
        />
      )
  }
}
