<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'

// Personal API tokens for the MCP server (create once-visible, list, revoke)
const toast = useToast()
const { data: tokens, refresh } = await useFetch('/api/me/tokens', { default: () => [] })
type Token = NonNullable<typeof tokens.value>[number]

const dateFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' })
const lifetimeItems = API_TOKEN_LIFETIMES.map(d => ({ label: d === 365 ? '1 Jahr' : `${d} Tage`, value: d }))

const mcpUrl = ref('')
onMounted(() => (mcpUrl.value = `${window.location.origin}/mcp`))

// --- create ---
const createOpen = ref(false)
const createState = reactive<CreateApiTokenInput>({ name: '', expiresInDays: 90 })
const creating = ref(false)
const created = ref<{ name: string, token: string } | null>(null)

async function onCreate(event: FormSubmitEvent<CreateApiTokenInput>) {
  creating.value = true
  try {
    const res = await $fetch('/api/me/tokens', { method: 'POST', body: event.data })
    created.value = { name: res.name, token: res.token }
    createOpen.value = false
    Object.assign(createState, { name: '', expiresInDays: 90 })
    await refresh()
  }
  catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
  }
  finally {
    creating.value = false
  }
}

const claudeCommand = computed(() => created.value
  ? `claude mcp add --transport http exam ${mcpUrl.value} --header "Authorization: Bearer ${created.value.token}"`
  : '')

async function copy(text: string) {
  await navigator.clipboard.writeText(text)
  toast.add({ title: 'Kopiert', icon: 'i-lucide-clipboard-check', color: 'success' })
}

// --- revoke ---
const toRevoke = ref<Token | null>(null)
const revoking = ref(false)
async function revoke() {
  if (!toRevoke.value) return
  revoking.value = true
  try {
    await $fetch(`/api/me/tokens/${toRevoke.value.id}`, { method: 'DELETE' })
    toRevoke.value = null
    await refresh()
    toast.add({ title: 'Token widerrufen', color: 'success' })
  }
  catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
  }
  finally {
    revoking.value = false
  }
}

const isExpired = (t: Token) => new Date(t.expiresAt).getTime() < Date.now()
</script>

<template>
  <UPageCard
    title="API-Tokens (KI-Agents)"
    description="Damit können KI-Agents wie Claude über den MCP-Server Prüfungen für dich als Entwurf anlegen. Anwendungen mit OAuth-Unterstützung brauchen kein Token: Server-URL eintragen und Zugriff im Browser erlauben. Die Verbindung erscheint dann hier."
    variant="subtle"
  >
    <div class="flex flex-col gap-3">
      <p
        v-if="!tokens.length"
        class="text-sm text-muted"
      >
        Noch keine Tokens.
      </p>
      <div
        v-for="t in tokens"
        :key="t.id"
        class="flex items-center gap-3 rounded-lg border border-default p-3"
      >
        <UIcon
          :name="t.source === 'oauth' ? 'i-lucide-plug' : 'i-lucide-key-round'"
          class="size-5 text-muted shrink-0"
        />
        <div class="flex-1 min-w-0">
          <p class="font-medium truncate">
            {{ t.name }}
          </p>
          <p class="text-xs text-muted">
            <span
              v-if="t.source === 'manual'"
              class="font-mono"
            >{{ t.prefix }}… · </span>
            <span v-else>Verbunden per OAuth · </span>
            {{ t.lastUsedAt ? `zuletzt genutzt ${dateFormat.format(new Date(t.lastUsedAt))}` : 'noch nie genutzt' }}
            · <span :class="{ 'text-error': isExpired(t) }">{{ isExpired(t) ? 'abgelaufen' : `${t.source === 'oauth' ? 'verbunden bis' : 'gültig bis'} ${dateFormat.format(new Date(t.expiresAt))}` }}</span>
          </p>
        </div>
        <UButton
          icon="i-lucide-trash-2"
          color="neutral"
          variant="ghost"
          aria-label="Token widerrufen"
          @click="toRevoke = t"
        />
      </div>

      <UButton
        icon="i-lucide-plus"
        color="neutral"
        variant="outline"
        class="self-start"
        @click="createOpen = true"
      >
        Token erstellen
      </UButton>
    </div>

    <UModal
      v-model:open="createOpen"
      title="API-Token erstellen"
    >
      <template #body>
        <UForm
          :schema="createApiTokenSchema"
          :state="createState"
          class="flex flex-col gap-4"
          @submit="onCreate"
        >
          <UFormField
            label="Name"
            name="name"
            help="Wofür ist das Token? z. B. „Claude Code am Laptop“"
          >
            <UInput
              v-model="createState.name"
              class="w-full"
              autofocus
            />
          </UFormField>
          <UFormField
            label="Gültigkeit"
            name="expiresInDays"
          >
            <USelect
              v-model="createState.expiresInDays"
              :items="lifetimeItems"
              class="w-full"
            />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              @click="createOpen = false"
            >
              Abbrechen
            </UButton>
            <UButton
              type="submit"
              :loading="creating"
            >
              Erstellen
            </UButton>
          </div>
        </UForm>
      </template>
    </UModal>

    <UModal
      :open="!!created"
      title="Token erstellt"
      description="Das Token wird nur jetzt angezeigt. Kopiere es an einen sicheren Ort."
      :ui="{ content: 'sm:max-w-2xl' }"
      @update:open="(v: boolean) => { if (!v) created = null }"
    >
      <template #body>
        <div
          v-if="created"
          class="flex flex-col gap-5"
        >
          <UFormField label="Token">
            <div class="flex gap-2">
              <UInput
                :model-value="created.token"
                readonly
                class="flex-1"
                :ui="{ base: 'font-mono text-xs' }"
              />
              <UButton
                icon="i-lucide-clipboard"
                color="neutral"
                variant="outline"
                aria-label="Token kopieren"
                @click="copy(created.token)"
              />
            </div>
          </UFormField>

          <UFormField
            label="Claude Code"
            help="Im Terminal ausführen, danach steht exam in Claude Code zur Verfügung."
          >
            <div class="flex gap-2 items-start">
              <pre class="flex-1 min-w-0 overflow-x-auto rounded-md bg-elevated p-3 text-xs font-mono whitespace-pre-wrap break-all">{{ claudeCommand }}</pre>
              <UButton
                icon="i-lucide-clipboard"
                color="neutral"
                variant="outline"
                aria-label="Befehl kopieren"
                @click="copy(claudeCommand)"
              />
            </div>
          </UFormField>

          <p class="text-xs text-muted">
            Andere MCP-Clients: Server-URL <span class="font-mono">{{ mcpUrl }}</span>,
            Transport „Streamable HTTP“, Header <span class="font-mono">Authorization: Bearer &lt;Token&gt;</span>.
          </p>
        </div>
      </template>
    </UModal>

    <UModal
      :open="!!toRevoke"
      title="Token widerrufen?"
      :description="toRevoke ? `„${toRevoke.name}“ funktioniert danach nicht mehr.` : undefined"
      @update:open="(v: boolean) => { if (!v) toRevoke = null }"
    >
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton
            color="neutral"
            variant="ghost"
            @click="toRevoke = null"
          >
            Abbrechen
          </UButton>
          <UButton
            color="error"
            :loading="revoking"
            @click="revoke"
          >
            Widerrufen
          </UButton>
        </div>
      </template>
    </UModal>
  </UPageCard>
</template>
