// The 8-character minimum applies only to new vaults: the old app accepted any master
// password, and rejecting a short one here would lock its owner out of their entries.
export function validateSetup({ password, confirm, hasLegacy }) {
  if (hasLegacy) return password ? {} : { password: 'Enter your existing master password' }
  if (password.length < 8) return { password: 'Use at least 8 characters' }
  if (confirm !== password) return { confirm: "Passwords don't match" }
  return {}
}
