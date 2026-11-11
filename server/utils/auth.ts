import type { H3Event } from 'h3'
import { eq } from 'drizzle-orm'
import type { User } from '../db/schema'

export type PublicUser = Omit<User, 'passwordHash'>

export function toPublicUser({ passwordHash: _, ...user }: User): PublicUser {
  return user
}

export function toSessionUser(user: User) {
  return { id: user.id, name: user.name, email: user.email, isAdmin: user.isAdmin }
}

/**
 * Checks the session AND the current DB state (deactivated accounts lose access immediately).
 * Call this in every teacher endpoint.
 */
export async function requireTeacher(event: H3Event): Promise<PublicUser> {
  const session = await requireUserSession(event)
  const user = await useDb().select().from(tables.users).where(eq(tables.users.id, session.user.id)).get()

  if (!user?.active || !user.passwordHash) {
    await clearUserSession(event)
    throw createError({ statusCode: 401, message: 'Nicht angemeldet' })
  }
  return toPublicUser(user)
}

export async function requireAdmin(event: H3Event): Promise<PublicUser> {
  const user = await requireTeacher(event)
  if (!user.isAdmin) throw createError({ statusCode: 403, message: 'Nur für Admins' })
  return user
}
