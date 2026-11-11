import type { H3Event } from 'h3'

type Bucket = { count: number, resetAt: number }

// Simplification: in-memory is fine for a single instance; move to a shared store when scaling out
const buckets = new Map<string, Bucket>()
let lastSweep = 0

/** Counts a hit. Returns false once the limit for the current window is exceeded. */
export function hitRateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  if (now - lastSweep > 60_000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k)
    lastSweep = now
  }

  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  bucket.count++
  return bucket.count <= limit
}

/** True while `key` is still below `limit` in the current window. Doesn't count a hit. */
export function underRateLimit(key: string, limit: number, now = Date.now()): boolean {
  const bucket = buckets.get(key)
  return !bucket || bucket.resetAt <= now || bucket.count < limit
}

/**
 * PIN guessing protection: only wrong PINs count, so a whole school behind one IP can join any number of games.
 * Trade-off: once exceeded, the IP is blocked for joining, i.e. the whole school. Most students join via QR code
 * (no typos), so 200 misses per 10 min should not be reached by a school, while scanning ~900k PINs stays slow.
 * Simplification: per-IP in memory; tighten (or add a global limit) if PIN guessing becomes a problem.
 */
export const PIN_MISS_LIMIT = 200
export const PIN_MISS_WINDOW_MS = 10 * 60 * 1000
const pinMissKey = (ip: string) => `pin-miss:${ip}`
export const pinGuessBlocked = (ip: string) => !underRateLimit(pinMissKey(ip), PIN_MISS_LIMIT)
export const countPinMiss = (ip: string) => hitRateLimit(pinMissKey(ip), PIN_MISS_LIMIT, PIN_MISS_WINDOW_MS)

export function clientIp(event: H3Event): string {
  return getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
}

/** Throws 429 when the limit for `scope` + client IP is exceeded. */
export function rateLimit(event: H3Event, scope: string, limit: number, windowMs: number) {
  if (!hitRateLimit(`${scope}:${clientIp(event)}`, limit, windowMs)) {
    throw createError({ statusCode: 429, message: 'Zu viele Versuche. Bitte kurz warten.' })
  }
}
