import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { deriveRouteApiKeyEnv, type NativeBackend } from './constants.ts'
import { readLlmPiAi, type LlmRouteProfile } from './resolve.ts'
import { rewriteSearchBaseURL, searchEndpoint } from './rewrite.ts'

/** One configured LLM route as shown on the settings card. */
export interface CatalogRoute {
  provider: string
  displayName: string
  baseURL?: string
  models: Array<{ id: string; name: string }>
  hasCredential: boolean
}

export interface CatalogResponse {
  routes: CatalogRoute[]
}

async function hasCredential(ctx: Context, apiKeyEnv: string): Promise<boolean> {
  const credentials = ctx.get('credentials')
  if (credentials === undefined) {
    const value = process.env[apiKeyEnv]
    return value !== undefined && value.length > 0
  }
  try {
    return (await credentials.describe(credentialRef(apiKeyEnv))).configured
  } catch {
    return false
  }
}

function modelsFrom(
  listed: Array<{ id: string; name: string }>,
  profile: LlmRouteProfile | undefined,
): Array<{ id: string; name: string }> {
  const fromProfile = (profile?.models ?? [])
    .filter((entry): entry is { id: string; name?: string } => typeof entry.id === 'string' && entry.id.length > 0)
    .map(entry => ({ id: entry.id, name: entry.name?.trim() || entry.id }))
  if (fromProfile.length > 0) return fromProfile
  return listed
}

/** Assemble the settings-card catalog from live LLM routes and llm-pi-ai. */
export async function buildCatalog(ctx: Context): Promise<CatalogResponse> {
  const llm = ctx.get('llm')
  const section = readLlmPiAi(ctx)
  const providers = llm?.listProviders() ?? []
  const seen = new Set<string>()
  const routes: CatalogRoute[] = []

  const push = async (
    provider: string,
    displayName: string,
    listed: Array<{ id: string; name: string }>,
  ): Promise<void> => {
    if (seen.has(provider)) return
    seen.add(provider)
    const profile = section.providers?.[provider]
    const models = modelsFrom(listed, profile)
    const apiKeyEnv = profile?.apiKeyEnv?.trim() || deriveRouteApiKeyEnv(provider)
    routes.push({
      provider,
      displayName: profile?.displayName?.trim() || displayName,
      ...(profile?.baseURL?.trim() ? { baseURL: profile.baseURL.trim() } : {}),
      models,
      hasCredential: await hasCredential(ctx, apiKeyEnv),
    })
  }

  if (llm !== undefined) {
    for (const provider of providers) {
      let listed: Array<{ id: string; name: string }> = []
      try {
        listed = (await llm.listModels(provider.id)).map(model => ({ id: model.id, name: model.name || model.id }))
      } catch {
        listed = []
      }
      await push(provider.id, provider.name || provider.id, listed)
    }
  }

  for (const [provider, profile] of Object.entries(section.providers ?? {})) {
    if (profile === undefined) continue
    await push(provider, profile.displayName?.trim() || provider, [])
  }

  return { routes }
}

/** Preview the native search URL for one catalog row (used by tests and the card). */
export function previewSearchUrl(backend: NativeBackend, baseURL: string, model: string): string {
  const searchBase = rewriteSearchBaseURL(backend, baseURL)
  return searchEndpoint(backend, searchBase, model)
}

interface WebServerHost {
  webServer: {
    register(route: {
      kind: 'exact' | 'prefix'
      path: string
      handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
    }): () => void
  }
}

/** Register GET /qsearch/catalog once a web server is composed. */
export function mountCatalogRoute(ctx: Context): void {
  ctx.inject(['webServer'], scoped => {
    const host = scoped as Context & WebServerHost
    host.effect(() => host.webServer.register({
      kind: 'exact',
      path: '/qsearch/catalog',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'GET') {
          res.statusCode = 405
          res.setHeader('allow', 'GET')
          res.end()
          return
        }
        try {
          const body = JSON.stringify(await buildCatalog(ctx))
          res.statusCode = 200
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.setHeader('cache-control', 'no-store')
          res.end(body)
        } catch (error) {
          res.statusCode = 500
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ error: String(error) }))
        }
      },
    }), 'qsearch: catalog route')
  })
}
