import type { NativeBackend } from './constants.ts'

/** Drop trailing slashes from a URL or path. */
export function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/u, '')
}

/**
 * Rewrite a conversation `baseURL` (often OpenAI-compatible `/v1`) into the
 * native search prefix for the selected protocol.
 *
 * Gemini's chat adapters commonly expose `/v1` or `/v1beta/openai`; native
 * grounding lives on `/v1beta` (`:generateContent`). OpenAI and Grok keep
 * their conversation `/v1` prefix.
 */
export function rewriteSearchBaseURL(backend: NativeBackend, configuredBaseURL: string): string {
  const input = configuredBaseURL.trim()
  if (input.length === 0) throw new Error('qsearch requires the route baseURL')
  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new Error(`unparseable baseURL: ${input}`)
  }
  const path = stripTrailingSlashes(url.pathname)
  url.pathname = backend === 'gemini' ? rewriteGeminiPath(path) : (path === '' ? '/' : path)
  url.search = ''
  url.hash = ''
  const rewritten = stripTrailingSlashes(url.toString())
  if (rewritten.length === 0 || !URL.canParse(rewritten)) {
    throw new Error(`unusable rewritten baseURL from ${input}`)
  }
  return rewritten
}

/** Gemini generateContent lives under `/v1beta`, never the OpenAI-compat suffix. */
export function rewriteGeminiPath(path: string): string {
  if (path === '' || path === '/') return '/v1beta'
  if (/\/v1beta\/openai(?:\/v1)?$/u.test(path)) return path.replace(/\/openai(?:\/v1)?$/u, '')
  if (/\/openai(?:\/v1)?$/u.test(path)) return path.replace(/\/openai(?:\/v1)?$/u, '/v1beta')
  if (/(?:^|\/)v1$/u.test(path) && !path.includes('v1beta')) {
    return path.replace(/(?:^|\/)v1$/u, match => (match.startsWith('/') ? '/v1beta' : 'v1beta'))
  }
  if (path.includes('v1beta')) return path
  return `${path}/v1beta`
}

/** Fully resolved native search endpoint for one backend. */
export function searchEndpoint(backend: NativeBackend, searchBaseURL: string, model: string): string {
  const base = stripTrailingSlashes(searchBaseURL)
  if (backend === 'gemini') return `${base}/models/${encodeURIComponent(model)}:generateContent`
  if (backend === 'openai') return `${base}/responses`
  return `${base}/chat/completions`
}
