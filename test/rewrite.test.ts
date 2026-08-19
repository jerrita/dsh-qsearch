import { describe, expect, it } from 'vitest'
import { rewriteGeminiPath, rewriteSearchBaseURL, searchEndpoint } from '../src/rewrite.ts'

describe('rewriteGeminiPath', () => {
  it('maps OpenAI-compat suffixes onto /v1beta', () => {
    expect(rewriteGeminiPath('/v1beta/openai/v1')).toBe('/v1beta')
    expect(rewriteGeminiPath('/v1beta/openai')).toBe('/v1beta')
    expect(rewriteGeminiPath('/openai/v1')).toBe('/v1beta')
    expect(rewriteGeminiPath('/openai')).toBe('/v1beta')
    expect(rewriteGeminiPath('/v1')).toBe('/v1beta')
    expect(rewriteGeminiPath('/')).toBe('/v1beta')
    expect(rewriteGeminiPath('')).toBe('/v1beta')
  })

  it('keeps an already-native v1beta prefix', () => {
    expect(rewriteGeminiPath('/v1beta')).toBe('/v1beta')
    expect(rewriteGeminiPath('/proxy/v1beta')).toBe('/proxy/v1beta')
  })

  it('appends v1beta when the path has no version', () => {
    expect(rewriteGeminiPath('/gemini')).toBe('/gemini/v1beta')
  })
})

describe('rewriteSearchBaseURL', () => {
  it('rewrites Gemini conversation URLs', () => {
    expect(rewriteSearchBaseURL('gemini', 'https://generativelanguage.googleapis.com/v1beta/openai/'))
      .toBe('https://generativelanguage.googleapis.com/v1beta')
    expect(rewriteSearchBaseURL('gemini', 'https://gateway.example/v1'))
      .toBe('https://gateway.example/v1beta')
  })

  it('rejects a missing baseURL', () => {
    expect(() => rewriteSearchBaseURL('gemini', '')).toThrow(/requires the route baseURL/)
  })

  it('keeps OpenAI and Grok /v1 prefixes', () => {
    expect(rewriteSearchBaseURL('openai', 'https://api.openai.com/v1/'))
      .toBe('https://api.openai.com/v1')
    expect(rewriteSearchBaseURL('grok', 'https://api.x.ai/v1'))
      .toBe('https://api.x.ai/v1')
  })

  it('rejects an unparseable URL', () => {
    expect(() => rewriteSearchBaseURL('openai', 'not a url')).toThrow(/unparseable/)
  })
})

describe('searchEndpoint', () => {
  it('appends the native verb', () => {
    expect(searchEndpoint('gemini', 'https://generativelanguage.googleapis.com/v1beta', 'gemini-2.5-flash'))
      .toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent')
    expect(searchEndpoint('openai', 'https://api.openai.com/v1', 'gpt-4.1-mini'))
      .toBe('https://api.openai.com/v1/responses')
    expect(searchEndpoint('grok', 'https://api.x.ai/v1', 'grok-4.3'))
      .toBe('https://api.x.ai/v1/chat/completions')
  })
})
