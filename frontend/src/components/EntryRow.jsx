import { useState } from 'react'
import { Copy, ExternalLink, Eye, EyeOff, KeyRound, Pencil, Trash2 } from 'lucide-react'
import { safeHref, siteLabel } from '../lib/site.js'

const iconButton = 'grid size-11 shrink-0 place-items-center rounded-ctl text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg cursor-pointer'

export default function EntryRow({ entry, onCopy, onEdit, onDelete }) {
  const [revealed, setRevealed] = useState(false)
  const label = siteLabel(entry.site) || 'Untitled'
  const href = safeHref(entry.site)

  return (
    <li className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
      <div className="grid size-10 shrink-0 place-items-center rounded-ctl bg-accent/10 text-sm font-semibold text-accent" aria-hidden="true">
        {label[0].toUpperCase()}
      </div>
      <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left cursor-pointer">
        <span className="block truncate font-medium">{label}</span>
        <span className="block truncate text-sm text-muted">
          {entry.username || 'No username'}
          <span aria-hidden="true"> · </span>
          <span className="font-mono">{revealed ? entry.password : '••••••••'}</span>
        </span>
      </button>
      <div className="flex items-center">
        {entry.username && (
          <button type="button" className={`${iconButton} max-sm:hidden`} aria-label={`Copy username for ${label}`} onClick={() => onCopy(entry.username, 'Username')}>
            <Copy className="size-4" aria-hidden="true" />
          </button>
        )}
        <button type="button" className={iconButton} aria-label={`Copy password for ${label}`} onClick={() => onCopy(entry.password, 'Password')}>
          <KeyRound className="size-4" aria-hidden="true" />
        </button>
        <button type="button" className={`${iconButton} max-sm:hidden`} aria-label={revealed ? `Hide password for ${label}` : `Show password for ${label}`} aria-pressed={revealed} onClick={() => setRevealed(r => !r)}>
          {revealed ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
        </button>
        {href && (
          <a href={href} target="_blank" rel="noopener noreferrer" className={`${iconButton} max-sm:hidden`} aria-label={`Open ${label}`}>
            <ExternalLink className="size-4" aria-hidden="true" />
          </a>
        )}
        <button type="button" className={iconButton} aria-label={`Edit ${label}`} onClick={onEdit}>
          <Pencil className="size-4" aria-hidden="true" />
        </button>
        <button type="button" className={`${iconButton} hover:text-danger max-sm:hidden`} aria-label={`Delete ${label}`} onClick={onDelete}>
          <Trash2 className="size-4" aria-hidden="true" />
        </button>
      </div>
    </li>
  )
}
