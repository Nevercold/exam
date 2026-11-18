import { eq } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({
  minutes: z.number().int().min(1, 'Mindestens 1 Minute').max(120, 'Maximal 120 Minuten auf einmal'),
})

// Extends the timer of a started run. Also reopens a run whose timer ran out, as long as the teacher
// hasn't ended it and signing is still open (students get the new end with their next heartbeat).
export default defineEventHandler(async (event) => {
  const me = await requireTeacher(event)
  const { run } = await requireRunAccess(getRouterParam(event, 'id')!, me.id)
  const { minutes } = await readValidatedBody(event, bodySchema.parse)

  const now = new Date()
  if (!run.startedAt) throw createError({ statusCode: 409, message: 'Die Prüfung wurde noch nicht gestartet' })
  if (run.endedAt) throw createError({ statusCode: 409, message: 'Die Prüfung wurde bereits beendet' })
  if (!run.endsAt) throw createError({ statusCode: 409, message: 'Diese Prüfung läuft ohne Timer' })
  if (!canSign(run, now)) throw createError({ statusCode: 409, message: 'Die Prüfung ist schon zu lange vorbei' })

  // Reopening: the PIN was free in the meantime and may belong to another run by now
  if (run.endsAt <= now) {
    const other = await findOpenRunByPin(run.pin, now)
    if (other && other.id !== run.id) {
      throw createError({ statusCode: 409, message: 'Die PIN wird inzwischen von einem anderen Durchgang verwendet' })
    }
  }

  // After the timer ran out, count from now: the minutes are the time students actually get
  const base = run.endsAt > now ? run.endsAt : now
  const row = await useDb().update(tables.runs).set({ endsAt: new Date(base.getTime() + minutes * 60_000) })
    .where(eq(tables.runs.id, run.id)).returning().get()
  return { ...toRunInfo(row!), present: presenceCount(run.id), serverNow: new Date() }
})
