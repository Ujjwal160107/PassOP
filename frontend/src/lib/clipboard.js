let clearTimer

// Copies text; for secrets, blanks the clipboard after a delay so a password doesn't linger.
export async function copySecret(text, { clearAfterMs } = {}) {
  await navigator.clipboard.writeText(text)
  clearTimeout(clearTimer)
  if (clearAfterMs) {
    clearTimer = setTimeout(() => navigator.clipboard.writeText('').catch(() => {}), clearAfterMs)
  }
}
