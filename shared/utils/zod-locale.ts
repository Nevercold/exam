import { z } from 'zod'

/**
 * German default error messages (UI language), e.g. for missing fields in imports.
 * Must be called explicitly at startup (server + client plugin, test setup):
 * a top-level side effect in a shared module gets tree-shaken by the Nitro bundler.
 */
export function setGermanZodLocale() {
  z.config(z.locales.de())
}
