import { z } from 'zod'

const pinSchema = z.string().regex(/^\d{6}$/)

// Public: a student joins an active run by PIN and gets the exam WITHOUT solutions.
export default defineEventHandler(async (event) => {
  const ip = clientIp(event)
  if (pinGuessBlocked(ip)) throw createError({ statusCode: 429, message: 'Zu viele falsche PINs. Bitte kurz warten.' })

  const pin = getRouterParam(event, 'pin') ?? ''
  const run = pinSchema.safeParse(pin).success ? await findActiveRunByPin(pin) : null
  if (!run) {
    countPinMiss(ip)
    throw createError({ statusCode: 404, message: 'Keine laufende Prüfung mit dieser PIN gefunden.' })
  }

  setResponseHeader(event, 'cache-control', 'no-store')
  return {
    runId: run.id,
    endsAt: run.endsAt,
    serverNow: new Date(),
    content: toStudentContent(run.snapshot),
  }
})
