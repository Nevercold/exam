import { createHash, randomBytes } from 'node:crypto'

/** SHA-256 hex. Tokens (invites, API) are stored only in hashed form. */
export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url')
}
