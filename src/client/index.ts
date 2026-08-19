/**
 * Browser half: a left-nav settings section named QSearch.
 */
import { createElement as h } from 'react'
import { en, NS, zh } from './locales.ts'
import { injectNavIconStyle, registerSettingsNavIcon } from './nav-icon.ts'
import { SettingsCard, type CardScope } from './SettingsCard.tsx'

export const name = 'qsearch'
export const inject: string[] = []

interface SettingsScopeHost {
  locale: {
    register(namespace: string, dicts: { zh: Record<string, string>; en: Record<string, string> }): () => void
    bind(namespace: string): (key: string) => string
  }
  settingsScope: { bind(spec: { namespace: string }): CardScope }
  slots: {
    inject(name: string, register: () => unknown): void
    register(options: Record<string, unknown>, render: () => unknown): unknown
  }
}

interface ClientContext {
  inject(services: string[], callback: (scoped: SettingsScopeHost) => void): void
  effect(callback: () => (() => void) | void, label?: string): void
}

export function apply(ctx: ClientContext): void {
  ctx.inject(['settingsScope', 'locale', 'slots'], scoped => {
    ctx.effect(() => scoped.locale.register(NS, { zh, en }), 'qsearch: dictionaries')
    const t = scoped.locale.bind(NS)
    const scope = scoped.settingsScope.bind({ namespace: NS })
    ctx.effect(() => injectNavIconStyle(), 'qsearch: nav icon style')
    ctx.effect(() => registerSettingsNavIcon(() => t('nav')), 'qsearch: settings navigation icon')
    scoped.slots.inject('settings.section', () => scoped.slots.register({
      name: 'settings.section',
      id: 'qsearch',
      order: 35,
      label: () => t('nav'),
      locale: NS,
    }, () => h(SettingsCard, { scope, t: t as (key: keyof typeof zh) => string })))
  })
}
