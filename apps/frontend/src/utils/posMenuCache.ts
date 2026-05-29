const MENU_CACHE_TTL_MS = 5 * 60 * 1000

type CachedMenuPayload<T> = {
  data: T[]
  cachedAt: number
}

const buildMenuCacheKey = (branchId?: string) => `pos_menu_cache_${String(branchId || 'all').trim() || 'all'}`

export function readPosMenuCache<T>(branchId?: string): T[] | null {
  if (typeof window === 'undefined') return null
  const key = buildMenuCacheKey(branchId)
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedMenuPayload<T>
    if (!parsed?.cachedAt || !Array.isArray(parsed?.data)) return null
    if (Date.now() - Number(parsed.cachedAt) > MENU_CACHE_TTL_MS) {
      window.localStorage.removeItem(key)
      return null
    }
    return parsed.data
  } catch {
    return null
  }
}

export function writePosMenuCache<T>(branchId: string | undefined, data: T[]) {
  if (typeof window === 'undefined') return
  const key = buildMenuCacheKey(branchId)
  const payload: CachedMenuPayload<T> = {
    data: Array.isArray(data) ? data : [],
    cachedAt: Date.now(),
  }
  window.localStorage.setItem(key, JSON.stringify(payload))
}

export function clearPosMenuCache(branchId?: string) {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(buildMenuCacheKey(branchId))
}

