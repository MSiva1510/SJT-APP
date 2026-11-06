// ─── Shared in-memory data cache ─────────────────────────────
// Eliminates repeat Supabase round-trips when navigating between pages.
// TTL = 60 seconds. Cleared automatically on any mutation.
//
// Usage (in data files — already wired in automatically):
//   The cache wraps loadXxx() so pages get instant data on repeat visits.

const CACHE = {}
const TTL   = 60_000   // 60 s

export function cacheGet(key) {
  const entry = CACHE[key]
  if (!entry) return null
  if (Date.now() - entry.ts > TTL) { delete CACHE[key]; return null }
  return entry.data
}

export function cacheSet(key, data) {
  CACHE[key] = { data, ts: Date.now() }
  return data
}

export function cacheClear(key) {
  if (key) delete CACHE[key]
  else Object.keys(CACHE).forEach(k => delete CACHE[k])
}

// Wrap an async loader with cache
export function withCache(key, loader) {
  return async function cachedLoader() {
    const hit = cacheGet(key)
    if (hit !== null) return hit
    const data = await loader()
    return cacheSet(key, data)
  }
}