import { describe, expect, it } from 'vitest'
import { WebError } from '@deepseek-ai/dsh-web'
import { mapGeminiResponse } from '../src/backends/gemini.ts'
import { mapGrokResponse } from '../src/backends/grok.ts'
import { mapOpenAIResponse } from '../src/backends/openai.ts'

describe('mapGeminiResponse', () => {
  it('maps grounding chunks and support excerpts', () => {
    const result = mapGeminiResponse({
      candidates: [{
        content: { parts: [{ text: 'Answer' }] },
        groundingMetadata: {
          groundingChunks: [
            { web: { uri: 'https://a.example/', title: 'A' } },
            { web: { uri: 'https://a.example/', title: 'dup' } },
            { web: { uri: 'https://b.example/', title: 'B' } },
          ],
          groundingSupports: [{ segment: { text: 'snippet A' }, groundingChunkIndices: [0] }],
        },
      }],
    })
    expect(result.content).toBe('Answer')
    expect(result.sources).toEqual([
      { url: 'https://a.example/', title: 'A', snippet: 'snippet A' },
      { url: 'https://b.example/', title: 'B' },
    ])
    expect(result.truncated).toBe(false)
  })

  it('fails without grounding chunks', () => {
    expect(() => mapGeminiResponse({ candidates: [{ content: { parts: [{ text: 'no search' }] } }] }))
      .toThrow(WebError)
  })
})

describe('mapOpenAIResponse', () => {
  it('joins web_search_call sources and url citations', () => {
    const result = mapOpenAIResponse({
      output_text: 'Hello',
      output: [
        { type: 'web_search_call', action: { sources: [{ url: 'https://a.example/', title: 'A' }] } },
        {
          type: 'message',
          content: [{
            type: 'output_text',
            text: 'See here please',
            annotations: [{ type: 'url_citation', url: 'https://b.example/', title: 'B', start_index: 4, end_index: 8 }],
          }],
        },
      ],
    })
    expect(result.content).toBe('Hello')
    expect(result.sources).toEqual([
      { url: 'https://a.example/', title: 'A' },
      { url: 'https://b.example/', title: 'B', snippet: 'here' },
    ])
  })

  it('fails without sources', () => {
    expect(() => mapOpenAIResponse({ output: [{ type: 'message', content: [{ text: 'plain' }] }] }))
      .toThrow(/web_search sources/)
  })
})

describe('mapGrokResponse', () => {
  it('maps string and object citations', () => {
    const result = mapGrokResponse({
      citations: ['https://a.example/', { url: 'https://b.example/', title: 'B' }],
      choices: [{ message: { content: 'Grok answer' } }],
    })
    expect(result.content).toBe('Grok answer')
    expect(result.sources).toEqual([
      { url: 'https://a.example/' },
      { url: 'https://b.example/', title: 'B' },
    ])
  })

  it('fails without citations', () => {
    expect(() => mapGrokResponse({ choices: [{ message: { content: 'no cites' } }] }))
      .toThrow(/no citations/)
  })
})
