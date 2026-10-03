import type { Me } from '@/lib/api'
import { cn } from '@/lib/utils'

export function Avatar({ me, className }: { me: Me; className?: string }) {
  return me.picture
    ? <img src={me.picture} alt="" referrerPolicy="no-referrer" className={cn('size-7 rounded-full', className)} />
    : <span className={cn('flex size-7 items-center justify-center rounded-full bg-chart-1 text-xs font-semibold text-white', className)}>{me.email[0]?.toUpperCase()}</span>
}
