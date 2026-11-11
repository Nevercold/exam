import { z } from 'zod'

// A student's submission and its signature. The browser hashes the canonical JSON of the
// submission; the server signs only { runId, hash, signedAt } and never sees name or answers.

export const SUBMISSION_VERSION = 1

/** After the run ends (timer or teacher), PDFs are still signed for this long so everyone can export. */
export const SIGN_GRACE_MS = 10 * 60_000

export const studentNameSchema = z.string().trim().min(2, 'Bitte vollständigen Namen eingeben').max(100, 'Maximal 100 Zeichen')

export const submissionSchema = z.object({
  v: z.literal(SUBMISSION_VERSION),
  runId: z.string().max(64),
  examTitle: z.string().max(500),
  name: z.string().max(100),
  answers: z.record(z.string(), z.unknown()),
  exportedAt: z.string().max(40),
})

export type Submission = z.infer<typeof submissionSchema>

export const signaturePayloadSchema = z.object({
  v: z.literal(SUBMISSION_VERSION),
  runId: z.string().max(64),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  signedAt: z.string().max(40),
  kid: z.string().max(40),
})

export type SignaturePayload = z.infer<typeof signaturePayloadSchema>

export const signedEnvelopeSchema = z.object({
  payload: signaturePayloadSchema,
  signature: z.string().regex(/^[\w-]+$/).max(200),
})

export type SignedEnvelope = z.infer<typeof signedEnvelopeSchema>

/** What is embedded in the PDF. `signature` is null for unsigned exports. */
export const embeddedSubmissionSchema = z.object({
  submission: submissionSchema,
  signature: signedEnvelopeSchema.nullable(),
})

export type EmbeddedSubmission = z.infer<typeof embeddedSubmissionSchema>

/** Random, anonymous id of a student browser, only used for the head count on the projector. */
export const clientIdSchema = z.string().regex(/^[\w-]{8,64}$/)

export const presenceRequestSchema = z.object({
  runId: z.string().min(1).max(64),
  clientId: clientIdSchema,
})

export const signRequestSchema = z.object({
  runId: z.string().min(1).max(64),
  hash: z.string().regex(/^[0-9a-f]{64}$/, 'Ungültiger Hash'),
})

/** JSON with recursively sorted object keys, so the same data always yields the same hash. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(k => [k, sortKeys((value as Record<string, unknown>)[k])]))
  }
  return value
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export const hashSubmission = (s: Submission) => sha256Hex(canonicalJson(s))

/** Short human-readable code printed on the PDF, derived from the hash. */
export const verificationCode = (hash: string) => `${hash.slice(0, 4)}-${hash.slice(4, 8)}-${hash.slice(8, 12)}`.toUpperCase()

/** Key in the PDF info dictionary that carries the embedded submission JSON. */
export const PDF_INFO_KEY = 'ExamSubmission'
