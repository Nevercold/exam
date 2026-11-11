import { describe, expect, it } from 'vitest'
import { createUserSchema, loginSchema, passwordSchema } from '../shared/utils/schemas'

describe('schemas', () => {
  it('normalizes emails (trim + lowercase)', () => {
    expect(loginSchema.parse({ email: '  Max@Schule.DE ', password: 'x' }).email).toBe('max@schule.de')
  })

  it('rejects invalid emails', () => {
    expect(createUserSchema.safeParse({ name: 'Max', email: 'kein-at' }).success).toBe(false)
  })

  it('requires passwords with at least 10 characters', () => {
    expect(passwordSchema.safeParse('kurz').success).toBe(false)
    expect(passwordSchema.safeParse('lang-genug-123').success).toBe(true)
  })

  it('defaults isAdmin to false', () => {
    expect(createUserSchema.parse({ name: 'Max', email: 'max@schule.de' }).isAdmin).toBe(false)
  })
})
