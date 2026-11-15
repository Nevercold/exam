import { createRequire } from 'node:module'

// libsql loads its native binary via a dynamic require that Nitro's file tracing
// can't follow. Resolve the package for the build platform and include it explicitly.
function libsqlNativeBinary() {
  const suffix = process.platform === 'linux' ? '-gnu' : process.platform === 'win32' ? '-msvc' : ''
  const pkg = `@libsql/${process.platform}-${process.arch}${suffix}`
  let req = createRequire(import.meta.url)
  for (const dep of ['@libsql/client', 'libsql']) req = createRequire(req.resolve(dep))
  try {
    return [req.resolve(`${pkg}/package.json`), req.resolve(pkg)]
  }
  catch {
    console.warn(`[build] native libsql package ${pkg} not found`)
    return []
  }
}

export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@nuxt/eslint', 'nuxt-auth-utils'],
  devtools: { enabled: false },

  app: {
    head: {
      htmlAttrs: { lang: 'de' },
      title: 'exam',
      meta: [{ name: 'theme-color', content: '#059669' }],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    },
  },
  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    // Override via NUXT_DATABASE_URL, NUXT_ADMIN_EMAIL, ...
    databaseUrl: 'file:./data/exam.db',
    adminEmail: '',
    adminPassword: '',
    adminName: 'Admin',
    // Ed25519 private key (PKCS8 DER, base64), see `pnpm keygen`. Required in production.
    signingPrivateKey: '',
    signingKeyId: 'k1',
    // Retired keys still accepted for verification: JSON object { "<kid>": "<SPKI DER base64>" }
    signingRetiredKeys: '',
    // Optional AI grading suggestions via an OpenAI-compatible API (NUXT_AI_BASE_URL, NUXT_AI_API_KEY, NUXT_AI_MODEL).
    // Disabled while any of the three is empty. See docs/deployment.md.
    ai: {
      baseUrl: '',
      apiKey: '',
      model: '',
      requestsPerMinute: 10,
    },
    session: {
      maxAge: 60 * 60 * 24 * 14,
      cookie: { sameSite: 'lax' },
    },
  },

  routeRules: {
    // Consent page must not be framed (clickjacking)
    '/oauth/**': { headers: { 'x-frame-options': 'DENY', 'content-security-policy': 'frame-ancestors \'none\'' } },
  },
  compatibilityDate: '2026-11-01',

  nitro: {
    externals: { traceInclude: libsqlNativeBinary() },
  },

  eslint: {
    config: { stylistic: true },
  },

  // Bundle icons locally: no requests to external icon APIs (school Wi-Fi, privacy)
  icon: {
    serverBundle: 'local',
    clientBundle: { scan: true },
  },
})
