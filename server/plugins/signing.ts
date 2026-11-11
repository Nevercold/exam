// Load the signing key at startup: a missing or broken key must stop the container right away,
// not fail the first student export in the middle of an exam.
export default defineNitroPlugin(() => {
  try {
    useSigningKeys()
  }
  catch (err) {
    console.error('[signing]', (err as Error).message)
    process.exit(1)
  }
})
