// Reads entries written by the pre-2026 frontend (crypto-js 4.2.0). Loaded with a dynamic
// import only when such entries exist, so crypto-js stays out of the main bundle.
import CryptoJS from 'crypto-js'

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

// The old code passed the PBKDF2 hex string as a *passphrase*, so crypto-js re-derived the real
// key with EvpKDF and ignored the stored IV. Reproduce that exactly.
export function decryptLegacy(secret, password) {
  const derived = CryptoJS.PBKDF2(password, secret.salt, { keySize: 256 / 32, iterations: 100000 }).toString()
  return decryptWithDerivedKey(secret, derived)
}

export function decryptWithDerivedKey({ ciphertext }, derived) {
  try {
    const words = CryptoJS.AES.decrypt(ciphertext, derived, { padding: CryptoJS.pad.NoPadding })
    return unpadAndDecode(wordsToBytes(words))
  } catch {
    return null
  }
}

function wordsToBytes({ words, sigBytes }) {
  const bytes = new Uint8Array(sigBytes)
  for (let i = 0; i < sigBytes; i++) bytes[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff
  return bytes
}

// crypto-js's own unpad only reads the last byte, so ~0.24% of wrong keys "succeed" with junk.
// CBC has no integrity check, so validate PKCS#7 fully and require strict, printable UTF-8.
function unpadAndDecode(bytes) {
  const pad = bytes[bytes.length - 1]
  if (!pad || pad > 16 || pad > bytes.length) return null
  for (let i = bytes.length - pad; i < bytes.length; i++) if (bytes[i] !== pad) return null
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, bytes.length - pad))
  return text && !CONTROL_CHARS.test(text) ? text : null
}
