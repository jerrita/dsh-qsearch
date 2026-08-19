import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { WebError } from '@deepseek-ai/dsh-web'
import { inferBackendFromModel, LLM_PI_AI_NS } from '../src/constants.ts'
import { resolveApiKey, resolveExplicit, resolveSearch, resolveSearchWithKey } from '../src/resolve.ts'

function fakeCtx(options: {
  llm?: unknown
  settings?: unknown
  credentials?: Record<string, string>
}): Context {
  return {
    get(name: string) {
      if (name === 'llm') return options.llm
      if (name === 'settings') {
        return {
          get(ns: unknown) {
            if (String(ns) === String(settingsNamespace(LLM_PI_AI_NS)) || ns === LLM_PI_AI_NS) return options.settings
            return options.settings
          },
        }
      }
      if (name === 'credentials') {
        if (options.credentials === undefined) return undefined
        return {
          resolve: async (ref: string) => {
            const value = options.credentials?.[ref]
            return value !== undefined && value.length > 0 ? { value, source: 'test' } : undefined
          },
        }
      }
      return undefined
    },
  } as unknown as Context
}

describe('resolveExplicit', () => {
  it('reads baseURL, model, and apiKeyEnv from the llm-pi-ai route', () => {
    const ctx = fakeCtx({
      settings: {
        providers: {
          google: {
            apiKeyEnv: 'MY_GEMINI',
            baseURL: 'https://gateway.example/v1beta/openai',
            models: [{ id: 'gemini-2.5-pro', name: 'Pro' }],
          },
        },
      },
    })
    const resolved = resolveExplicit(ctx, { backend: 'gemini', route: 'google', model: 'gemini-2.5-pro' }, 'gemini')
    expect(resolved.route).toBe('google')
    expect(resolved.model).toBe('gemini-2.5-pro')
    expect(resolved.apiKeyEnv).toBe('MY_GEMINI')
    expect(resolved.conversationBaseURL).toBe('https://gateway.example/v1beta/openai')
    expect(resolved.searchBaseURL).toBe('https://gateway.example/v1beta')
    expect(resolved.endpoint).toContain('/v1beta/models/gemini-2.5-pro:generateContent')
  })

  it('lets the qsearch model override the route catalog', () => {
    const ctx = fakeCtx({
      settings: { providers: { openai: { baseURL: 'https://api.openai.com/v1', models: [{ id: 'gpt-4.1' }] } } },
    })
    const resolved = resolveExplicit(ctx, { backend: 'openai', route: 'openai', model: 'gpt-4.1-mini' }, 'openai')
    expect(resolved.model).toBe('gpt-4.1-mini')
  })

  it('requires the route baseURL', () => {
    const ctx = fakeCtx({ settings: { providers: { openai: {} } } })
    expect(() => resolveExplicit(ctx, { backend: 'openai', route: 'openai', model: 'gpt-4.1-mini' }, 'openai'))
      .toThrow(/no baseURL/)
  })

  it('derives <ROUTE>_API_KEY from the selected route, not the protocol default', () => {
    const ctx = fakeCtx({
      settings: { providers: { 'my-xai': { baseURL: 'https://api.x.ai/v1' } } },
    })
    const resolved = resolveExplicit(ctx, { backend: 'grok', route: 'my-xai', model: 'grok-4.3' }, 'grok')
    expect(resolved.apiKeyEnv).toBe('MY_XAI_API_KEY')
  })
})

describe('inferBackendFromModel', () => {
  it('maps common vendor ids', () => {
    expect(inferBackendFromModel('gemini-2.5-flash')).toBe('gemini')
    expect(inferBackendFromModel('gemma-3-27b')).toBe('gemini')
    expect(inferBackendFromModel('gpt-4.1-mini')).toBe('openai')
    expect(inferBackendFromModel('chatgpt-4o-latest')).toBe('openai')
    expect(inferBackendFromModel('o3-mini')).toBe('openai')
    expect(inferBackendFromModel('grok-4.3')).toBe('grok')
  })

  it('leaves unrecognised names unset', () => {
    expect(inferBackendFromModel('claude-sonnet-4')).toBeUndefined()
    expect(inferBackendFromModel('')).toBeUndefined()
  })
})

