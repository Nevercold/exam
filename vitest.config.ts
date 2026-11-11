import { defineConfig } from 'vitest/config'

// Unit tests for pure logic (scoring, rate limit, schemas). No Nuxt context needed.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['test/setup.ts'],
  },
})
