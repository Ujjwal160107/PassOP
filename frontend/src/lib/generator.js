const SETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.<>/?~',
}

// Uniform integer in [0, max) without modulo bias.
function randomInt(max) {
  const limit = Math.floor(0x1_0000_0000 / max) * max
  const buf = new Uint32Array(1)
  do crypto.getRandomValues(buf)
  while (buf[0] >= limit)
  return buf[0] % max
}

const pick = chars => chars[randomInt(chars.length)]

export function generatePassword({ length = 20, digits = true, symbols = true } = {}) {
  const size = Math.min(64, Math.max(8, length))
  const classes = [SETS.lower, SETS.upper, digits && SETS.digits, symbols && SETS.symbols].filter(Boolean)
  const alphabet = classes.join('')

  const chars = classes.map(pick)
  while (chars.length < size) chars.push(pick(alphabet))
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

// Rough entropy estimate: length × log2(character pool). 0 (weak) .. 4 (strong).
export function strength(password) {
  if (!password) return 0
  let pool = 0
  if (/[a-z]/.test(password)) pool += 26
  if (/[A-Z]/.test(password)) pool += 26
  if (/[0-9]/.test(password)) pool += 10
  if (/[^A-Za-z0-9]/.test(password)) pool += 33
  const bits = password.length * Math.log2(pool)
  if (bits < 28) return 0
  if (bits < 40) return 1
  if (bits < 60) return 2
  if (bits < 80) return 3
  return 4
}
