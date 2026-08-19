/**
 * Register a Gemini / OpenAI / Grok native search provider in `ctx.web`.
 * Conversation baseURLs (often OpenAI-compatible `/v1`) are rewritten to the
 * native search prefix before dispatch.
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { mountCatalogRoute } from './catalog.ts'
import { DEFAULT_MAX_TOKENS, QSEARCH_PROVIDER_ID, QSEARCH_SETTINGS_NS } from './constants.ts'
import { QSearchProvider } from './provider.ts'
import type { QSearchConfig } from './resolve.ts'
import { takeOverSearch } from './takeover.ts'

export { deriveRouteApiKeyEnv, inferBackendFromModel, QSEARCH_PROVIDER_ID, QSEARCH_SETTINGS_NS } from './constants.ts'
export { previewSearchUrl } from './catalog.ts'
export { rewriteSearchBaseURL, searchEndpoint } from './rewrite.ts'
export { QSearchProvider } from './provider.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = QSEARCH_SETTINGS_NS

/** The web seam this provider registers into. */
export const inject = ['web']

export interface Config extends QSearchConfig {}

export const Config: z<Config> = z.object({
  backend: z.union(['auto', 'gemini', 'openai', 'grok']).default('auto'),
  route: z.string(),
  model: z.string(),
  maxTokens: z.number().step(1).min(1).default(DEFAULT_MAX_TOKENS),
})

export const QSEARCH_SETTINGS_NAMESPACE = settingsNamespace(QSEARCH_SETTINGS_NS)

/** Register the qsearch provider and the settings-card catalog route. */
export function apply(ctx: Context, config: Config): void {
  let current = (): QSearchConfig => config
  installSettingsSection(ctx, QSEARCH_SETTINGS_NAMESPACE, Config, config, {
    setSource: source => {
      current = source
    },
    onChange: () => {},
  })
  const provider = new QSearchProvider(ctx, () => current())
  ctx.web.registerSearchProvider(provider)
  takeOverSearch(ctx, provider)
  mountCatalogRoute(ctx)
}
