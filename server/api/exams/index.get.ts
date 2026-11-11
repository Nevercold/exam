import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm'
import { z } from 'zod'

const querySchema = z.object({ archived: z.enum(['0', '1']).default('0') })

export default defineEventHandler(async (event) => {
  const me = await requireTeacher(event)
  const { archived } = await getValidatedQuery(event, querySchema.parse)

  const rows = await useDb()
    .select({ exam: tables.exams, owner: { id: tables.users.id, name: tables.users.name } })
    .from(tables.exams)
    .innerJoin(tables.users, eq(tables.users.id, tables.exams.ownerId))
    .where(and(
      examAccessCondition(me.id),
      archived === '1' ? isNotNull(tables.exams.archivedAt) : isNull(tables.exams.archivedAt),
    ))
    .orderBy(desc(tables.exams.draftUpdatedAt))
    .all()

  return rows.map(r => ({ ...toExamSummary(r.exam, r.owner), isOwner: r.exam.ownerId === me.id }))
})
