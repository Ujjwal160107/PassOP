import { useState } from 'react'
import { ExternalLink, Trash2, Wand2 } from 'lucide-react'
import { normalizeSite, safeHref } from '../lib/site.js'
import Dialog from './ui/Dialog.jsx'
import Button from './ui/Button.jsx'
import TextField from './ui/TextField.jsx'
import StrengthMeter from './ui/StrengthMeter.jsx'
import PasswordGenerator from './PasswordGenerator.jsx'

const EMPTY = { site: '', username: '', password: '' }

function EntryForm({ entry, onSubmit, onDelete, onClose }) {
  const [fields, setFields] = useState(entry ? { site: entry.site, username: entry.username, password: entry.password } : EMPTY)
  const [errors, setErrors] = useState({})
  const [showGenerator, setShowGenerator] = useState(!entry)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState(null)
  const set = key => e => setFields(f => ({ ...f, [key]: e.target.value }))
  const href = safeHref(fields.site)

  const submit = async e => {
    e.preventDefault()
    const clean = { ...fields, site: normalizeSite(fields.site) }
    const nextErrors = {
      site: clean.site ? null : 'Enter a website or app name',
      password: clean.password ? null : 'Enter a password or generate one',
    }
    setErrors(nextErrors)
    if (nextErrors.site || nextErrors.password) return

    setBusy(true)
    setFormError(null)
    try {
      await onSubmit(clean)
      onClose()
    } catch (err) {
      setFormError(err.message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <TextField
        label="Website"
        name="site"
        placeholder="github.com"
        autoComplete="off"
        autoFocus={!entry}
        value={fields.site}
        onChange={set('site')}
        onBlur={() => setFields(f => ({ ...f, site: normalizeSite(f.site) }))}
        error={errors.site}
      />
      <TextField label="Username or email" name="username" autoComplete="off" value={fields.username} onChange={set('username')} />
      <div className="flex flex-col gap-2">
        <TextField
          label="Password"
          name="password"
          type="password"
          revealable
          autoComplete="new-password"
          inputClassName="font-mono"
          value={fields.password}
          onChange={set('password')}
          error={errors.password}
        />
        <StrengthMeter password={fields.password} />
        {showGenerator ? (
          <PasswordGenerator onUse={password => { setFields(f => ({ ...f, password })); setShowGenerator(false) }} />
        ) : (
          <Button variant="ghost" className="self-start" onClick={() => setShowGenerator(true)}>
            <Wand2 className="size-4" aria-hidden="true" /> Generate a strong password
          </Button>
        )}
      </div>

      {formError && <p role="alert" className="rounded-ctl bg-danger/10 px-3 py-2 text-sm text-danger">{formError}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {entry && (
          <>
            <Button variant="ghost" size="icon" aria-label="Delete entry" className="hover:text-danger" onClick={onDelete}>
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
            {href && (
              <a href={href} target="_blank" rel="noopener noreferrer" aria-label="Open website" className="grid size-11 place-items-center rounded-ctl text-muted hover:bg-surface-2 hover:text-fg">
                <ExternalLink className="size-4" aria-hidden="true" />
              </a>
            )}
          </>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy}>{entry ? 'Save changes' : 'Save'}</Button>
        </div>
      </div>
    </form>
  )
}

export default function EntryDialog({ open, entry, onSubmit, onDelete, onClose }) {
  return (
    <Dialog open={open} onClose={onClose} title={entry ? 'Edit password' : 'New password'}>
      <EntryForm key={entry?.id ?? 'new'} entry={entry} onSubmit={onSubmit} onDelete={onDelete} onClose={onClose} />
    </Dialog>
  )
}
