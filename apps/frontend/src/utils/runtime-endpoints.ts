const CODESPACES_SUFFIX = '.app.github.dev'

function isCodespacesHost(hostname: string): boolean {
  return hostname.endsWith(CODESPACES_SUFFIX)
}

function replaceCodespacesPort(hostname: string, port: number): string | null {
  const match = hostname.match(/^(.*)-(\d+)\.app\.github\.dev$/)
  if (!match) {
    return null
  }
  return `${match[1]}-${port}.app.github.dev`
}

export function resolveApiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_URL
  if (fromEnv && String(fromEnv).trim().length > 0) {
    return fromEnv
  }

  if (typeof window === 'undefined') {
    return '/api'
  }

  if (!isCodespacesHost(window.location.hostname)) {
    return '/api'
  }

  const apiHost = replaceCodespacesPort(window.location.hostname, 8080)
  if (!apiHost) {
    return '/api'
  }

  return `${window.location.protocol}//${apiHost}/api`
}

export function resolveWebsocketBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_WS_URL
  if (fromEnv && String(fromEnv).trim().length > 0) {
    return fromEnv
  }

  if (typeof window === 'undefined') {
    return ''
  }

  if (!isCodespacesHost(window.location.hostname)) {
    return window.location.origin
  }

  const wsHost = replaceCodespacesPort(window.location.hostname, 3007)
  if (!wsHost) {
    return window.location.origin
  }

  return `${window.location.protocol}//${wsHost}`
}
