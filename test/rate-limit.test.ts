import { describe, expect, it, vi } from 'vitest'

// rate-limit.ts only uses h3 auto-imports in rateLimit()/clientIp(); hitRateLimit is pure
vi.stubGlobal('getRequestIP', () => '127.0.0.1')
vi.stubGlobal('createError', (e: unknown) => e)

const { hitRateLimit, underRateLimit } = await import('../server/utils/rate-limit')

describe('hitRateLimit', () => {
  it('allows hits up to the limit and blocks afterwards', () => {
    const now = 1_000_000
    expect(hitRateLimit('a', 2, 1000, now)).toBe(true)
    expect(hitRateLimit('a', 2, 1000, now + 1)).toBe(true)
    expect(hitRateLimit('a', 2, 1000, now + 2)).toBe(false)
  })

  it('resets after the window expires', () => {
    const now = 2_000_000
    hitRateLimit('b', 1, 1000, now)
    expect(hitRateLimit('b', 1, 1000, now + 10)).toBe(false)
    expect(hitRateLimit('b', 1, 1000, now + 1001)).toBe(true)
  })

  it('underRateLimit checks without counting', () => {
    const now = 4_000_000
    expect(underRateLimit('e', 2, now)).toBe(true)
    hitRateLimit('e', 2, 1000, now)
    expect(underRateLimit('e', 2, now)).toBe(true)
    hitRateLimit('e', 2, 1000, now)
    expect(underRateLimit('e', 2, now)).toBe(false)
    expect(underRateLimit('e', 2, now + 1000)).toBe(true)
  })

  it('keeps keys separate', () => {
    const now = 3_000_000
    hitRateLimit('c', 1, 1000, now)
    expect(hitRateLimit('d', 1, 1000, now)).toBe(true)
  })
})
