import type { Context } from '@deepseek-ai/cordis'
import type { WebSearchProvider, WebSearchRequest, WebSearchResult } from '@deepseek-ai/dsh-web'

/**
 * Route `ctx.web.search` through this provider for the calling fiber only.
 * The official `web.searchProvider` pin is left untouched, so unloading the
 * plugin restores DeepSeek (or whatever was composed) with no leftover
 * composition override.
 */
export function takeOverSearch(ctx: Context, provider: WebSearchProvider): void {
  const web = ctx.web
  const original = web.search.bind(web)
  ctx.effect(() => {
    web.search = (request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> =>
      provider.search(request, signal).then(result => capSources(result, request.maxResults))
    return () => {
      web.search = original
    }
  }, 'qsearch: take over web.search')
}

/** Same cap the web seam applies when it owns the call. */
export function capSources(result: WebSearchResult, maxResults?: number): WebSearchResult {
  if (maxResults === undefined || result.sources.length <= maxResults) return result
  return {
    ...result,
    sources: result.sources.slice(0, maxResults),
    truncated: true,
  }
}
