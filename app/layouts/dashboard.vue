<script setup lang="ts">
import type { DropdownMenuItem, NavigationMenuItem } from '@nuxt/ui'

const { user, clear } = useUserSession()

const links = computed<NavigationMenuItem[]>(() => [
  { label: 'Prüfungen', icon: 'i-lucide-file-pen-line', to: '/exams' },
  { label: 'PDF prüfen', icon: 'i-lucide-shield-check', to: '/verify' },
  ...(user.value?.isAdmin ? [{ label: 'Benutzer', icon: 'i-lucide-users', to: '/admin/users' }] : []),
  { label: 'Einstellungen', icon: 'i-lucide-settings', to: '/settings' },
])

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await clear()
  await navigateTo('/login')
}

const userMenu: DropdownMenuItem[][] = [
  [{ label: 'Einstellungen', icon: 'i-lucide-settings', to: '/settings' }],
  [{ label: 'Abmelden', icon: 'i-lucide-log-out', onSelect: logout }],
]
</script>

<template>
  <UDashboardGroup>
    <UDashboardSidebar
      collapsible
      :ui="{ footer: 'border-t border-default' }"
    >
      <template #header="{ collapsed }">
        <NuxtLink
          to="/exams"
          class="px-1"
        >
          <AppLogo :icon-only="collapsed" />
        </NuxtLink>
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu
          :items="links"
          orientation="vertical"
          :collapsed="collapsed"
        />
      </template>

      <template #footer="{ collapsed }">
        <div class="flex w-full items-center gap-1">
          <UDropdownMenu
            :items="userMenu"
            :content="{ align: 'start' }"
            class="flex-1 min-w-0"
          >
            <UButton
              :label="collapsed ? undefined : user?.name"
              :avatar="{ alt: user?.name }"
              color="neutral"
              variant="ghost"
              block
              class="justify-start"
            />
          </UDropdownMenu>
          <UColorModeButton v-if="!collapsed" />
        </div>
      </template>
    </UDashboardSidebar>

    <slot />
  </UDashboardGroup>
</template>
