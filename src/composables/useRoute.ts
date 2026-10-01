import { computed, onBeforeUnmount, ref } from 'vue'

export type Mode = 'watch' | 'live'

export interface Route {
  mode: Mode
  focus: string | null
  fromAlert: boolean
}

/** `#/live?focus=<id>&from=alert` is Live; `#/`, `#/watch` and anything else is Watch. */
export function parseRoute(hash: string): Route {
  const [path = '', query = ''] = hash.replace(/^#/, '').split('?')
  const params = new URLSearchParams(query)
  return {
    mode: path.replace(/\/+$/, '') === '/live' ? 'live' : 'watch',
    focus: params.get('focus'),
    fromAlert: params.get('from') === 'alert',
  }
}

export function routeHash(mode: Mode, params: Record<string, string> = {}): string {
  const query = new URLSearchParams(params).toString()
  return `#/${mode}${query ? `?${query}` : ''}`
}

/** A tiny hash router: the current route, and navigation that keeps browser history. */
export function useRoute() {
  const hash = ref(window.location.hash)
  const sync = () => {
    hash.value = window.location.hash
  }
  window.addEventListener('hashchange', sync)
  onBeforeUnmount(() => window.removeEventListener('hashchange', sync))

  const route = computed(() => parseRoute(hash.value))

  function navigate(target: string) {
    if (window.location.hash !== target) window.location.hash = target
    sync()
  }

  return { route, navigate }
}
