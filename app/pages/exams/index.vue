<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

definePageMeta({ layout: 'dashboard', middleware: 'auth' })
useHead({ title: 'Prüfungen · exam' })

const route = useRoute()
const router = useRouter()
const toast = useToast()

const showArchived = computed({
  get: () => route.query.archiv === '1',
  set: v => router.replace({ query: { ...route.query, archiv: v ? '1' : undefined } }),
})

const { data: exams, refresh, status } = await useFetch('/api/exams', {
  query: { archived: computed(() => (showArchived.value ? '1' : '0')) },
  default: () => [],
})
type Row = NonNullable<typeof exams.value>[number]

const search = ref('')
const filtered = computed(() => {
  const term = search.value.trim().toLowerCase()
  if (!term) return exams.value
  return exams.value.filter(e => e.title.toLowerCase().includes(term) || e.owner.name.toLowerCase().includes(term))
})

const dateFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' })

// --- create ---
const createOpen = ref(false)
const newTitle = ref('')
const newTemplate = ref<(typeof EXAM_TEMPLATES)[number]>('normalization')
const creating = ref(false)
const templateItems = [
  { label: 'Normalisierung (1NF → 2NF → 3NF)', value: 'normalization', description: 'Szenario, unnormalisierte Tabelle und drei Schritte mit Tabellen und Begründung' },
  { label: 'Leer', value: 'blank', description: 'Eigene Blöcke zusammenstellen' },
]

async function createExam() {
  creating.value = true
  try {
    const res = await $fetch<{ id: string }>('/api/exams', { method: 'POST', body: { title: newTitle.value, template: newTemplate.value } })
    await navigateTo(`/exams/${res.id}`)
  }
  catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
  }
  finally {
    creating.value = false
  }
}

// --- row actions ---
async function duplicate(row: Row) {
  try {
    const res = await $fetch<{ id: string }>(`/api/exams/${row.id}/duplicate`, { method: 'POST' })
    toast.add({ title: 'Prüfung kopiert', color: 'success', icon: 'i-lucide-copy' })
    await navigateTo(`/exams/${res.id}`)
  }
  catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
  }
}

async function setArchived(row: Row, archived: boolean) {
  try {
    await $fetch(`/api/exams/${row.id}`, { method: 'PATCH', body: { archived } })
    toast.add({ title: archived ? 'Archiviert' : 'Wiederhergestellt', color: 'success' })
    await refresh()
  }
  catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
  }
}

function actions(row: Row): DropdownMenuItem[][] {
  return [
    [
      { label: 'Bearbeiten', icon: 'i-lucide-pencil', to: `/exams/${row.id}` },
      { label: 'Kopieren', icon: 'i-lucide-copy', onSelect: () => duplicate(row) },
    ],
    ...(row.isOwner
      ? [[row.archived
          ? { label: 'Wiederherstellen', icon: 'i-lucide-archive-restore', onSelect: () => setArchived(row, false) }
          : { label: 'Archivieren', icon: 'i-lucide-archive', onSelect: () => setArchived(row, true) }]]
      : []),
  ]
}

const startFor = ref<Row | null>(null)
</script>

