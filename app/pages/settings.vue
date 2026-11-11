<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

definePageMeta({ layout: 'dashboard', middleware: 'auth' })
useHead({ title: 'Einstellungen · exam' })

const { user } = useUserSession()
const toast = useToast()

const schema = changePasswordSchema.extend({ confirm: z.string() })
  .refine(d => d.newPassword === d.confirm, { message: 'Passwörter stimmen nicht überein', path: ['confirm'] })

const state = reactive({ currentPassword: '', newPassword: '', confirm: '' })
const loading = ref(false)

async function onSubmit(event: FormSubmitEvent<z.output<typeof schema>>) {
  loading.value = true
  try {
    const { currentPassword, newPassword } = event.data
    await $fetch('/api/me/password', { method: 'POST', body: { currentPassword, newPassword } })
    Object.assign(state, { currentPassword: '', newPassword: '', confirm: '' })
    toast.add({ title: 'Passwort geändert', color: 'success' })
  }
  catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="settings">
    <template #header>
      <UDashboardNavbar title="Einstellungen">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="max-w-xl w-full mx-auto flex flex-col gap-6">
        <UPageCard
          title="Profil"
          variant="subtle"
        >
          <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt class="text-muted">
              Name
            </dt>
            <dd>{{ user?.name }}</dd>
            <dt class="text-muted">
              E-Mail
            </dt>
            <dd>{{ user?.email }}</dd>
            <dt class="text-muted">
              Rolle
            </dt>
            <dd>{{ user?.isAdmin ? 'Admin' : 'Lehrkraft' }}</dd>
          </dl>
        </UPageCard>

        <UPageCard
          title="Passwort ändern"
          variant="subtle"
        >
          <UForm
            :schema="schema"
            :state="state"
            class="flex flex-col gap-4"
            @submit="onSubmit"
          >
            <UFormField
              label="Aktuelles Passwort"
              name="currentPassword"
            >
              <UInput
                v-model="state.currentPassword"
                type="password"
                autocomplete="current-password"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="Neues Passwort"
              name="newPassword"
              help="Mindestens 10 Zeichen"
            >
              <UInput
                v-model="state.newPassword"
                type="password"
                autocomplete="new-password"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="Neues Passwort wiederholen"
              name="confirm"
            >
              <UInput
                v-model="state.confirm"
                type="password"
                autocomplete="new-password"
                class="w-full"
              />
            </UFormField>
            <div>
              <UButton
                type="submit"
                :loading="loading"
              >
                Speichern
              </UButton>
            </div>
          </UForm>
        </UPageCard>

        <ApiTokens />
      </div>
    </template>
  </UDashboardPanel>
</template>
