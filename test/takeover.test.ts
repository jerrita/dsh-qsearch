import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { WebSearchProvider, WebSearchResult } from '@deepseek-ai/dsh-web'
import { capSources, takeOverSearch } from '../src/takeover.ts'

describe('capSources', () => {
  it('flags truncation when the provider over-returns', () => {
    const result: WebSearchResult = {
      sources: [
        { url: 'https://a.example/' },
        { url: 'https://b.example/' },
      ],
      truncated: false,
    }
    expect(capSources(result, 1)).toEqual({
      sources: [{ url: 'https://a.example/' }],
      truncated: true,
    })
  })
})

describe('takeOverSearch', () => {
  it('routes search through the plugin and restores the original on dispose', async () => {
    const official: WebSearchResult = { sources: [{ url: 'https://official.example/' }], truncated: false }
    const qsearch: WebSearchResult = { sources: [{ url: 'https://qsearch.example/' }], truncated: false }
    const web = {
      search: async () => official,
    }
    let disposer: (() => void) | undefined
    const ctx = {
      web,
      effect(factory: () => () => void) {
        disposer = factory()
      },
    } as unknown as Context
    const provider: WebSearchProvider = {
      id: 'qsearch',
      available: () => true,
      search: async () => qsearch,
    }

    takeOverSearch(ctx, provider)
    await expect(web.search({ query: 'q' })).resolves.toEqual(qsearch)

    disposer?.()
    await expect(web.search({ query: 'q' })).resolves.toEqual(official)
  })

  it('does not mutate a composed searchProvider pin', () => {
    const web = { search: vi.fn(), searchProviderId: 'deepseek-official' }
    const ctx = {
      web,
      effect(factory: () => () => void) {
        factory()
      },
    } as unknown as Context
    takeOverSearch(ctx, {
      id: 'qsearch',
      available: () => true,
      search: async () => ({ sources: [], truncated: false }),
    })
    expect(web.searchProviderId).toBe('deepseek-official')
  })
})
