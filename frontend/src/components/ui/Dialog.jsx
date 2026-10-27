import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'

// Native <dialog> + showModal(): the browser handles the focus trap, Escape and returning focus.
export default function Dialog({ open, onClose, title, children }) {
  const ref = useRef(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={e => e.target === ref.current && onClose()}
      className="m-auto w-[min(100vw-2rem,28rem)] rounded-card border border-border bg-surface p-0 text-fg shadow-2xl"
    >
      {open && (
        <div className="flex flex-col gap-5 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 grid size-11 place-items-center rounded-ctl text-muted hover:bg-surface-2 hover:text-fg cursor-pointer">
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  )
}
