// UI convenience only. The real check is requireAdmin() on the server.
export default defineNuxtRouteMiddleware(() => {
  const { loggedIn, user } = useUserSession()
  if (!loggedIn.value) return navigateTo('/login')
  if (!user.value?.isAdmin) return navigateTo('/exams')
})
