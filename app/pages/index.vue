<script setup lang="ts">
// Student entry: PIN from the projector (the QR code links directly to /p/:pin)
const { t } = useStudentLanguage()
useHead({ title: () => `${t.value.joinTitle} · exam` })

const pinDigits = ref<(number | undefined)[]>([])
const pin = computed(() => pinDigits.value.join(''))

async function join() {
  if (/^\d{6}$/.test(pin.value)) await navigateTo(`/p/${pin.value}`)
}
</script>

<template>
  <div class="w-full max-w-sm flex flex-col items-center gap-8">
    <div class="w-full flex items-center justify-between">
      <AppLogo size="lg" />
      <StudentLanguageMenu />
    </div>

    <UCard
      class="w-full shadow-xl"
      :ui="{ body: 'p-6 sm:p-6' }"
    >
      <form
        class="flex flex-col items-center gap-4"
        @submit.prevent="join"
      >
        <p class="text-sm text-muted">
          {{ t.pinPrompt }}
        </p>
        <UPinInput
          v-model="pinDigits"
          :length="6"
          :separator="3"
          type="number"
          size="xl"
          autofocus
          @complete="join"
        />
        <UButton
          type="submit"
          size="xl"
          block
          :disabled="pin.length !== 6"
        >
          {{ t.next }}
        </UButton>
      </form>
    </UCard>

    <NuxtLink
      to="/login"
      class="text-sm text-muted hover:text-default"
    >
      {{ t.teacherLogin }}
    </NuxtLink>
  </div>
</template>
