// Counts how often (and how long) a student leaves the exam page while the exam is running: switching tabs,
// minimising, or focusing another window. Stored per run in localStorage so a reload doesn't reset it.
// It's an indication for the teacher, not proof: anyone with the browser's developer tools can change it.

type FocusLog = { left: number, awayMs: number }

export function useFocusLog(opts: {
  /** Storage key part, null while no run is loaded */
  runId: () => string | null
  /** True only while the exam is running (not in the waiting room, not after the end) */
  active: () => boolean
  /** Temporarily ignore leaving, e.g. while the PDF is saved (the save dialog takes the focus) */
  paused: () => boolean
}) {
  const log = ref<FocusLog>({ left: 0, awayMs: 0 })
  let awaySince: number | null = null
  const key = () => `exam:focus:${opts.runId()}`

  function save() {
    try {
      localStorage.setItem(key(), JSON.stringify(log.value))
    }
    catch {
      // Storage unavailable: the count only lives in memory
    }
  }

  watch(opts.runId, (id) => {
    if (!id) return
    try {
      const stored = JSON.parse(localStorage.getItem(key()) ?? 'null') as FocusLog | null
      if (stored && Number.isInteger(stored.left) && Number.isInteger(stored.awayMs)) log.value = stored
    }
    catch {
      // Unreadable: start at zero
    }
  }, { immediate: true })

  function away() {
    if (awaySince !== null || !opts.runId() || !opts.active() || opts.paused()) return
    awaySince = Date.now()
    log.value = { ...log.value, left: log.value.left + 1 }
    save()
  }

  function back() {
    if (awaySince === null) return
    log.value = { ...log.value, awayMs: log.value.awayMs + (Date.now() - awaySince) }
    awaySince = null
    save()
  }

  // The exam ends while the student is away: count only the time until the end
  watch(opts.active, a => !a && back())

  // blur + visibilitychange both fire on a tab switch; `awaySince` makes it count once
  const onVisibility = () => (document.visibilityState === 'hidden' ? away() : document.hasFocus() && back())
  const onBlur = () => away()
  const onFocus = () => back()
  onMounted(() => {
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
  })
  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('blur', onBlur)
    window.removeEventListener('focus', onFocus)
  })

  /** Current values for the submission, rounded to whole seconds */
  function snapshot(): FocusLog {
    const running = awaySince !== null ? Date.now() - awaySince : 0
    return { left: log.value.left, awayMs: Math.round((log.value.awayMs + running) / 1000) * 1000 }
  }

  return { log, snapshot }
}
