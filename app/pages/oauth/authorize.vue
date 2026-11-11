<script setup lang="ts">
// OAuth consent page: an MCP client (e.g. Claude) asks for access to the teacher's exams.
definePageMeta({ middleware: 'auth' })
useHead({ title: 'Zugriff erlauben · exam' })

const route = useRoute()
const params = computed(() => Object.fromEntries(Object.entries(route.query).filter(([, v]) => typeof v === 'string')) as Record<string, string>)

const { data, error } = await useFetch<{ redirect?: string, client?: { name: string, domain: string | null }, redirectHost?: string, loopback?: boolean }>(
  '/api/oauth/authorize',
  { query: params },
)

// Errors that must go back to the client (e.g. missing PKCE) are redirected right away
if (data.value?.redirect) await navigateTo(data.value.redirect, { external: true })

const busy = ref<'approve' | 'deny' | null>(null)
async function decide(approve: boolean) {
  busy.value = approve ? 'approve' : 'deny'
  try {
    const res = await $fetch<{ redirect: string }>('/api/oauth/authorize', { method: 'POST', body: { approve, params: params.value } })
    await navigateTo(res.redirect, { external: true })
  }
  catch (err) {
    useToast().add({ title: errorMessage(err), color: 'error' })
    busy.value = null
  }
}

const { user } = useUserSession()
</script>

<template>
  <div class="w-full max-w-md flex flex-col items-center gap-8">
    <AppLogo size="lg" />

    <UCard class="w-full shadow-xl">
      <div
        v-if="error"
        class="flex flex-col items-center gap-3 text-center py-4"
      >
        <UIcon
          name="i-lucide-shield-alert"
          class="size-10 text-error"
        />
        <p class="font-medium">
          Diese Anfrage ist ungültig.
        </p>
        <p class="text-sm text-muted">
          {{ errorMessage(error) }}
        </p>
      </div>

      <div
        v-else-if="data?.client"
        class="flex flex-col gap-5"
      >
        <div class="text-center">
          <UIcon
            name="i-lucide-bot"
            class="size-10 text-primary"
          />
          <h1 class="text-lg font-semibold mt-2">
            <span class="text-highlighted">{{ data.client.name }}</span> möchte auf dein exam-Konto zugreifen
          </h1>
          <p
            v-if="data.client.domain"
            class="text-sm text-muted"
          >
            Anwendung von {{ data.client.domain }}
          </p>
        </div>

        <div class="text-sm flex flex-col gap-2">
          <p class="font-medium">
            Die Anwendung kann dann als {{ user?.name }}:
          </p>
          <ul class="flex flex-col gap-1.5 text-muted">
            <li class="flex gap-2">
              <UIcon
                name="i-lucide-list-checks"
                class="size-4 mt-0.5 shrink-0"
              />deine und mit dir geteilte Prüfungen lesen, inklusive Musterlösungen
            </li>
            <li class="flex gap-2">
              <UIcon
                name="i-lucide-pencil-line"
                class="size-4 mt-0.5 shrink-0"
              />Prüfungen erstellen und ändern (immer als Entwurf, den du freigibst)
            </li>
          </ul>
        </div>

        <UAlert
          v-if="data.loopback"
          icon="i-lucide-triangle-alert"
          color="warning"
          variant="subtle"
          title="Anwendung auf diesem Gerät"
          :description="`Die Rückleitung geht an ${data.redirectHost}. Erlaube den Zugriff nur, wenn du die Verbindung gerade selbst gestartet hast.`"
        />
        <p
          v-else
          class="text-xs text-muted"
        >
          Nach der Freigabe geht es zurück zu <strong>{{ data.redirectHost }}</strong>.
        </p>

        <div class="grid grid-cols-2 gap-3">
          <UButton
            color="neutral"
            variant="outline"
            block
            :loading="busy === 'deny'"
            :disabled="!!busy"
            @click="decide(false)"
          >
            Ablehnen
          </UButton>
          <UButton
            block
            :loading="busy === 'approve'"
            :disabled="!!busy"
            @click="decide(true)"
          >
            Zugriff erlauben
          </UButton>
        </div>
        <p class="text-xs text-muted text-center">
          Widerrufen kannst du den Zugriff jederzeit unter Einstellungen → API-Tokens.
        </p>
      </div>
    </UCard>
  </div>
</template>
