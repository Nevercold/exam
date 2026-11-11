<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

useHead({ title: 'Einladung · exam' })

const route = useRoute()
const token = route.params.token as string
const { fetch: refreshSession } = useUserSession()
const toast = useToast()

const { data: invite, error } = await useFetch(`/api/invites/${token}`)

const schema = setPasswordSchema.extend({ confirm: z.string() })
  .refine(d => d.password === d.confirm, { message: 'Passwörter stimmen nicht überein', path: ['confirm'] })

const state = reactive({ password: '', confirm: '' })
const loading = ref(false)

async function onSubmit(event: FormSubmitEvent<z.output<typeof schema>>) {
  loading.value = true
  try {
    await $fetch(`/api/invites/${token}`, { method: 'POST', body: { password: event.data.password } })
    await refreshSession()
    toast.add({ title: 'Willkommen bei exam! 🎉', color: 'success' })
    await navigateTo('/exams')
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
  <div class="w-full max-w-sm flex flex-col items-center gap-8">
    <AppLogo size="lg" />

    <UCard class="w-full shadow-xl">
      <div
        v-if="error"
        class="flex flex-col items-center gap-3 text-center py-4"
      >
        <UIcon
          name="i-lucide-link-2-off"
          class="size-10 text-muted"
        />
        <p class="font-medium">
          Dieser Einladungslink ist ungültig oder abgelaufen.
        </p>
        <p class="text-sm text-muted">
          Bitte frag deinen Admin nach einem neuen Link.
        </p>
      </div>

      <template v-else-if="invite">
        <h1 class="text-lg font-semibold">
          Hallo {{ invite.name }} 👋
        </h1>
        <p class="text-sm text-muted mb-4">
          Lege ein Passwort für <strong>{{ invite.email }}</strong> fest.
        </p>

        <UForm
          :schema="schema"
          :state="state"
          class="flex flex-col gap-4"
          @submit="onSubmit"
        >
          <UFormField
            label="Passwort"
            name="password"
            help="Mindestens 10 Zeichen"
          >
            <UInput
              v-model="state.password"
              type="password"
              autocomplete="new-password"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Passwort wiederholen"
            name="confirm"
          >
            <UInput
              v-model="state.confirm"
              type="password"
              autocomplete="new-password"
              class="w-full"
            />
          </UFormField>
          <UButton
            type="submit"
            block
            :loading="loading"
          >
            Passwort speichern & loslegen
          </UButton>
        </UForm>
      </template>
    </UCard>
  </div>
</template>
