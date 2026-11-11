// Teacher/projector view of a run. No solutions here: the projector is visible to the class.
export default defineEventHandler(async (event) => {
  const me = await requireTeacher(event)
  const { run } = await requireRunAccess(getRouterParam(event, 'id')!, me.id)
  return { ...toRunInfo(run), serverNow: new Date() }
})
