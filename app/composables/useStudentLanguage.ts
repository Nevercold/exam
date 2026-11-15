// Student language settings, remembered in this browser:
// - interface: German or English (buttons, hints, dialogs)
// - translation: language code of the task translation shown below the German text, or null (default: off)
// Teacher pages don't use this; they stay German.

const UI_KEY = 'exam:ui-lang'
const TRANSLATION_KEY = 'exam:translation'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  }
  catch {
    return null
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  }
  catch {
    // Private mode etc.: the setting just isn't remembered
  }
}

export function useStudentLanguage() {
  const ui = useState<UiLang>('student-ui-lang', () => 'de')
  const translation = useState<string | null>('student-translation', () => null)

  // After hydration only, so server and client render the same first
  onMounted(() => {
    if (read(UI_KEY) === 'en') ui.value = 'en'
    translation.value = read(TRANSLATION_KEY)
  })

  const t = computed(() => UI_TEXT[ui.value])

  function setUi(lang: UiLang) {
    ui.value = lang
    write(UI_KEY, lang)
  }

  function setTranslation(code: string | null) {
    translation.value = code
    write(TRANSLATION_KEY, code)
  }

  return { ui, t, translation, setUi, setTranslation }
}
