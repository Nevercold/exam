import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const input = await readValidatedBody(event, createUserSchema.parse)
  const db = useDb()

  const exists = await db.select({ id: tables.users.id }).from(tables.users).where(eq(tables.users.email, input.email)).get()
  if (exists) throw createError({ statusCode: 409, message: 'Diese E-Mail ist bereits vergeben' })

  const user = await db.insert(tables.users).values(input).returning().get()
  const invite = await createInvite(user.id)

  setResponseStatus(event, 201)
  return { user: toPublicUser(user), invite }
})
