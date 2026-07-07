// Web Crypto PBKDF2-based password hashing
// Replaces bcryptjs to eliminate the 2.1 MiB WASM dependency
// Uses the global `crypto` API available in Edge runtime / Cloudflare Workers / Node.js

const PBKDF2_ITERATIONS = 100000
const KEY_LENGTH = 256 // bits
const SALT_LENGTH = 16 // bytes

function encoder(): TextEncoder {
  return new TextEncoder()
}

/** Hash a password using PBKDF2-SHA256 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const key = await crypto.subtle.importKey(
    'raw',
    encoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    key,
    KEY_LENGTH,
  )

  // Format: iterations:salt:hash (all base64 encoded)
  const iterStr = PBKDF2_ITERATIONS.toString(36)
  const saltStr = btoa(String.fromCharCode(...salt))
  const hashStr = btoa(String.fromCharCode(...new Uint8Array(derivedBits)))

  return `${iterStr}:${saltStr}:${hashStr}`
}

/** Verify a password against a stored hash */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    const [iterStr, saltStr, hashStr] = storedHash.split(':')
    if (!iterStr || !saltStr || !hashStr) return false

    const iterations = parseInt(iterStr, 36)
    const salt = new Uint8Array(atob(saltStr).split('').map((c) => c.charCodeAt(0)))
    const expectedHash = new Uint8Array(atob(hashStr).split('').map((c) => c.charCodeAt(0)))

    const key = await crypto.subtle.importKey(
      'raw',
      encoder().encode(password),
      'PBKDF2',
      false,
      ['deriveBits'],
    )

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt,
        iterations,
        hash: 'SHA-256',
      },
      key,
      KEY_LENGTH,
    )

    const derived = new Uint8Array(derivedBits)
    if (derived.length !== expectedHash.length) return false

    // Constant-time comparison to prevent timing attacks
    let result = 0
    for (let i = 0; i < derived.length; i++) {
      result |= derived[i] ^ expectedHash[i]
    }
    return result === 0
  } catch {
    return false
  }
}