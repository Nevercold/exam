import { z } from 'zod'

const pinSchema = z.string().regex(/^\d{6}$/)

// Public: a student joins an open run by PIN. While the run is waiting, only its status is returned
// (students poll); once it runs, the exam WITHOUT solutions.
export default defineEventHandler(async (event) => {
  const ip = clientIp(event)
  if (pinGuessBlocked(ip)) throw createError({ statusCode: 429, message: 'Zu viele falsche PINs. Bitte kurz warten.' })

  const pin = getRouterParam(event, 'pin') ?? ''
  const run = pinSchema.safeParse(pin).success ? await findOpenRunByPin(pin) : null
  if (!run) {
    countPinMiss(ip)
    throw createError({ statusCode: 404, message: 'Keine laufende Prüfung mit dieser PIN gefunden.' })
  }

  // Anonymous head count for the projector (optional, invalid ids are ignored)
  const client = clientIdSchema.safeParse(getQuery(event).client)
  if (client.success) touchPresence(run.id, client.data)

  setResponseHeader(event, 'cache-control', 'no-store')
  if (run.startedAt === null) {
    return { status: 'waiting' as const, runId: run.id, serverNow: new Date() }
  }
  return {
    status: 'running' as const,
    runId: run.id,
    endsAt: run.endsAt,
    serverNow: new Date(),
    content: toStudentContent(run.snapshot),
  }
})
