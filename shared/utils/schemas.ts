import { z } from 'zod'

// Shared validation for client forms and server endpoints

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email('Ungültige E-Mail-Adresse').max(200))

export const passwordSchema = z.string().min(10, 'Mindestens 10 Zeichen').max(200)

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Passwort fehlt').max(200),
})

export const setPasswordSchema = z.object({
  password: passwordSchema,
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Aktuelles Passwort fehlt').max(200),
  newPassword: passwordSchema,
})

export const createUserSchema = z.object({
  name: z.string().trim().min(1, 'Name fehlt').max(100),
  email: emailSchema,
  isAdmin: z.boolean().default(false),
})

export const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  isAdmin: z.boolean().optional(),
  active: z.boolean().optional(),
})

export const createApiTokenSchema = z.object({
  name: z.string().trim().min(1, 'Name fehlt').max(60, 'Maximal 60 Zeichen'),
  expiresInDays: z.literal([30, 90, 365], 'Ungültige Gültigkeitsdauer'),
})

/** Selectable token lifetimes in days. */
export const API_TOKEN_LIFETIMES = [...createApiTokenSchema.shape.expiresInDays.values]

export type LoginInput = z.infer<typeof loginSchema>
export type CreateApiTokenInput = z.infer<typeof createApiTokenSchema>
export type CreateUserInput = z.infer<typeof createUserSchema>
