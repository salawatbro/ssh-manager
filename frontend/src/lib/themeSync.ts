import { Events } from '@wailsio/runtime'
import { SettingsService } from '@bindings/github.com/salawat/sshmgr/internal/service'
import { LIGHT_QUERY, themeController } from './theme'

// startTheme runs in every window (main, launcher, approval) before React
// renders: none of them share a store, so each reads the setting and follows
// theme:changed from the backend.
export function startTheme() {
  let storage: Storage | undefined
  try {
    storage = window.localStorage
  } catch {
    storage = undefined
  }
  const media = window.matchMedia?.(LIGHT_QUERY)
  const theme = themeController({ root: document.documentElement, media, storage })
  media?.addEventListener('change', theme.systemChanged)
  Events.On('theme:changed', (ev) => theme.choose(ev.data))
  SettingsService.Get()
    .then((s) => {
      if (s) theme.choose(s.theme)
    })
    .catch(() => {})
}
