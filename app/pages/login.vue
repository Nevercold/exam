<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'

useHead({ title: 'Anmelden · exam' })

const route = useRoute()
const { fetch: refreshSession, loggedIn } = useUserSession()
const toast = useToast()

if (loggedIn.value) await navigateTo('/exams')

const state = reactive({ email: '', password: '' })
const loading = ref(false)

async function onSubmit(event: FormSubmitEvent<LoginInput>) {
  loading.value = true
  try {
    await $fetch('/api/auth/login', { method: 'POST', body: event.data })
    await refreshSession()
    const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') && !route.query.redirect.startsWith('//')
      ? route.query.redirect
      : '/exams'
    await navigateTo(redirect)
  }
  catch (err) {
    toast.add({ title: errorMessage(err, 'Anmeldung fehlgeschlagen'), color: 'error' })
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="w-full max-w-sm flex flex-col items-center gap-8">
    <NuxtLink to="/">
      <AppLogo size="lg" />
    </NuxtLink>

    <UCard class="w-full shadow-xl">
      <template #header>
        <h1 class="text-lg font-semibold">
          Lehrer-Login
        </h1>
      </template>

      <UForm
        :schema="loginSchema"
        :state="state"
        class="flex flex-col gap-4"
        @submit="onSubmit"
      >
        <UFormField
          label="E-Mail"
          name="email"
        >
          <UInput
            v-model="state.email"
            type="email"
            autocomplete="username"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Passwort"
          name="password"
        >
          <UInput
            v-model="state.password"
            type="password"
            autocomplete="current-password"
            class="w-full"
          />
        </UFormField>
        <UButton
          type="submit"
          block
          :loading="loading"
        >
          Anmelden
        </UButton>
      </UForm>
    </UCard>

    <p class="text-xs text-muted text-center">
      Noch keinen Zugang? Frag deinen Admin nach einem Einladungslink.
    </p>
  </div>
</template>
