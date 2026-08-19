/** Stable id registered with `ctx.web`. */
export const QSEARCH_PROVIDER_ID = 'qsearch'

/** Settings namespace and plugin name. */
export const QSEARCH_SETTINGS_NS = 'qsearch'

/** Native search protocols this plugin can speak. */
export type NativeBackend = 'gemini' | 'openai' | 'grok'

/** User-facing backend choice, including auto-detect. */
export type SearchBackend = 'auto' | NativeBackend

/**
 * Infer the native search protocol from a model id.
 * Used when `backend` is `auto`. Unrecognised names return undefined.
 */
export function inferBackendFromModel(model: string): NativeBackend | undefined {
  const id = model.trim().toLowerCase()
  if (id.length === 0) return undefined
  if (id.includes('gemini') || id.includes('gemma')) return 'gemini'
  if (id.includes('grok')) return 'grok'
  if (id.includes('gpt') || id.includes('chatgpt') || /(?:^|[^a-z0-9])o[1-4](?:[-.]|$)/u.test(id)) {
    return 'openai'
  }
  return undefined
}

/** Same `<ROUTE>_API_KEY` derivation the Models page uses when a profile has no `apiKeyEnv`. */
export function deriveRouteApiKeyEnv(route: string): string {
  return `${route.trim().toUpperCase().replace(/[^A-Z0-9]+/gu, '_')}_API_KEY`
}

export const DEFAULT_MAX_TOKENS = 2048

export const USER_AGENT = 'dsh-qsearch/0.1.0'

export const LLM_PI_AI_NS = 'llm-pi-ai'
