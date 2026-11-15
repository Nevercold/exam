// Client for an OpenAI-compatible chat completions API (e.g. Hetzner Inference), configured once on the server:
// NUXT_AI_BASE_URL, NUXT_AI_API_KEY, NUXT_AI_MODEL. The key never reaches the browser.

export type AiConfig = { baseUrl: string, apiKey: string, model: string, requestsPerMinute: number }

export function aiConfig(): AiConfig | null {
  const c = useRuntimeConfig().ai
  if (!c.baseUrl || !c.apiKey || !c.model) return null
  return {
    baseUrl: c.baseUrl.replace(/\/+$/, ''),
    apiKey: c.apiKey,
    model: c.model,
    requestsPerMinute: Math.max(1, Number(c.requestsPerMinute) || 10),
  }
}

// Requests are spaced out to stay within the provider's per-key limit (Hetzner: 10/min). In-memory, single process.
// Simplification: one process holds the whole queue, upgrade when the app runs with several instances.
let nextSlot = 0
async function waitForSlot(rpm: number) {
  const now = Date.now()
  const at = Math.max(now, nextSlot)
  nextSlot = at + Math.ceil(60_000 / rpm)
  if (at > now) await new Promise(r => setTimeout(r, at - now))
}

// Not every OpenAI-compatible server supports structured outputs; remember a rejection and fall back to plain JSON.
let structuredOutputs = true

type ChatResponse = { choices?: { message?: { content?: string | null } }[] }

const TIMEOUT_MS = 120_000

async function post(config: AiConfig, body: Record<string, unknown>): Promise<Response> {
  await waitForSlot(config.requestsPerMinute)
  return fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'authorization': `Bearer ${config.apiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
}

/** Sends a chat completion and returns the reply text. Throws a German, user-facing error on failure. */
export async function chatCompletion(config: AiConfig, messages: { role: string, content: string }[], jsonSchema: object): Promise<string> {
  const base = { model: config.model, messages, temperature: 0.2 }
  const withSchema = () => ({ ...base, response_format: { type: 'json_schema', json_schema: { name: 'grading', strict: true, schema: jsonSchema } } })

  let res: Response
  try {
    res = await post(config, structuredOutputs ? withSchema() : base)
    if (structuredOutputs && res.status === 400) {
      structuredOutputs = false
      res = await post(config, base)
    }
    if (res.status === 429) {
      // Provider limit hit anyway (e.g. shared key): wait once and retry
      const wait = Math.min(30, Number(res.headers.get('retry-after')) || 10)
      await new Promise(r => setTimeout(r, wait * 1000))
      res = await post(config, structuredOutputs ? withSchema() : base)
    }
  }
  catch (err) {
    const timeout = (err as Error)?.name === 'TimeoutError'
    throw createError({ statusCode: 502, message: timeout ? 'Die KI hat nicht rechtzeitig geantwortet' : 'Die KI ist nicht erreichbar' })
  }

  if (!res.ok) {
    // Status only: the provider's error body may echo the request (student answers)
    console.warn(`[ai] chat completion failed with HTTP ${res.status}`)
    const message = res.status === 401 || res.status === 403
      ? 'Der KI-Zugang ist ungültig (API-Key prüfen)'
      : res.status === 429 ? 'Die KI ist gerade ausgelastet, bitte gleich nochmal versuchen' : `Die KI hat einen Fehler gemeldet (HTTP ${res.status})`
    throw createError({ statusCode: 502, message })
  }
  const data = await res.json().catch(() => null) as ChatResponse | null
  const text = data?.choices?.[0]?.message?.content
  if (!text) throw createError({ statusCode: 502, message: 'Die KI hat keine Antwort geliefert' })
  return text
}
