// Teacher/projector view of a run. No content or solutions here: the projector is visible to the class.
export default defineEventHandler(async (event) => {
  const me = await requireTeacher(event)
  const { run } = await requireRunAccess(getRouterParam(event, 'id')!, me.id)
  return { ...toRunInfo(run), present: presenceCount(run.id), serverNow: new Date() }
})
