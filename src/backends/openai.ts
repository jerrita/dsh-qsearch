import { WebError } from '@deepseek-ai/dsh-web'
import type { WebSearchResult } from '@deepseek-ai/dsh-web'
import { postJson } from '../http.ts'
import { dedupeSources, searchResult, type SourceDraft } from '../sources.ts'

export interface OpenAISearchCall {
  endpoint: string
  apiKey: string
  model: string
  query: string
  maxTokens: number
  signal?: AbortSignal
}

/** Secret-free OpenAI Responses body with native web_search. */
export function openaiRequestBody(model: string, query: string, maxTokens: number) {
  return {
    model,
    input: `Perform a web search for the query: ${query}`,
    tools: [{ type: 'web_search' }],
    include: ['web_search_call.action.sources'],
    max_output_tokens: maxTokens,
  }
}

interface OpenAISource {
  url?: string
  title?: string
}

interface OpenAIAnnotation {
  type?: string
  url?: string
  title?: string
  start_index?: number
  end_index?: number
}

interface OpenAIOutputItem {
  type?: string
  action?: { sources?: OpenAISource[] }
  content?: Array<{
    type?: string
    text?: string
    annotations?: OpenAIAnnotation[]
  }>
}

interface OpenAIResponse {
  output?: OpenAIOutputItem[]
  output_text?: string
}

function collectText(response: OpenAIResponse): string | undefined {
  if (typeof response.output_text === 'string' && response.output_text.trim().length > 0) {
    return response.output_text.trim()
  }
  const parts: string[] = []
  for (const item of response.output ?? []) {
    for (const block of item.content ?? []) {
      if (typeof block.text === 'string' && block.text.length > 0) parts.push(block.text)
    }
  }
  const joined = parts.join('').trim()
  return joined.length > 0 ? joined : undefined
}

/** Map an OpenAI Responses payload; missing search sources is an error. */
export function mapOpenAIResponse(response: unknown): WebSearchResult {
  const parsed = response as OpenAIResponse
  const drafts: SourceDraft[] = []
  for (const item of parsed.output ?? []) {
    if (item.type === 'web_search_call') {
      for (const source of item.action?.sources ?? []) {
        if (typeof source.url === 'string') drafts.push({ url: source.url, ...(source.title ? { title: source.title } : {}) })
      }
    }
    for (const block of item.content ?? []) {
      for (const annotation of block.annotations ?? []) {
        if (annotation.type === 'url_citation' && typeof annotation.url === 'string') {
          const snippet = excerptAround(block.text, annotation.start_index, annotation.end_index)
          drafts.push({
            url: annotation.url,
            ...(annotation.title ? { title: annotation.title } : {}),
            ...(snippet !== undefined ? { snippet } : {}),
          })
        }
      }
    }
  }
  const sources = dedupeSources(drafts)
  if (sources.length === 0) {
    throw new WebError(
      'OpenAI returned no web_search sources; the request may not have triggered native web search (Responses API required)',
      'WEB_PROVIDER_ERROR',
    )
  }
  return searchResult(sources, collectText(parsed))
}

function excerptAround(text: string | undefined, start?: number, end?: number): string | undefined {
  if (text === undefined || start === undefined || end === undefined) return undefined
  if (start < 0 || end <= start || end > text.length) return undefined
  const excerpt = text.slice(start, end).trim()
  return excerpt.length > 0 ? excerpt : undefined
}

export async function searchOpenAI(call: OpenAISearchCall): Promise<WebSearchResult> {
  const body = openaiRequestBody(call.model, call.query, call.maxTokens)
  const response = await postJson({
    url: call.endpoint,
    headers: { authorization: `Bearer ${call.apiKey}` },
    body,
    signal: call.signal,
    label: 'OpenAI search',
  })
  return mapOpenAIResponse(response)
}
