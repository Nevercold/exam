import { generateKeyPairSync, type KeyObject } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { canonicalJson, hashSubmission, verificationCode, type Submission } from '../shared/utils/submission'
import { loadSigningKeys, signPayload, verifyEnvelope } from '../server/utils/signing'

const der = (k: KeyObject) => k.export({ format: 'der', type: 'pkcs8' }).toString('base64')

function keys(kid = 'k1', retired = '') {
  const { privateKey } = generateKeyPairSync('ed25519')
  return loadSigningKeys({ signingPrivateKey: der(privateKey), signingKeyId: kid, signingRetiredKeys: retired }, false)
}

const submission: Submission = {
  v: 1,
  runId: 'run-1',
  examTitle: 'Normalisierung',
  name: 'Kim Muster',
  answers: { b: 'x', a: [{ name: 'T', columns: [], rows: [] }] },
  exportedAt: '2026-11-11T08:00:00.000Z',
}

describe('canonicalJson', () => {
  it('ignores key order', () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { y: 1, x: 2 }], c: 2 } })).toBe(canonicalJson({ a: { c: 2, d: [1, { x: 2, y: 1 }] }, b: 1 }))
  })
})

describe('hashSubmission', () => {
  it('changes when any detail changes', async () => {
    const h = await hashSubmission(submission)
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(await hashSubmission({ ...submission, name: 'Kim Mustre' })).not.toBe(h)
    expect(await hashSubmission({ ...submission, answers: { ...submission.answers, b: 'y' } })).not.toBe(h)
    expect(verificationCode(h)).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/)
  })
})

describe('signatures', () => {
  const payload = { v: 1 as const, runId: 'run-1', hash: 'a'.repeat(64), signedAt: '2026-11-11T08:00:00.000Z' }

  it('verifies its own signature and rejects tampering', () => {
    const k = keys()
    const env = signPayload(payload, k)
    expect(env.payload.kid).toBe('k1')
    expect(verifyEnvelope(env, k)).toBe(true)
    expect(verifyEnvelope({ ...env, payload: { ...env.payload, hash: 'b'.repeat(64) } }, k)).toBe(false)
    expect(verifyEnvelope({ ...env, payload: { ...env.payload, signedAt: '2026-11-11T09:00:00.000Z' } }, k)).toBe(false)
    expect(verifyEnvelope({ ...env, payload: { ...env.payload, kid: 'unknown' } }, k)).toBe(false)
  })

  it('rejects signatures of another key', () => {
    expect(verifyEnvelope(signPayload(payload, keys()), keys())).toBe(false)
  })

  it('keeps accepting retired keys after a rotation', () => {
    const old = keys('k1')
    const env = signPayload(payload, old)
    const oldPublic = old.publicKeys.get('k1')!.export({ format: 'der', type: 'spki' }).toString('base64')
    const rotated = keys('k2', JSON.stringify({ k1: oldPublic }))
    expect(verifyEnvelope(env, rotated)).toBe(true)
    expect(signPayload(payload, rotated).payload.kid).toBe('k2')
  })

  it('refuses to run without a key in production', () => {
    expect(() => loadSigningKeys({ signingPrivateKey: '', signingKeyId: 'k1', signingRetiredKeys: '' }, false)).toThrow()
  })
})
