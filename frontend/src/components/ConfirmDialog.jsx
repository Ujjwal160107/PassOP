import { useState } from 'react'
import Dialog from './ui/Dialog.jsx'
import Button from './ui/Button.jsx'

export default function ConfirmDialog({ open, title, message, confirmLabel, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false)

  const confirm = async () => {
    setBusy(true)
    try {
      await onConfirm()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <p className="text-sm text-muted">{message}</p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="danger" loading={busy} onClick={confirm}>{confirmLabel}</Button>
      </div>
    </Dialog>
  )
}
