import { WebError } from '@deepseek-ai/dsh-web'
import { USER_AGENT } from './constants.ts'

/** True for a fetch / AbortSignal abort. */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

/** Stable cancellation error for one search. */
export function searchAborted(signal?: AbortSignal, fallback?: unknown): WebError {
  return new WebError('qsearch aborted', 'WEB_ABORTED', {
    cause: signal?.aborted === true ? signal.reason : fallback,
  })
}

/** Throw when the caller already aborted. */
export function throwIfSearchAborted(signal?: AbortSignal): void {
  if (signal?.aborted === true) throw searchAborted(signal)
}

/**
 * Race a same-process preflight against caller cancellation. Settlement
 * handlers keep observing an uncooperative operation after abort so a later
 * rejection cannot become unhandled.
 */
export function abortable<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal === undefined) return operation
  if (signal.aborted) return Promise.reject(searchAborted(signal))
  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      reject(searchAborted(signal))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    operation.then(
      value => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      error => {
        signal.removeEventListener('abort', onAbort)
        reject(new Error(String(error).replace(/^Error: /u, ''), { cause: error }))
      },
    )
  })
}

/** Best-effort provider error text from a JSON error envelope. */
export function providerErrorMessage(parsed: unknown, fallback: string): string {
  if (parsed === null || typeof parsed !== 'object') return fallback
  const record = parsed as Record<string, unknown>
  if (typeof record.error === 'string' && record.error.length > 0) return record.error
  if (record.error !== null && typeof record.error === 'object') {
    const message = (record.error as { message?: unknown }).message
    if (typeof message === 'string' && message.length > 0) return message
  }
  if (typeof record.message === 'string' && record.message.length > 0) return record.message
  return fallback
}

/** POST JSON to a native search endpoint; redirects are refused. */
export async function postJson(options: {
  url: string
  headers: Record<string, string>
  body: unknown
  signal?: AbortSignal
  label: string
}): Promise<unknown> {
  throwIfSearchAborted(options.signal)
  let response: Response
  try {
    response = await fetch(options.url, {
      method: 'POST',
      redirect: 'error',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'user-agent': USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify(options.body),
      ...(options.signal !== undefined ? { signal: options.signal } : {}),
    })
  } catch (error) {
    if (options.signal?.aborted === true || isAbortError(error)) throw searchAborted(options.signal, error)
    throw new WebError(`${options.label} request failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
  }
  if (!response.ok) {
    let message = `${options.label} API error (HTTP ${response.status})`
    try {
      message = providerErrorMessage(await response.json(), message)
    } catch (error) {
      if (options.signal?.aborted === true || isAbortError(error)) throw searchAborted(options.signal, error)
    }
    throw new WebError(message, 'WEB_PROVIDER_ERROR')
  }
  try {
    return await response.json()
  } catch (error) {
    if (options.signal?.aborted === true || isAbortError(error)) throw searchAborted(options.signal, error)
    throw new WebError(`${options.label} returned an unprocessable response body: ${String(error)}`, 'WEB_PROVIDER_ERROR', {
      cause: error,
    })
  }
}
