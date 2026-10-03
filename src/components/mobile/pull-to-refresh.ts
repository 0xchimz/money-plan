import { createContext, useContext, useEffect, useRef, useState } from 'react'

type Reload = () => Promise<unknown>
/** Pages register how to reload their data; pull to refresh runs them in place, so the page never blanks to "กำลังโหลด…" */
export const RefreshContext = createContext<(fn: Reload) => () => void>(() => () => {})

/** Register this page's reload for pull to refresh (no-op outside the phone shell). Always calls the latest `fn`. */
export function usePageRefresh(fn: Reload) {
  const register = useContext(RefreshContext)
  const latest = useRef(fn)
  latest.current = fn
  useEffect(() => register(() => latest.current()), [register])
}

/** How far (px, after resistance) the page must be pulled before letting go refreshes it */
export const PULL_THRESHOLD = 70
const MAX_PULL = 110
const MIN_SPIN_MS = 700

/**
 * Pull down at the top of the page to refresh — the iPhone home-screen app has no browser pull-to-refresh.
 * Ignored while a sheet (role="dialog") is open or when the page is not scrolled to the top.
 * `pull` is the current drag distance; `refreshing` stays true until `onRefresh` settles (at least MIN_SPIN_MS).
 */
export function usePullToRefresh(onRefresh: () => Promise<unknown>) {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const start = useRef<number | null>(null)
  const current = useRef(0)
  const busy = useRef(false)
  const refresh = useRef(onRefresh)
  refresh.current = onRefresh

  useEffect(() => {
    const set = (v: number) => { current.current = v; setPull(v) }
    const onStart = (e: TouchEvent) => {
      const inSheet = e.target instanceof Element && e.target.closest('[role="dialog"]')
      start.current = busy.current || window.scrollY > 0 || inSheet || document.querySelector('[role="dialog"]') ? null : e.touches[0].clientY
    }
    const onMove = (e: TouchEvent) => {
      if (start.current == null) return
      const dy = e.touches[0].clientY - start.current
      if (dy <= 0 || window.scrollY > 0) { set(0); return }
      if (e.cancelable) e.preventDefault()
      set(Math.min(dy * 0.5, MAX_PULL))
    }
    const onEnd = () => {
      if (start.current == null) return
      start.current = null
      if (current.current < PULL_THRESHOLD) { set(0); return }
      busy.current = true
      setRefreshing(true)
      set(PULL_THRESHOLD)
      Promise.allSettled([refresh.current(), new Promise((r) => setTimeout(r, MIN_SPIN_MS))])
        .then(() => { busy.current = false; setRefreshing(false); set(0) })
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  return { pull, refreshing }
}
