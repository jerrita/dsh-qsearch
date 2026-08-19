import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { WebError } from '@deepseek-ai/dsh-web'
import {
  DEFAULT_MAX_TOKENS,
  deriveRouteApiKeyEnv,
  inferBackendFromModel,
  LLM_PI_AI_NS,
  type NativeBackend,
  type SearchBackend,
} from './constants.ts'
import { abortable, throwIfSearchAborted } from './http.ts'
import { rewriteSearchBaseURL, searchEndpoint } from './rewrite.ts'

/** Flat settings section the plugin card writes. */
export interface QSearchConfig {
  backend?: SearchBackend
  route?: string
  model?: string
  maxTokens?: number
}

/** One llm-pi-ai provider profile, as stored in settings. */
export interface LlmRouteProfile {
  apiKeyEnv?: string
  displayName?: string
  baseURL?: string
  models?: Array<{ id?: string; name?: string }>
}

export interface LlmPiAiSection {
  providers?: Record<string, LlmRouteProfile | undefined>
}

/** Fully resolved native search dispatch. */
export interface ResolvedSearch {
  backend: NativeBackend
  route: string
  model: string
  apiKeyEnv: string
  conversationBaseURL: string
  searchBaseURL: string
  endpoint: string
  maxTokens: number
  resolveApiKey: () => Promise<string | undefined>
}

/** Read the llm-pi-ai section when that namespace is registered. */
export function readLlmPiAi(ctx: Context): LlmPiAiSection {
  const settings = ctx.get('settings')
  if (settings === undefined) return {}
  const value = settings.get(settingsNamespace(LLM_PI_AI_NS))
  if (value === null || typeof value !== 'object') return {}
  return value as LlmPiAiSection
}

function profileOf(section: LlmPiAiSection, route: string): LlmRouteProfile | undefined {
  return section.providers?.[route]
}

function requiredRoute(config: QSearchConfig): string {
  const route = config.route?.trim()
  if (route === undefined || route.length === 0) {
    throw new WebError('qsearch requires a configured route', 'WEB_PROVIDER_ERROR')
  }
  return route
}

function requiredModel(config: QSearchConfig): string {
  const model = config.model?.trim()
  if (model === undefined || model.length === 0) {
    throw new WebError('qsearch requires a search model', 'WEB_PROVIDER_ERROR')
  }
  return model
}

function isNativeBackend(value: string | undefined): value is NativeBackend {
  return value === 'gemini' || value === 'openai' || value === 'grok'
}

function isPositiveInteger(value: number | undefined): value is number {
  return value !== undefined && Number.isInteger(value) && value > 0
}

function keyResolver(ctx: Context, apiKeyEnv: string): () => Promise<string | undefined> {
  const ref = credentialRef(apiKeyEnv)
  return async () => {
    const credentials = ctx.get('credentials')
    if (credentials !== undefined) return (await credentials.resolve(ref))?.value
    try {
      const ambient = launchEnvironmentOf(ctx).get(ref)
      return ambient !== undefined && ambient.value.length > 0 ? ambient.value : undefined
    } catch {
      const value = process.env[apiKeyEnv]
      return value !== undefined && value.length > 0 ? value : undefined
    }
  }
}

/** Resolve one explicit native backend against the current settings snapshot. */
export function resolveExplicit(ctx: Context, config: QSearchConfig, backend: NativeBackend): ResolvedSearch {
  const llm = readLlmPiAi(ctx)
  const route = requiredRoute(config)
  const model = requiredModel(config)
  const profile = profileOf(llm, route)
  const conversationBaseURL = profile?.baseURL?.trim()
  if (conversationBaseURL === undefined || conversationBaseURL.length === 0) {
    throw new WebError(`qsearch route "${route}" has no baseURL; set it on the Models page`, 'WEB_PROVIDER_ERROR')
  }
  const searchBaseURL = rewriteSearchBaseURL(backend, conversationBaseURL)
  const apiKeyEnv = profile?.apiKeyEnv?.trim() || deriveRouteApiKeyEnv(route)
  const maxTokens = isPositiveInteger(config.maxTokens) ? config.maxTokens : DEFAULT_MAX_TOKENS
  return {
    backend,
    route,
    model,
    apiKeyEnv,
    conversationBaseURL,
    searchBaseURL,
    endpoint: searchEndpoint(backend, searchBaseURL, model),
    maxTokens,
    resolveApiKey: keyResolver(ctx, apiKeyEnv),
  }
}

/** Local availability: route, model, and rewritten URLs are present. Does not touch credentials. */
export function isResolvedAvailable(resolved: ResolvedSearch): boolean {
  return (
    URL.canParse(resolved.searchBaseURL)
    && URL.canParse(resolved.endpoint)
    && isPositiveInteger(resolved.maxTokens)
    && resolved.model.length > 0
    && resolved.route.length > 0
  )
}

/** Snapshot the next search. `auto` infers the protocol from the configured model id. */
export function resolveSearch(ctx: Context, config: QSearchConfig): ResolvedSearch {
  const backend = config.backend ?? 'auto'
  if (isNativeBackend(backend)) return resolveExplicit(ctx, config, backend)
  const model = requiredModel(config)
  const inferred = inferBackendFromModel(model)
  if (inferred === undefined) {
    throw new WebError(
      `qsearch auto could not infer a protocol from model "${model}"; set Search protocol explicitly`,
      'WEB_PROVIDER_ERROR',
    )
  }
  return resolveExplicit(ctx, config, inferred)
}

/** Resolve the API key for one already-snapshotted search. */
export async function resolveApiKey(resolved: ResolvedSearch, signal?: AbortSignal): Promise<string> {
  throwIfSearchAborted(signal)
  let value: string | undefined
  try {
    value = await abortable(resolved.resolveApiKey(), signal)
  } catch (error) {
    if (signal?.aborted === true) throw error
    throw new WebError(`qsearch credential resolution failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
  }
  if (value !== undefined && value.length > 0) return value
  throw new WebError(
    `qsearch has no API key for "${resolved.apiKeyEnv}" (backend ${resolved.backend}, route ${resolved.route}); store it through the Models page or export it`,
    'WEB_PROVIDER_CREDENTIAL_MISSING',
  )
}

/** Resolve the configured route/model (and inferred protocol) then load its key. */
export async function resolveSearchWithKey(
  ctx: Context,
  config: QSearchConfig,
  signal?: AbortSignal,
): Promise<{ resolved: ResolvedSearch; apiKey: string }> {
  const resolved = resolveSearch(ctx, config)
  return { resolved, apiKey: await resolveApiKey(resolved, signal) }
}
