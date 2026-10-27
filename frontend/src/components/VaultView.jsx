import { useMemo, useState } from 'react'
import { toast } from 'react-toastify'
import { AlertTriangle, Lock, LogOut, Plus, Search, Trash2 } from 'lucide-react'
import { copySecret } from '../lib/clipboard.js'
import { siteLabel } from '../lib/site.js'
import { isLegacy } from '../lib/vaultSession.js'
import Button from './ui/Button.jsx'
import Dialog from './ui/Dialog.jsx'
import TextField from './ui/TextField.jsx'
import Wordmark from './ui/Wordmark.jsx'
import EntryRow from './EntryRow.jsx'
import EntryDialog from './EntryDialog.jsx'
import ConfirmDialog from './ConfirmDialog.jsx'

const CLIPBOARD_CLEAR_MS = 30_000

function RecoverDialog({ secret, onRecover, onClose }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async e => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const ok = await onRecover(secret, password).catch(err => { setError(err.message); return null })
    setBusy(false)
    if (ok) onClose()
    else if (ok === false) setError('That password does not decrypt this entry')
  }

  return (
    <Dialog open={Boolean(secret)} onClose={onClose} title="Try another password">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-sm text-muted">This entry was saved with a different master password. Enter that password to recover it into your vault.</p>
        <TextField label="Old master password" type="password" revealable autoComplete="off" autoFocus value={password} onChange={e => setPassword(e.target.value)} error={error} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!password}>Recover</Button>
        </div>
      </form>
    </Dialog>
  )
}

export default function VaultView({ email, entries, broken, onSave, onDelete, onRecover, onLock, onLogout }) {
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(null) // null = closed, 'new', or an entry
  const [deleting, setDeleting] = useState(null) // { id, label }
  const [recovering, setRecovering] = useState(null)

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return entries
    return entries.filter(e => siteLabel(e.site).toLowerCase().includes(q) || e.username.toLowerCase().includes(q))
  }, [entries, query])

  const copy = async (text, kind) => {
    try {
      await copySecret(text, { clearAfterMs: kind === 'Password' ? CLIPBOARD_CLEAR_MS : 0 })
      toast.success(kind === 'Password' ? 'Password copied. Clipboard clears in 30 s.' : `${kind} copied`)
    } catch {
      toast.error('Could not access the clipboard')
    }
  }

  const confirmDelete = async () => {
    try {
      await onDelete(deleting.id)
      toast.success('Deleted')
      setDeleting(null)
      setEditing(null)
    } catch (err) {
      toast.error(err.message)
    }
  }

  const editingEntry = editing === 'new' ? null : editing

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-2 px-4">
          <Wordmark className="text-xl" />
          <span className="ml-auto hidden truncate text-sm text-muted sm:block">{email}</span>
          <Button variant="ghost" onClick={onLock} className="max-sm:ml-auto">
            <Lock className="size-4" aria-hidden="true" /> Lock
          </Button>
          <Button variant="ghost" size="icon" aria-label="Log out" onClick={onLogout}>
            <LogOut className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-6">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input
              type="search"
              aria-label="Search passwords"
              placeholder={`Search ${entries.length} ${entries.length === 1 ? 'password' : 'passwords'}`}
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="h-11 w-full rounded-ctl border border-border bg-surface pl-9 pr-3 text-base placeholder:text-muted/70"
            />
          </div>
          <Button variant="primary" onClick={() => setEditing('new')}>
            <Plus className="size-4" aria-hidden="true" /> <span>New</span>
          </Button>
        </div>

        {entries.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border px-6 py-14 text-center">
            <p className="font-medium">Your vault is empty</p>
            <p className="max-w-xs text-sm text-muted">Save your first password. It's encrypted on this device before it's stored.</p>
            <Button variant="primary" onClick={() => setEditing('new')}><Plus className="size-4" aria-hidden="true" /> Add a password</Button>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-card border border-border px-6 py-12 text-center" role="status">
            <p className="font-medium">No matches for “{query}”</p>
            <p className="text-sm text-muted">Search looks at site names and usernames.</p>
            <Button variant="secondary" onClick={() => setQuery('')}>Clear search</Button>
          </div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface" aria-label="Saved passwords">
            {visible.map(entry => (
              <EntryRow
                key={entry.id}
                entry={entry}
                onCopy={copy}
                onEdit={() => setEditing(entry)}
                onDelete={() => setDeleting({ id: entry.id, label: siteLabel(entry.site) })}
              />
            ))}
          </ul>
        )}

        {broken.length > 0 && (
          <section aria-labelledby="broken-heading" className="rounded-card border border-danger/40 bg-danger/5 p-4">
            <h2 id="broken-heading" className="flex items-center gap-2 font-medium">
              <AlertTriangle className="size-4 text-danger" aria-hidden="true" /> Can't decrypt {broken.length} {broken.length === 1 ? 'entry' : 'entries'}
            </h2>
            <p className="mt-1 text-sm text-muted">These don't open with your master password. Older entries may have been saved with a different one.</p>
            <ul className="mt-3 flex flex-col gap-1">
              {broken.map(secret => {
                const label = siteLabel(secret.site ?? '') || 'Unknown entry'
                return (
                  <li key={secret._id} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
                    {isLegacy(secret) && <Button variant="secondary" onClick={() => setRecovering(secret)}>Try another password</Button>}
                    <Button variant="ghost" size="icon" aria-label={`Delete ${label}`} className="hover:text-danger" onClick={() => setDeleting({ id: secret._id, label })}>
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </div>

      <EntryDialog
        open={editing !== null}
        entry={editingEntry}
        onSubmit={fields => onSave(fields, editingEntry?.id)}
        onDelete={() => setDeleting({ id: editingEntry.id, label: siteLabel(editingEntry.site) })}
        onClose={() => setEditing(null)}
      />
      <ConfirmDialog
        open={deleting !== null}
        title="Delete this password?"
        message={deleting ? `${deleting.label || 'This entry'} will be removed from your vault. This can't be undone.` : ''}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />
      <RecoverDialog key={recovering?._id} secret={recovering} onRecover={onRecover} onClose={() => setRecovering(null)} />
    </div>
  )
}
