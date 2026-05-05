import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { Toaster } from 'react-hot-toast'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useUiStore } from './stores/uiStore.ts'

const CHUNK_RELOAD_GUARD_KEY = '__chunk_reload_guard__'

function tryRecoverFromChunkLoadError() {
  if (sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY) === '1') {
    sessionStorage.removeItem(CHUNK_RELOAD_GUARD_KEY)
    return
  }
  sessionStorage.setItem(CHUNK_RELOAD_GUARD_KEY, '1')
  window.location.reload()
}

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  tryRecoverFromChunkLoadError()
})

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason
  const message =
    typeof reason?.message === 'string' ? reason.message : String(reason ?? '')

  if (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Importing a module script failed')
  ) {
    event.preventDefault()
    tryRecoverFromChunkLoadError()
  }
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 60000,
    },
  },
})

function UiEffects() {
  const darkMode = useUiStore((state) => state.darkMode)
  const density = useUiStore((state) => state.density)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  useEffect(() => {
    document.documentElement.dataset.density = density
  }, [density])

  return null
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <UiEffects />
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3200,
          className: 'shadow-lg',
          style: {
            borderRadius: '14px',
            border: '1px solid #dbeafe',
            background: 'rgba(255,255,255,0.94)',
            color: '#0f172a',
            backdropFilter: 'blur(8px)',
          },
        }}
      />
    </QueryClientProvider>
  </React.StrictMode>,
)
