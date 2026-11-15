// Teacher: whether AI grading suggestions are configured (the verification page shows the buttons only then).
export default defineEventHandler(async (event) => {
  await requireTeacher(event)
  const config = aiConfig()
  return { enabled: !!config, model: config?.model ?? null }
})
