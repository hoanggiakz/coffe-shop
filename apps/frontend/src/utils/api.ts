import axios from 'axios'
import { useAuthStore } from '@/stores/authStore'
import { resolveApiBaseUrl } from '@/utils/runtime-endpoints'

const API_URL = resolveApiBaseUrl()

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
})

const AUTH_STORAGE_KEY = 'auth-storage'

const isPublicCustomerRoute = () => {
  if (typeof window === 'undefined') return false
  const path = window.location.pathname
  return path === '/menu' || path.startsWith('/menu/') || path === '/payment/return' || path.startsWith('/payment/return/')
}

const getTokenFromPersistedStorage = (): string | null => {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw)
    const state = parsed?.state ?? parsed
    const token = state?.token
    return typeof token === 'string' && token.trim().length > 0 ? token : null
  } catch {
    return null
  }
}

const getStaffToken = (): string | null => {
  const inMemory = useAuthStore.getState().token
  if (typeof inMemory === 'string' && inMemory.trim().length > 0) return inMemory
  return getTokenFromPersistedStorage()
}

api.interceptors.request.use((config) => {
  const token = getStaffToken()
  const explicitAuthHeader = (config.headers as any)?.Authorization ?? (config.headers as any)?.authorization
  const hasAuthorizationHeader = typeof explicitAuthHeader === 'string' && explicitAuthHeader.trim().length > 0
  const isCustomerMenuRoute = isPublicCustomerRoute()
  if (token && !hasAuthorizationHeader && !isCustomerMenuRoute) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const { logout } = useAuthStore.getState()
      if (!isPublicCustomerRoute()) {
        logout()
        if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
          window.location.href = '/login'
        }
      }
    }
    return Promise.reject(error)
  },
)

export default api
