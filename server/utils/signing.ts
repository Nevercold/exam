import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, type KeyObject } from 'node:crypto'
import { canonicalJson, type SignaturePayload, type SignedEnvelope } from '../../shared/utils/submission'

// Ed25519 signatures over the canonical JSON of a SignaturePayload.
// The private key never leaves the server; `kid` allows rotating keys while old PDFs stay verifiable.

type Keys = { kid: string, privateKey: KeyObject, publicKeys: Map<string, KeyObject> }

let keys: Keys | undefined

export function loadSigningKeys(config: { signingPrivateKey: string, signingKeyId: string, signingRetiredKeys: string }, dev = import.meta.dev): Keys {
  let privateKey: KeyObject
  if (config.signingPrivateKey) {
    privateKey = createPrivateKey({ key: Buffer.from(config.signingPrivateKey, 'base64'), format: 'der', type: 'pkcs8' })
    if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('NUXT_SIGNING_PRIVATE_KEY must be an Ed25519 key')
  }
  else if (dev) {
    // Simplification: ephemeral dev key; signatures become unverifiable after a restart.
    console.warn('[signing] NUXT_SIGNING_PRIVATE_KEY not set, using an ephemeral development key')
    privateKey = generateKeyPairSync('ed25519').privateKey
  }
  else {
    throw new Error('NUXT_SIGNING_PRIVATE_KEY is not set (generate one with `pnpm keygen`)')
  }

  const publicKeys = new Map<string, KeyObject>([[config.signingKeyId, createPublicKey(privateKey)]])
  if (config.signingRetiredKeys) {
    const retired = JSON.parse(config.signingRetiredKeys) as Record<string, string>
    for (const [kid, der] of Object.entries(retired)) {
      if (!publicKeys.has(kid)) publicKeys.set(kid, createPublicKey({ key: Buffer.from(der, 'base64'), format: 'der', type: 'spki' }))
    }
  }
  return { kid: config.signingKeyId, privateKey, publicKeys }
}

function useSigningKeys(): Keys {
  keys ??= loadSigningKeys(useRuntimeConfig())
  return keys
}

/** For tests. */
export function setSigningKeys(next: Keys) {
  keys = next
}

export function signPayload(payload: Omit<SignaturePayload, 'kid'>, k = useSigningKeys()): SignedEnvelope {
  const full: SignaturePayload = { ...payload, kid: k.kid }
  const signature = sign(null, Buffer.from(canonicalJson(full)), k.privateKey).toString('base64url')
  return { payload: full, signature }
}

export function verifyEnvelope(envelope: SignedEnvelope, k = useSigningKeys()): boolean {
  const publicKey = k.publicKeys.get(envelope.payload.kid)
  if (!publicKey) return false
  return verify(null, Buffer.from(canonicalJson(envelope.payload)), publicKey, Buffer.from(envelope.signature, 'base64url'))
}
