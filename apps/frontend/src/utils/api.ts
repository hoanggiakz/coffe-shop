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
  return (
    path === '/menu' ||
    path.startsWith('/menu/') ||
    path === '/menu/account' ||
    path.startsWith('/menu/account') ||
    path === '/payment/return' ||
    path.startsWith('/payment/return/') ||
    path === '/invoice/public' ||
    path.startsWith('/invoice/public/')
  )
}

const getTokenFromPersistedStorage = (): string | null => {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.sessionStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw)
    const firstState = parsed?.state ?? parsed
    const secondState = firstState?.state ?? firstState
    const candidates = [firstState?.token, secondState?.token]
    for (const token of candidates) {
      if (typeof token === 'string' && token.trim().length > 0) {
        return token
      }
    }
    return null
  } catch {
    return null
  }
}

const getStaffToken = (): string | null => {
  const inMemory = useAuthStore.getState().token
  if (typeof inMemory === 'string' && inMemory.trim().length > 0) return inMemory
  return getTokenFromPersistedStorage()
}

const normalizeRequestPath = (url?: string): string => {
  const raw = String(url || '').trim()
  if (!raw) return ''
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      return new URL(raw).pathname
    } catch {
      return raw
    }
  }
  return raw.startsWith('/') ? raw : `/${raw}`
}

const hasNonEmptyTableId = (params: any): boolean => {
  if (!params) return false
  if (typeof URLSearchParams !== 'undefined' && params instanceof URLSearchParams) {
    return String(params.get('tableId') || '').trim().length > 0
  }
  if (typeof params === 'object') {
    const value = (params as any).tableId
    if (Array.isArray(value)) {
      return value.some((entry) => String(entry || '').trim().length > 0)
    }
    return String(value || '').trim().length > 0
  }
  return false
}

const isAuthEndpointRequest = (path: string): boolean => {
  return (
    path === '/users/login' ||
    path === '/api/users/login' ||
    path.startsWith('/users/customer/') ||
    path.startsWith('/api/users/customer/') ||
    path === '/auth/login' ||
    path === '/api/auth/login' ||
    path === '/auth/register' ||
    path === '/api/auth/register' ||
    path === '/auth/refresh' ||
    path === '/api/auth/refresh' ||
    path === '/auth/forgot-password' ||
    path === '/api/auth/forgot-password' ||
    path === '/auth/reset-password' ||
    path === '/api/auth/reset-password' ||
    path === '/auth/otp/request' ||
    path === '/api/auth/otp/request' ||
    path === '/auth/otp/verify' ||
    path === '/api/auth/otp/verify' ||
    path.startsWith('/auth/google/') ||
    path.startsWith('/api/auth/google/')
  )
}

api.interceptors.request.use((config) => {
  const method = String(config.method || 'get').toUpperCase()
  const requestPath = normalizeRequestPath(config.url)
  const isOrdersListRequest = requestPath === '/orders' || requestPath === '/api/orders'
  if (isPublicCustomerRoute() && method === 'GET' && isOrdersListRequest && !hasNonEmptyTableId(config.params)) {
    return Promise.reject(new Error('Customer orders request requires tableId'))
  }

  const token = getStaffToken()
  const explicitAuthHeader = (config.headers as any)?.Authorization ?? (config.headers as any)?.authorization
  const hasAuthorizationHeader = typeof explicitAuthHeader === 'string' && explicitAuthHeader.trim().length > 0
  const isCustomerMenuRoute = isPublicCustomerRoute()
  if (token && !hasAuthorizationHeader && !isCustomerMenuRoute && !isAuthEndpointRequest(requestPath)) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const requestPath = normalizeRequestPath(error.config?.url)
      const { logout } = useAuthStore.getState()
      if (!isPublicCustomerRoute() && !isAuthEndpointRequest(requestPath)) {
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
