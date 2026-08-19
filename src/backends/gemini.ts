import { WebError } from '@deepseek-ai/dsh-web'
import type { WebSearchResult } from '@deepseek-ai/dsh-web'
import { postJson } from '../http.ts'
import { dedupeSources, searchResult, type SourceDraft } from '../sources.ts'

export interface GeminiSearchCall {
  endpoint: string
  apiKey: string
  query: string
  maxTokens: number
  signal?: AbortSignal
}

/** Secret-free Gemini generateContent body. */
export function geminiRequestBody(query: string, maxTokens: number) {
  return {
    contents: [{ role: 'user', parts: [{ text: `Perform a web search for the query: ${query}` }] }],
    generationConfig: { maxOutputTokens: maxTokens },
    tools: [{ google_search: {} }],
  }
}

interface GeminiWeb {
  uri?: string
  title?: string
}

interface GeminiChunk {
  web?: GeminiWeb
}

interface GeminiSupport {
  segment?: { text?: string }
  groundingChunkIndices?: number[]
}

interface GeminiCandidate {
  content?: { parts?: Array<{ text?: string }> }
  groundingMetadata?: {
    groundingChunks?: GeminiChunk[]
    groundingSupports?: GeminiSupport[]
    searchEntryPoint?: { renderedContent?: string }
  }
}

interface GeminiResponse {
  candidates?: GeminiCandidate[]
}

function candidateText(candidate: GeminiCandidate | undefined): string | undefined {
  const parts = candidate?.content?.parts ?? []
  const text = parts.map(part => part.text ?? '').join('').trim()
  return text.length > 0 ? text : undefined
}

/** Map a Gemini generateContent response; absence of grounding chunks is an error. */
export function mapGeminiResponse(response: unknown): WebSearchResult {
  const parsed = response as GeminiResponse
  const candidate = parsed.candidates?.[0]
  const chunks = candidate?.groundingMetadata?.groundingChunks ?? []
  const drafts: SourceDraft[] = []
  const snippets = new Map<number, string>()
  for (const support of candidate?.groundingMetadata?.groundingSupports ?? []) {
    const excerpt = support.segment?.text?.trim()
    if (excerpt === undefined || excerpt.length === 0) continue
    for (const index of support.groundingChunkIndices ?? []) {
      if (!snippets.has(index)) snippets.set(index, excerpt)
    }
  }
  chunks.forEach((chunk, index) => {
    const url = chunk.web?.uri?.trim()
    if (url === undefined || url.length === 0) return
    drafts.push({
      url,
      ...(chunk.web?.title ? { title: chunk.web.title } : {}),
      ...(snippets.get(index) !== undefined ? { snippet: snippets.get(index) } : {}),
    })
  })
  const sources = dedupeSources(drafts)
  if (sources.length === 0) {
    throw new WebError(
      'Gemini returned no groundingChunks; the request may not have triggered native Google Search',
      'WEB_PROVIDER_ERROR',
    )
  }
  return searchResult(sources, candidateText(candidate))
}

export async function searchGemini(call: GeminiSearchCall): Promise<WebSearchResult> {
  const body = geminiRequestBody(call.query, call.maxTokens)
  const response = await postJson({
    url: call.endpoint,
    headers: { 'x-goog-api-key': call.apiKey },
    body,
    signal: call.signal,
    label: 'Gemini search',
  })
  return mapGeminiResponse(response)
}
