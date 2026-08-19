import type { WebSearchResult, WebSearchSource } from '@deepseek-ai/dsh-web'

/** One citeable source before URL dedupe. */
export type SourceDraft = {
  url: string
  title?: string
  snippet?: string
  publishedAt?: string
}

/** Deduplicate drafts by URL; first occurrence wins. */
export function dedupeSources(drafts: readonly SourceDraft[]): WebSearchSource[] {
  const seen = new Set<string>()
  const sources: WebSearchSource[] = []
  for (const draft of drafts) {
    const url = draft.url.trim()
    if (url.length === 0 || seen.has(url)) continue
    seen.add(url)
    sources.push({
      url,
      ...(draft.title !== undefined && draft.title.length > 0 ? { title: draft.title } : {}),
      ...(draft.snippet !== undefined && draft.snippet.length > 0 ? { snippet: draft.snippet } : {}),
      ...(draft.publishedAt !== undefined && draft.publishedAt.length > 0 ? { publishedAt: draft.publishedAt } : {}),
    })
  }
  return sources
}

/** Build a seam result; the web service owns maxResults truncation. */
export function searchResult(sources: readonly WebSearchSource[], content?: string): WebSearchResult {
  return {
    sources,
    truncated: false,
    ...(content !== undefined && content.trim().length > 0 ? { content: content.trim() } : {}),
  }
}
