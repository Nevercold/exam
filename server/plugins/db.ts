// Kick off migrations on server start (requests wait for them via middleware/00.db.ts)
export default defineNitroPlugin(() => {
  ensureDb().catch((err) => {
    console.error('[db] initialization failed', err)
    process.exit(1)
  })
})
