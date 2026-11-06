// ─── withTimeout utility ──────────────────────────────────────
// Wraps any Promise with a max-wait timeout so UI never hangs
// on a slow or unreachable Supabase project.
//
// Usage:
//   const data = await withTimeout(repository.getAll(), 10_000, [])

export function withTimeout(promise, ms = 10_000, fallback = null) {
  let timer
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      console.warn(`[withTimeout] Request exceeded ${ms}ms — using fallback`)
      resolve(fallback)
    }, ms)
  })
  return Promise.race([
    promise.then(result => { clearTimeout(timer); return result }),
    timeout,
  ])
}