import { useSyncExternalStore } from 'react'

/** Below 1024px (Tailwind `lg`) the app uses its phone layout: bottom tabs, sheets. 1024px and up is the desktop layout. */
export const MOBILE_QUERY = '(max-width: 1023.98px)'

const subscribe = (onChange: () => void) => {
  const m = window.matchMedia(MOBILE_QUERY)
  m.addEventListener('change', onChange)
  return () => m.removeEventListener('change', onChange)
}

export const useIsMobile = () => useSyncExternalStore(subscribe, () => window.matchMedia(MOBILE_QUERY).matches)
