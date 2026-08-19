import type { NativeBackend } from '../constants.ts'
import { rewriteSearchBaseURL, searchEndpoint } from '../rewrite.ts'

export function previewUrl(backend: NativeBackend, baseURL: string | undefined, model: string): string {
  if (baseURL === undefined || baseURL.trim().length === 0 || model.trim().length === 0) return ''
  try {
    return searchEndpoint(backend, rewriteSearchBaseURL(backend, baseURL), model)
  } catch (error) {
    return String(error)
  }
}
