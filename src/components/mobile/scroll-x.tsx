import type { ReactNode } from 'react'
import { useIsMobile } from '@/lib/use-is-mobile'

/** On a phone, a month chart shows `visible` months and scrolls sideways for the rest (newest is on the left, where scrolling starts). No-op on desktop. */
export function ScrollX({ count, visible = 6, children }: { count: number; visible?: number; children: ReactNode }) {
  const mobile = useIsMobile()
  if (!mobile || count <= visible) return <>{children}</>
  return (
    <div className="overflow-x-auto overscroll-x-contain [scrollbar-width:none]">
      <div style={{ width: `${(count / visible) * 100}%` }}>{children}</div>
    </div>
  )
}
