/** Human-readable (German) message from a $fetch error. */
export function errorMessage(err: unknown, fallback = 'Etwas ist schiefgelaufen'): string {
  const e = err as { data?: { message?: string, statusMessage?: string } }
  if (e?.data?.statusMessage === 'Validation Error') return 'Bitte Eingaben prüfen'
  return e?.data?.message || fallback
}
