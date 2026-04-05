import axios from 'axios'
import { useAuthStore } from '@/stores/authStore'

const API_URL = import.meta.env.VITE_API_URL || '/api'

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  const explicitAuthHeader = (config.headers as any)?.Authorization ?? (config.headers as any)?.authorization
  const hasAuthorizationHeader = typeof explicitAuthHeader === 'string' && explicitAuthHeader.trim().length > 0
  const isCustomerMenuRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/menu')
  if (token && !hasAuthorizationHeader && !isCustomerMenuRoute) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const { isAuthenticated, logout } = useAuthStore.getState()
      if (isAuthenticated) {
        logout()
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  },
)

export default api
