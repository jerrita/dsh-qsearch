/** Marker on this plugin's settings-nav row so CSS can replace the generic gear. */
export const SETTINGS_NAV_MARKER = 'data-dsh-qsearch-settings-nav'

/** Keep the marker on the nav button whose text is the current QSearch label. */
export function registerSettingsNavIcon(label: () => string): () => void {
  let disposed = false
  const sync = (): void => {
    if (disposed) return
    const currentLabel = label().trim()
    const buttons = document.querySelectorAll<HTMLButtonElement>('[role="dialog"] nav button')
    for (const button of buttons) {
      const matches = currentLabel.length > 0 && button.textContent?.trim() === currentLabel
      if (matches) button.setAttribute(SETTINGS_NAV_MARKER, '')
      else button.removeAttribute(SETTINGS_NAV_MARKER)
    }
  }
  sync()
  const observer = new MutationObserver(sync)
  observer.observe(document.body, { childList: true, subtree: true, characterData: true })
  return () => {
    disposed = true
    observer.disconnect()
    document.querySelectorAll(`[${SETTINGS_NAV_MARKER}]`).forEach(element => {
      element.removeAttribute(SETTINGS_NAV_MARKER)
    })
  }
}

const SEARCH_MASK = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cpath d='m21 21-4.3-4.3'/%3E%3C/svg%3E\") center / contain no-repeat"

/** Inject nav-icon CSS for the life of the client fiber. */
export function injectNavIconStyle(): () => void {
  const style = document.createElement('style')
  style.setAttribute('data-dsh-qsearch-nav', '')
  style.textContent = `
[${SETTINGS_NAV_MARKER}] > svg:first-child { display: none; }
[${SETTINGS_NAV_MARKER}]::before {
  content: '';
  flex: none;
  width: 16px;
  height: 16px;
  background: currentColor;
  -webkit-mask: ${SEARCH_MASK};
  mask: ${SEARCH_MASK};
}
`
  document.head.appendChild(style)
  return () => style.remove()
}
