import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { buildCatalog, previewSearchUrl } from '../src/catalog.ts'
import { LLM_PI_AI_NS } from '../src/constants.ts'

describe('previewSearchUrl', () => {
  it('rewrites a Gemini OpenAI-compat base onto generateContent', () => {
    expect(previewSearchUrl('gemini', 'https://gateway.example/v1', 'gemini-2.5-flash'))
      .toBe('https://gateway.example/v1beta/models/gemini-2.5-flash:generateContent')
  })
})

describe('buildCatalog', () => {
  it('lists live routes without leaking secrets', async () => {
    const ctx = {
      get(name: string) {
        if (name === 'llm') {
          return {
            listProviders: () => [{ id: 'google', name: 'Google' }],
            listModels: async () => [{ id: 'gemini-2.5-flash', name: 'Flash' }],
          }
        }
        if (name === 'settings') {
          return {
            get(ns: unknown) {
              if (String(ns) === String(settingsNamespace(LLM_PI_AI_NS))) {
                return {
                  providers: {
                    google: { apiKeyEnv: 'GEMINI_API_KEY', baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai' },
                  },
                }
              }
              return undefined
            },
          }
        }
        if (name === 'credentials') {
          return {
            describe: async () => ({ configured: true, writable: false }),
          }
        }
        return undefined
      },
    } as unknown as Context

    const catalog = await buildCatalog(ctx)
    expect(catalog.routes).toEqual([{
      provider: 'google',
      displayName: 'Google',
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
      models: [{ id: 'gemini-2.5-flash', name: 'Flash' }],
      hasCredential: true,
    }])
    expect(JSON.stringify(catalog)).not.toMatch(/sk-|AIza|secret/i)
  })
})
