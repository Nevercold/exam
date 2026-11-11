// Generates an Ed25519 signing key for NUXT_SIGNING_PRIVATE_KEY.
// Run: pnpm keygen   (keep the private key secret; back it up — without it old PDFs can't be verified)
import { generateKeyPairSync } from 'node:crypto'

const { privateKey, publicKey } = generateKeyPairSync('ed25519')
console.log(`NUXT_SIGNING_PRIVATE_KEY=${privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64')}`)
console.log(`# Public key (for NUXT_SIGNING_RETIRED_KEYS after a rotation):`)
console.log(`# ${publicKey.export({ format: 'der', type: 'spki' }).toString('base64')}`)
