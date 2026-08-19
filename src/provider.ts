import type { Context } from '@deepseek-ai/cordis'
import type { WebSearchProvider, WebSearchRequest, WebSearchResult } from '@deepseek-ai/dsh-web'
import { WebError } from '@deepseek-ai/dsh-web'
import { searchGemini, geminiRequestBody } from './backends/gemini.ts'
import { searchGrok, grokRequestBody } from './backends/grok.ts'
import { searchOpenAI, openaiRequestBody } from './backends/openai.ts'
import { QSEARCH_PROVIDER_ID } from './constants.ts'
import { isAbortError, searchAborted, throwIfSearchAborted } from './http.ts'
import { isResolvedAvailable, resolveSearch, resolveSearchWithKey, type QSearchConfig } from './resolve.ts'

/** Secret-free auxiliary request recorded before dispatch. */
export interface QSearchLlmRequest {
  readonly backend: string
  readonly route: string
  readonly model: string
  readonly endpoint: string
  readonly body: unknown
}

interface SessionLike {
  append(name: 'web/qsearch-llm-request', payload: QSearchLlmRequest): void
}

function requestBody(resolved: { backend: string; model: string; maxTokens: number }, query: string): unknown {
  if (resolved.backend === 'gemini') return geminiRequestBody(query, resolved.maxTokens)
  if (resolved.backend === 'openai') return openaiRequestBody(resolved.model, query, resolved.maxTokens)
  return grokRequestBody(resolved.model, query, resolved.maxTokens)
}

/** Native Gemini / OpenAI / Grok search; HTTP redirects fail as WEB_PROVIDER_ERROR. */
export class QSearchProvider implements WebSearchProvider {
  readonly id = QSEARCH_PROVIDER_ID

  constructor(
    private readonly ctx: Context,
    private readonly resolveConfig: () => QSearchConfig,
  ) {}

  available(): boolean {
    try {
      return isResolvedAvailable(resolveSearch(this.ctx, this.resolveConfig()))
    } catch {
      return false
    }
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const config = this.resolveConfig()
    const { resolved, apiKey } = await resolveSearchWithKey(this.ctx, config, signal)
    throwIfSearchAborted(signal)
    const body = requestBody(resolved, request.query)
    const session = this.ctx.get('agents')?.currentInitiator()?.session as SessionLike | undefined
    session?.append('web/qsearch-llm-request', {
      backend: resolved.backend,
      route: resolved.route,
      model: resolved.model,
      endpoint: resolved.endpoint,
      body,
    })
    throwIfSearchAborted(signal)
    try {
      if (resolved.backend === 'gemini') {
        return await searchGemini({
          endpoint: resolved.endpoint,
          apiKey,
          query: request.query,
          maxTokens: resolved.maxTokens,
          signal,
        })
      }
      if (resolved.backend === 'openai') {
        return await searchOpenAI({
          endpoint: resolved.endpoint,
          apiKey,
          model: resolved.model,
          query: request.query,
          maxTokens: resolved.maxTokens,
          signal,
        })
      }
      return await searchGrok({
        endpoint: resolved.endpoint,
        apiKey,
        model: resolved.model,
        query: request.query,
        maxTokens: resolved.maxTokens,
        signal,
      })
    } catch (error) {
      if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error)
      if (error instanceof WebError) throw error
      throw new WebError(`qsearch failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
  }
}
