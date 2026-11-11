// Anonymous head count per run for the projector: each student browser sends a random client id
// (no name, no IP stored) while waiting (join polling) and as a heartbeat while working.
// Simplification: in memory, lost on restart (counts recover within one heartbeat); fine for a single instance.

export const PRESENCE_WINDOW_MS = 60_000
const MAX_CLIENTS_PER_RUN = 500

const runs = new Map<string, Map<string, number>>()
let lastSweep = 0

function sweep(now: number) {
  if (now - lastSweep < PRESENCE_WINDOW_MS) return
  lastSweep = now
  for (const [runId, clients] of runs) {
    for (const [id, seen] of clients) if (now - seen > PRESENCE_WINDOW_MS) clients.delete(id)
    if (clients.size === 0) runs.delete(runId)
  }
}

export function touchPresence(runId: string, clientId: string, now = Date.now()) {
  sweep(now)
  let clients = runs.get(runId)
  if (!clients) runs.set(runId, (clients = new Map()))
  if (clients.size >= MAX_CLIENTS_PER_RUN && !clients.has(clientId)) return
  clients.set(clientId, now)
}

export function presenceCount(runId: string, now = Date.now()) {
  let count = 0
  for (const seen of runs.get(runId)?.values() ?? []) if (now - seen <= PRESENCE_WINDOW_MS) count++
  return count
}

/** For tests. */
export function resetPresence() {
  runs.clear()
  lastSweep = 0
}
