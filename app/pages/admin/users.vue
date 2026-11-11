<script setup lang="ts">
import type { DropdownMenuItem, FormSubmitEvent, TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'dashboard', middleware: 'admin' })
useHead({ title: 'Benutzer · exam' })

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')
const UDropdownMenu = resolveComponent('UDropdownMenu')

const { user: me } = useUserSession()
const toast = useToast()

const { data: users, refresh } = await useFetch('/api/admin/users', { default: () => [] })
type Row = NonNullable<typeof users.value>[number]

// --- Einladungslink anzeigen ---
const inviteLink = ref<{ name: string, url: string, expiresAt: string } | null>(null)
function showInvite(name: string, invite: { path: string, expiresAt: string | Date }) {
  inviteLink.value = {
    name,
    url: `${window.location.origin}${invite.path}`,
    expiresAt: new Date(invite.expiresAt).toLocaleDateString('de-DE'),
  }
}
async function copyInvite() {
  if (!inviteLink.value) return
  await navigator.clipboard.writeText(inviteLink.value.url)
  toast.add({ title: 'Link kopiert', icon: 'i-lucide-clipboard-check', color: 'success' })
}

// --- Benutzer anlegen ---
const createOpen = ref(false)
const createState = reactive({ name: '', email: '', isAdmin: false })
const creating = ref(false)

async function onCreate(event: FormSubmitEvent<CreateUserInput>) {
  creating.value = true
  try {
    const res = await $fetch('/api/admin/users', { method: 'POST', body: event.data })
    createOpen.value = false
    Object.assign(createState, { name: '', email: '', isAdmin: false })
    await refresh()
    showInvite(res.user.name, res.invite)
  }
  catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
  }
  finally {
    creating.value = false
  }
}

// --- Aktionen ---
async function patchUser(row: Row, body: { isAdmin?: boolean, active?: boolean }) {
  try {
    await $fetch(`/api/admin/users/${row.id}`, { method: 'PATCH', body })
    await refresh()
  }
  catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
  }
}

async function newInvite(row: Row) {
  try {
    const invite = await $fetch<{ path: string, expiresAt: string }>(`/api/admin/users/${row.id}/invite`, { method: 'POST' })
    showInvite(row.name, invite)
    await refresh()
  }
  catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
  }
}

function rowActions(row: Row): DropdownMenuItem[][] {
  const self = row.id === me.value?.id
  return [
    [{
      label: row.hasPassword ? 'Passwort-Reset-Link' : 'Neuer Einladungslink',
      icon: 'i-lucide-link',
      onSelect: () => newInvite(row),
    }],
    [
      {
        label: row.isAdmin ? 'Admin-Rechte entziehen' : 'Zum Admin machen',
        icon: 'i-lucide-shield',
        disabled: self,
        onSelect: () => patchUser(row, { isAdmin: !row.isAdmin }),
      },
      {
        label: row.active ? 'Deaktivieren' : 'Aktivieren',
        icon: row.active ? 'i-lucide-user-x' : 'i-lucide-user-check',
        color: row.active ? 'error' : undefined,
        disabled: self,
        onSelect: () => patchUser(row, { active: !row.active }),
      },
    ],
  ]
}

function status(row: Row) {
  if (!row.active) return { label: 'Deaktiviert', color: 'neutral' as const }
  if (!row.hasPassword) return { label: row.inviteExpiresAt ? 'Eingeladen' : 'Einladung abgelaufen', color: 'warning' as const }
  return { label: 'Aktiv', color: 'success' as const }
}

const columns: TableColumn<Row>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => h('div', { class: 'flex flex-col' }, [
      h('span', { class: 'font-medium text-highlighted' }, row.original.name),
      h('span', { class: 'text-muted text-xs' }, row.original.email),
    ]),
  },
  {
    id: 'role',
    header: 'Rolle',
    cell: ({ row }) => row.original.isAdmin
      ? h(UBadge, { label: 'Admin', variant: 'subtle', color: 'primary' })
      : 'Lehrkraft',
  },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }) => h(UBadge, { variant: 'subtle', ...status(row.original) }),
  },
  {
    id: 'actions',
    meta: { class: { td: 'text-right' } },
    cell: ({ row }) => h(UDropdownMenu, { items: rowActions(row.original), content: { align: 'end' } }, () =>
      h(UButton, { 'icon': 'i-lucide-ellipsis-vertical', 'color': 'neutral', 'variant': 'ghost', 'aria-label': 'Aktionen' }),
    ),
  },
]
</script>

<template>
  <UDashboardPanel id="users">
    <template #header>
      <UDashboardNavbar title="Benutzer">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-lucide-user-plus"
            @click="createOpen = true"
          >
            Lehrkraft anlegen
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UTable
        :data="users"
        :columns="columns"
        class="w-full"
      />

      <UModal
        v-model:open="createOpen"
        title="Lehrkraft anlegen"
        description="Danach bekommst du einen Einladungslink, über den das Passwort gesetzt wird."
      >
        <template #body>
          <UForm
            :schema="createUserSchema"
            :state="createState"
            class="flex flex-col gap-4"
            @submit="onCreate"
          >
            <UFormField
              label="Name"
              name="name"
            >
              <UInput
                v-model="createState.name"
                class="w-full"
                autofocus
              />
            </UFormField>
            <UFormField
              label="E-Mail"
              name="email"
            >
              <UInput
                v-model="createState.email"
                type="email"
                class="w-full"
              />
            </UFormField>
            <UFormField name="isAdmin">
              <USwitch
                v-model="createState.isAdmin"
                label="Admin-Rechte"
                description="Darf weitere Lehrkräfte anlegen"
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
                Anlegen
              </UButton>
            </div>
          </UForm>
        </template>
      </UModal>

      <UModal
        :open="!!inviteLink"
        title="Einladungslink"
        :description="inviteLink ? `Für ${inviteLink.name}, gültig bis ${inviteLink.expiresAt}. Er wird nur jetzt angezeigt.` : undefined"
        @update:open="(v: boolean) => { if (!v) inviteLink = null }"
      >
        <template #body>
          <div class="flex flex-col gap-4">
            <UInput
              :model-value="inviteLink?.url"
              readonly
              class="w-full font-mono"
              :ui="{ base: 'text-xs' }"
            />
            <UButton
              icon="i-lucide-clipboard"
              block
              @click="copyInvite"
            >
              Link kopieren
            </UButton>
            <p class="text-xs text-muted">
              Schick den Link z. B. per Messenger. Wer ihn öffnet, kann ein Passwort setzen.
            </p>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
