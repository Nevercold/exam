import { beforeEach, describe, expect, it } from 'vitest'
import { canSign, runEnd, runStatus } from '../server/utils/exams'
import { PRESENCE_WINDOW_MS, presenceCount, resetPresence, touchPresence } from '../server/utils/presence'

const now = new Date('2026-11-11T10:00:00Z')
const at = (min: number) => new Date(now.getTime() + min * 60_000)

describe('runStatus', () => {
  it('waits until started', () => {
    expect(runStatus({ startedAt: null, endsAt: null, endedAt: null }, now)).toBe('waiting')
  })
  it('runs after start, with or without timer', () => {
    expect(runStatus({ startedAt: at(-5), endsAt: at(40), endedAt: null }, now)).toBe('running')
    expect(runStatus({ startedAt: at(-5), endsAt: null, endedAt: null }, now)).toBe('running')
  })
  it('ends by timer, manually, or when cancelled while waiting', () => {
    expect(runStatus({ startedAt: at(-50), endsAt: at(-5), endedAt: null }, now)).toBe('ended')
    expect(runStatus({ startedAt: at(-5), endsAt: null, endedAt: at(-1) }, now)).toBe('ended')
    expect(runStatus({ startedAt: null, endsAt: null, endedAt: at(-1) }, now)).toBe('ended')
  })
  it('runEnd takes the earlier of timer and manual end', () => {
    expect(runEnd({ endsAt: at(10), endedAt: at(5) })).toEqual(at(5))
    expect(runEnd({ endsAt: at(10), endedAt: null })).toEqual(at(10))
    expect(runEnd({ endsAt: null, endedAt: null })).toBeNull()
  })
})

describe('canSign', () => {
  it('not while waiting', () => {
    expect(canSign({ startedAt: null, endsAt: null, endedAt: null }, now)).toBe(false)
  })
  it('while running and up to 10 minutes after the end', () => {
    expect(canSign({ startedAt: at(-5), endsAt: null, endedAt: null }, now)).toBe(true)
    expect(canSign({ startedAt: at(-50), endsAt: at(-9), endedAt: null }, now)).toBe(true)
    expect(canSign({ startedAt: at(-50), endsAt: at(-11), endedAt: null }, now)).toBe(false)
    expect(canSign({ startedAt: at(-50), endsAt: at(30), endedAt: at(-9) }, now)).toBe(true)
    expect(canSign({ startedAt: at(-50), endsAt: at(30), endedAt: at(-11) }, now)).toBe(false)
  })
  it('never for a run cancelled before the start', () => {
    expect(canSign({ startedAt: null, endsAt: null, endedAt: at(-1) }, now)).toBe(false)
  })
})

describe('presence', () => {
  beforeEach(resetPresence)

  it('counts distinct clients within the window', () => {
    const t = now.getTime()
    touchPresence('r1', 'client-aaaa', t)
    touchPresence('r1', 'client-aaaa', t + 1000)
    touchPresence('r1', 'client-bbbb', t)
    touchPresence('r2', 'client-cccc', t)
    expect(presenceCount('r1', t + 1000)).toBe(2)
    expect(presenceCount('r1', t + PRESENCE_WINDOW_MS + 500)).toBe(1)
    expect(presenceCount('unknown', t)).toBe(0)
  })
})
