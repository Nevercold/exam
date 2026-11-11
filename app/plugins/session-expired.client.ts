// If the server rejects the session (expired, account deactivated, …), the cookie in the
// browser is stale: clear it and go to the login page instead of showing empty pages.
export default defineNuxtPlugin(() => {
  const { clear } = useUserSession()
  const route = useRoute()
  let redirecting = false

  globalThis.$fetch = $fetch.create({
    async onResponseError({ request, response }) {
      const url = typeof request === 'string' ? request : request.url
      if (response.status !== 401 || !url.startsWith('/api/') || url.startsWith('/api/auth/') || url.startsWith('/api/invites/')) return
      if (redirecting || route.path === '/login') return

      redirecting = true
      await clear()
      useToast().add({ title: 'Bitte melde dich erneut an.', color: 'warning', icon: 'i-lucide-log-in' })
      await navigateTo({ path: '/login', query: { redirect: route.fullPath } })
      redirecting = false
    },
  }) as typeof $fetch
})
