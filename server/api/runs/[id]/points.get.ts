// Teacher: the answer blocks of a run with their maximum points, to set them afterwards (points.put.ts).
export default defineEventHandler(async (event) => {
  const me = await requireTeacher(event)
  const { run } = await requireRunAccess(getRouterParam(event, 'id')!, me.id)
  return toRunPointsView(run)
})
