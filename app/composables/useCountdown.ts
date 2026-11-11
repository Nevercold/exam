/**
 * Remaining time until `endsAt`, computed locally. `serverNow` corrects the device clock
 * (student devices are often off by minutes).
 */
export function useCountdown(endsAt: () => string | Date | null | undefined, serverNow: () => string | Date | undefined) {
  const remainingMs = ref<number | null>(null)
  let offset = 0
  let timer: ReturnType<typeof setInterval> | undefined

  function update() {
    const end = endsAt()
    remainingMs.value = end ? Math.max(0, new Date(end).getTime() - (Date.now() + offset)) : null
  }

  watch(serverNow, (now) => {
    if (now) offset = new Date(now).getTime() - Date.now()
    update()
  }, { immediate: true })
  watch(endsAt, update)

  onMounted(() => (timer = setInterval(update, 500)))
  onBeforeUnmount(() => clearInterval(timer))

  const label = computed(() => {
    if (remainingMs.value === null) return null
    const total = Math.ceil(remainingMs.value / 1000)
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const s = total % 60
    const mm = String(m).padStart(h ? 2 : 1, '0')
    return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`
  })
  const expired = computed(() => remainingMs.value === 0)

  return { remainingMs, label, expired }
}