describe('resolveSearch', () => {
  it('auto infers the protocol from the configured model', () => {
    const ctx = fakeCtx({
      settings: { providers: { openai: { baseURL: 'https://api.openai.com/v1' } } },
    })
    const resolved = resolveSearch(ctx, { backend: 'auto', route: 'openai', model: 'gpt-4.1-mini' })
    expect(resolved.backend).toBe('openai')
    expect(resolved.route).toBe('openai')
    expect(resolved.model).toBe('gpt-4.1-mini')
  })

  it('requires a search model', () => {
    const ctx = fakeCtx({})
    expect(() => resolveSearch(ctx, { backend: 'auto', route: 'google' })).toThrow(/search model/)
  })

  it('requires a route', () => {
    const ctx = fakeCtx({})
    expect(() => resolveSearch(ctx, { backend: 'gemini', model: 'gemini-2.5-flash' })).toThrow(/configured route/)
  })

  it('fails when auto cannot infer a protocol', () => {
    const ctx = fakeCtx({})
    expect(() => resolveSearch(ctx, { backend: 'auto', route: 'custom', model: 'claude-sonnet-4' }))
      .toThrow(/could not infer/)
  })
})

describe('resolveSearchWithKey', () => {
  it('uses the inferred backend and that route’s key', async () => {
    const ctx = fakeCtx({
      settings: { providers: { openai: { apiKeyEnv: 'OPENAI_API_KEY', baseURL: 'https://api.openai.com/v1' } } },
      credentials: { GEMINI_API_KEY: 'gemini-test', OPENAI_API_KEY: 'sk-test' },
    })
    const { resolved, apiKey } = await resolveSearchWithKey(ctx, {
      backend: 'auto',
      route: 'openai',
      model: 'gpt-4.1-mini',
    })
    expect(resolved.backend).toBe('openai')
    expect(resolved.apiKeyEnv).toBe('OPENAI_API_KEY')
    expect(apiKey).toBe('sk-test')
  })

  it('does not fall back to another vendor’s key', async () => {
    const ctx = fakeCtx({
      settings: { providers: { openai: { baseURL: 'https://api.openai.com/v1' } } },
      credentials: { GEMINI_API_KEY: 'gemini-test' },
    })
    await expect(resolveSearchWithKey(ctx, {
      backend: 'auto',
      route: 'openai',
      model: 'gpt-4.1-mini',
    })).rejects.toMatchObject({
      code: 'WEB_PROVIDER_CREDENTIAL_MISSING',
    })
  })

  it('fails loud when no key is present', async () => {
    const ctx = fakeCtx({
      settings: { providers: { openai: { baseURL: 'https://api.openai.com/v1' } } },
      credentials: {},
    })
    await expect(resolveSearchWithKey(ctx, {
      backend: 'auto',
      route: 'openai',
      model: 'gpt-4.1-mini',
    })).rejects.toMatchObject({
      code: 'WEB_PROVIDER_CREDENTIAL_MISSING',
    })
  })
})

describe('resolveApiKey', () => {
  it('returns the resolved credential', async () => {
    const key = await resolveApiKey({
      backend: 'openai',
      route: 'openai',
      model: 'gpt-4.1-mini',
      apiKeyEnv: 'OPENAI_API_KEY',
      conversationBaseURL: 'https://api.openai.com/v1',
      searchBaseURL: 'https://api.openai.com/v1',
      endpoint: 'https://api.openai.com/v1/responses',
      maxTokens: 2048,
      resolveApiKey: async () => 'from-store',
    })
    expect(key).toBe('from-store')
  })

  it('throws WEB_PROVIDER_CREDENTIAL_MISSING', async () => {
    await expect(resolveApiKey({
      backend: 'openai',
      route: 'openai',
      model: 'x',
      apiKeyEnv: 'OPENAI_API_KEY',
      conversationBaseURL: 'https://api.openai.com/v1',
      searchBaseURL: 'https://api.openai.com/v1',
      endpoint: 'https://api.openai.com/v1/responses',
      maxTokens: 2048,
      resolveApiKey: async () => undefined,
    })).rejects.toBeInstanceOf(WebError)
  })
})
