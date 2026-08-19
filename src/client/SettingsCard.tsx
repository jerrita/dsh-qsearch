import { createElement as h, useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { ReactElement } from 'react'
import type { NativeBackend, SearchBackend } from '../constants.ts'
import { inferBackendFromModel } from '../constants.ts'
import { previewUrl } from './rewrite.ts'
import type { Copy } from './locales.ts'

export interface CardScope {
  getSnapshot(): {
    status: 'loading' | 'ready' | 'unavailable'
    value: { backend?: SearchBackend; route?: string; model?: string } | undefined
    user: unknown
    writable: boolean
  }
  subscribe(listener: () => void): () => void
  set(field: string, value: unknown): Promise<void>
  unset(field: string): Promise<void>
}

export interface CatalogRoute {
  provider: string
  displayName: string
  baseURL?: string
  models: Array<{ id: string; name: string }>
  hasCredential: boolean
}

export interface SettingsCardProps {
  scope: CardScope
  t: (key: keyof Copy) => string
}

function isOverridden(user: unknown, field: string): boolean {
  return typeof user === 'object' && user !== null && Object.hasOwn(user, field)
}

const BACKENDS: Array<{ id: SearchBackend; label: keyof Copy }> = [
  { id: 'auto', label: 'backendAuto' },
  { id: 'gemini', label: 'backendGemini' },
  { id: 'openai', label: 'backendOpenai' },
  { id: 'grok', label: 'backendGrok' },
]

export function SettingsCard({ scope, t }: SettingsCardProps): ReactElement | null {
  const snapshot = useSyncExternalStore(
    useCallback(listener => scope.subscribe(listener), [scope]),
    useCallback(() => scope.getSnapshot(), [scope]),
  )
  const [catalog, setCatalog] = useState<CatalogRoute[] | undefined>(undefined)
  const [catalogError, setCatalogError] = useState<string | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    void fetch('/qsearch/catalog', { headers: { accept: 'application/json' } })
      .then(async response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json() as Promise<{ routes?: CatalogRoute[] }>
      })
      .then(body => {
        if (!cancelled) setCatalog(body.routes ?? [])
      })
      .catch(error => {
        if (!cancelled) setCatalogError(String(error))
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (snapshot.status === 'unavailable') {
    return h('div', { style: pageStyle },
      h('div', { style: titleStyle }, t('title')),
      h('div', { style: hintStyle }, t('catalogFail')),
    )
  }

  const busy = !snapshot.writable || snapshot.status === 'loading'
  const backend = snapshot.value?.backend ?? 'auto'
  const route = snapshot.value?.route ?? ''
  const model = snapshot.value?.model ?? ''
  const selected = catalog?.find(entry => entry.provider === route)
  const previewBackend: NativeBackend | undefined =
    backend === 'auto' ? inferBackendFromModel(model) : backend
  const preview = previewBackend !== undefined && model.length > 0
    ? previewUrl(previewBackend, selected?.baseURL, model)
    : ''

  return h('div', { style: pageStyle },
    h('div', { style: { marginBottom: 16 } },
      h('div', { style: titleStyle }, t('title')),
      h('div', { style: hintStyle }, t('desc')),
    ),
    field(t('backend'), t('backendHint'), isOverridden(snapshot.user, 'backend'), () => void scope.unset('backend'), t, busy,
      h('select', {
        value: backend,
        disabled: busy,
        style: selectStyle,
        onChange: (event: { target: { value: string } }) => { void scope.set('backend', event.target.value) },
      }, BACKENDS.map(item => h('option', { key: item.id, value: item.id }, t(item.label)))),
    ),
    field(t('route'), t('routeHint'), isOverridden(snapshot.user, 'route'), () => void scope.unset('route'), t, busy,
      catalog === undefined && catalogError === undefined
        ? h('div', { style: hintStyle }, t('loading'))
        : h('select', {
          value: route,
          disabled: busy || catalog === undefined,
          style: selectStyle,
          onChange: (event: { target: { value: string } }) => {
            const next = event.target.value
            void scope.set('route', next)
            const hit = catalog?.find(entry => entry.provider === next)
            if (hit?.models[0] !== undefined) void scope.set('model', hit.models[0].id)
          },
        }, [
          h('option', { key: '', value: '' }, '—'),
          ...(catalog ?? []).map(entry => h('option', { key: entry.provider, value: entry.provider },
            `${entry.displayName}${entry.hasCredential ? '' : ` · ${t('noKey')}`}`)),
        ]),
    ),
    field(t('model'), t('modelHint'), isOverridden(snapshot.user, 'model'), () => void scope.unset('model'), t, busy,
      h('select', {
        value: model,
        disabled: busy || selected === undefined,
        style: selectStyle,
        onChange: (event: { target: { value: string } }) => { void scope.set('model', event.target.value) },
      }, [
        h('option', { key: '', value: '' }, '—'),
        ...(selected?.models ?? []).map(entry => h('option', { key: entry.id, value: entry.id }, entry.name || entry.id)),
      ]),
    ),
    preview.length > 0
      ? h('div', { style: { marginTop: 10 } },
        h('div', { style: labelStyle }, t('preview')),
        h('div', { style: hintStyle }, t('previewHint')),
        h('code', { style: previewStyle }, preview),
        selected !== undefined
          ? h('div', { style: hintStyle }, selected.hasCredential ? t('keyYes') : t('keyNo'))
          : null,
      )
      : null,
    catalogError !== undefined ? h('div', { style: errorStyle }, `${t('catalogFail')}: ${catalogError}`) : null,
  )
}

function field(
  label: string,
  hint: string,
  overridden: boolean,
  onRevert: () => void,
  t: (key: keyof Copy) => string,
  busy: boolean,
  control: ReactElement,
): ReactElement {
  return h('div', { style: { marginBottom: 12 } },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
      h('div', { style: labelStyle }, label),
      overridden
        ? h('button', { type: 'button', disabled: busy, onClick: onRevert, style: revertStyle }, t('revert'))
        : null,
    ),
    h('div', { style: hintStyle }, hint),
    control,
  )
}

const pageStyle: Record<string, string> = {
  display: 'flex',
  flexDirection: 'column',
  minWidth: '0',
  padding: '4px 4px 24px',
}
const titleStyle: Record<string, string> = { fontWeight: '500', fontSize: '16px', lineHeight: '24px' }
const labelStyle: Record<string, string> = { fontSize: '13px', fontWeight: '500', lineHeight: '20px' }
const hintStyle: Record<string, string> = {
  fontSize: '12px',
  lineHeight: '18px',
  color: 'var(--dsw-alias-label-tertiary, #8b93a1)',
  margin: '2px 0 6px',
}
const selectStyle: Record<string, string> = { width: '100%', font: 'inherit', padding: '6px 8px' }
const previewStyle: Record<string, string> = {
  display: 'block',
  fontSize: '11px',
  lineHeight: '16px',
  wordBreak: 'break-all',
  background: 'var(--dsw-alias-bg-layer-2, #f3f4f6)',
  borderRadius: '6px',
  padding: '8px 10px',
}
const revertStyle: Record<string, string> = {
  font: 'inherit',
  fontSize: '12px',
  border: 'none',
  background: 'none',
  color: 'var(--dsw-alias-brand-primary, #4f6ef7)',
  cursor: 'pointer',
}
const errorStyle: Record<string, string> = {
  color: 'var(--dsw-alias-state-error-primary, #dc2626)',
  fontSize: '12px',
  marginTop: '8px',
}