<template>
  <UDashboardPanel id="exams">
    <template #header>
      <UDashboardNavbar title="Prüfungen">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-lucide-plus"
            @click="createOpen = true"
          >
            Neue Prüfung
          </UButton>
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <template #left>
          <UInput
            v-model="search"
            icon="i-lucide-search"
            placeholder="Suchen …"
            class="w-full sm:w-64"
          />
        </template>
        <template #right>
          <USwitch
            v-model="showArchived"
            label="Archiv"
          />
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <UEmpty
        v-if="status !== 'pending' && !exams.length"
        :icon="showArchived ? 'i-lucide-archive' : 'i-lucide-file-pen-line'"
        :title="showArchived ? 'Archiv ist leer' : 'Noch keine Prüfungen'"
        :description="showArchived ? undefined : 'Leg deine erste Prüfung an, z. B. mit der Vorlage Normalisierung.'"
        :actions="showArchived ? undefined : [{ label: 'Neue Prüfung', icon: 'i-lucide-plus', onClick: () => { createOpen = true } }]"
        class="mt-16"
      />
      <UEmpty
        v-else-if="exams.length && !filtered.length"
        icon="i-lucide-search-x"
        title="Nichts gefunden"
        :description="`Keine Prüfung passt zu „${search}“.`"
        class="mt-16"
      />

      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <UCard
          v-for="exam in filtered"
          :key="exam.id"
          class="flex flex-col"
          :ui="{ body: 'flex-1 flex flex-col gap-3' }"
        >
          <div class="flex items-start gap-2">
            <NuxtLink
              :to="`/exams/${exam.id}`"
              class="flex-1 min-w-0 font-semibold text-highlighted hover:text-primary line-clamp-2"
            >
              {{ exam.title }}
            </NuxtLink>
            <UDropdownMenu
              :items="actions(exam)"
              :content="{ align: 'end' }"
            >
              <UButton
                icon="i-lucide-ellipsis-vertical"
                color="neutral"
                variant="ghost"
                size="sm"
                aria-label="Aktionen"
              />
            </UDropdownMenu>
          </div>

          <div class="flex flex-wrap gap-1">
            <UBadge
              v-if="!exam.released"
              :icon="exam.draftUpdatedVia === 'mcp' ? 'i-lucide-bot' : 'i-lucide-pencil-line'"
              color="warning"
              variant="subtle"
              size="sm"
            >
              Entwurf
            </UBadge>
            <UBadge
              v-else-if="exam.unreleasedChanges"
              :icon="exam.draftUpdatedVia === 'mcp' ? 'i-lucide-bot' : 'i-lucide-pencil-line'"
              color="warning"
              variant="subtle"
              size="sm"
            >
              Änderungen nicht freigegeben
            </UBadge>
            <UBadge
              v-else
              icon="i-lucide-circle-check"
              color="success"
              variant="subtle"
              size="sm"
            >
              Freigegeben
            </UBadge>
            <UBadge
              v-if="exam.sharedWithColleagues"
              icon="i-lucide-users"
              color="neutral"
              variant="outline"
              size="sm"
            >
              Geteilt
            </UBadge>
          </div>

          <div class="mt-auto flex items-center justify-between gap-2 text-xs text-muted">
            <span class="truncate">{{ exam.isOwner ? 'Von dir' : exam.owner.name }}</span>
            <span>{{ dateFormat.format(new Date(exam.draftUpdatedAt)) }}</span>
          </div>
          <UButton
            v-if="exam.released && !exam.archived"
            icon="i-lucide-play"
            block
            @click="startFor = exam"
          >
            Starten
          </UButton>
        </UCard>
      </div>

      <UModal
        v-model:open="createOpen"
        title="Neue Prüfung"
      >
        <template #body>
          <form
            id="create-exam"
            class="flex flex-col gap-4"
            @submit.prevent="createExam"
          >
            <UFormField
              label="Titel"
              required
            >
              <UInput
                v-model="newTitle"
                :maxlength="LIMITS.title"
                placeholder="z. B. Klassenarbeit Normalisierung – Werkstatt"
                autofocus
                class="w-full"
              />
            </UFormField>
            <URadioGroup
              v-model="newTemplate"
              legend="Vorlage"
              :items="templateItems"
              variant="card"
            />
          </form>
        </template>
        <template #footer>
          <div class="flex justify-end gap-2 w-full">
            <UButton
              color="neutral"
              variant="ghost"
              @click="createOpen = false"
            >
              Abbrechen
            </UButton>
            <UButton
              type="submit"
              form="create-exam"
              icon="i-lucide-plus"
              :loading="creating"
              :disabled="!newTitle.trim()"
            >
              Anlegen
            </UButton>
          </div>
        </template>
      </UModal>

      <StartRunModal
        :exam-id="startFor?.id ?? null"
        :title="startFor?.title"
        @close="startFor = null"
      />
    </template>
  </UDashboardPanel>
</template>
