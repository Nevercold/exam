<script setup lang="ts">
// Student entry: PIN from the projector (the QR code links directly to /p/:pin)
useHead({ title: 'Prüfung beitreten · exam' })

const pinDigits = ref<(number | undefined)[]>([])
const pin = computed(() => pinDigits.value.join(''))

async function join() {
  if (/^\d{6}$/.test(pin.value)) await navigateTo(`/p/${pin.value}`)
}
</script>

<template>
  <div class="w-full max-w-sm flex flex-col items-center gap-8">
    <AppLogo size="lg" />

    <UCard
      class="w-full shadow-xl"
      :ui="{ body: 'p-6 sm:p-6' }"
    >
      <form
        class="flex flex-col items-center gap-4"
        @submit.prevent="join"
      >
        <p class="text-sm text-muted">
          PIN der Prüfung (steht am Beamer)
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
          Weiter
        </UButton>
      </form>
    </UCard>

    <NuxtLink
      to="/login"
      class="text-sm text-muted hover:text-default"
    >
      Login für Lehrkräfte
    </NuxtLink>
  </div>
</template>
