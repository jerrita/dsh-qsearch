import { WebError } from '@deepseek-ai/dsh-web'
import type { WebSearchResult } from '@deepseek-ai/dsh-web'
import { postJson } from '../http.ts'
import { dedupeSources, searchResult, type SourceDraft } from '../sources.ts'

export interface GrokSearchCall {
  endpoint: string
  apiKey: string
  model: string
  query: string
  maxTokens: number
  signal?: AbortSignal
}

/** Secret-free xAI chat-completions body with live search forced on. */
export function grokRequestBody(model: string, query: string, maxTokens: number) {
  return {
    model,
    messages: [{ role: 'user', content: `Perform a web search for the query: ${query}` }],
    search_parameters: { mode: 'on', return_citations: true },
    max_tokens: maxTokens,
  }
}

interface GrokChoice {
  message?: { content?: string | Array<{ type?: string; text?: string }> }
}

interface GrokResponse {
  citations?: Array<string | { url?: string; title?: string }>
  choices?: GrokChoice[]
}

function choiceText(response: GrokResponse): string | undefined {
  const content = response.choices?.[0]?.message?.content
  if (typeof content === 'string') return content.trim() || undefined
  if (!Array.isArray(content)) return undefined
  const text = content.map(part => (typeof part.text === 'string' ? part.text : '')).join('').trim()
  return text.length > 0 ? text : undefined
}

/** Map an xAI chat-completions payload; missing citations is an error. */
export function mapGrokResponse(response: unknown): WebSearchResult {
  const parsed = response as GrokResponse
  const drafts: SourceDraft[] = []
  for (const citation of parsed.citations ?? []) {
    if (typeof citation === 'string') {
      drafts.push({ url: citation })
      continue
    }
    if (typeof citation.url === 'string') {
      drafts.push({ url: citation.url, ...(citation.title ? { title: citation.title } : {}) })
    }
  }
  const sources = dedupeSources(drafts)
  if (sources.length === 0) {
    throw new WebError(
      'Grok returned no citations; the request may not have triggered native live search',
      'WEB_PROVIDER_ERROR',
    )
  }
  return searchResult(sources, choiceText(parsed))
}

export async function searchGrok(call: GrokSearchCall): Promise<WebSearchResult> {
  const body = grokRequestBody(call.model, call.query, call.maxTokens)
  const response = await postJson({
    url: call.endpoint,
    headers: { authorization: `Bearer ${call.apiKey}` },
    body,
    signal: call.signal,
    label: 'Grok search',
  })
  return mapGrokResponse(response)
}
