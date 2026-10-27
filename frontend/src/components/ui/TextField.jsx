import { useId, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

export default function TextField({ label, error, hint, revealable = false, type = 'text', className = '', inputClassName = '', ref, ...inputProps }) {
  const id = useId()
  const [revealed, setRevealed] = useState(false)
  const describedBy = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(' ') || undefined

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <div className="relative">
        <input
          ref={ref}
          id={id}
          type={revealable && revealed ? 'text' : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`h-11 w-full rounded-ctl border bg-surface px-3 text-base text-fg placeholder:text-muted/70 transition-colors duration-150 ${error ? 'border-danger' : 'border-border hover:border-muted/50'} ${revealable ? 'pr-12' : ''} ${inputClassName}`}
          {...inputProps}
        />
        {revealable && (
          <button
            type="button"
            onClick={() => setRevealed(r => !r)}
            aria-label={revealed ? 'Hide password' : 'Show password'}
            aria-pressed={revealed}
            className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-ctl text-muted hover:text-fg cursor-pointer"
          >
            {revealed ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
          </button>
        )}
      </div>
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-muted">{hint}</p>}
      {error && <p id={`${id}-error`} className="text-xs font-medium text-danger">{error}</p>}
    </div>
  )
}
