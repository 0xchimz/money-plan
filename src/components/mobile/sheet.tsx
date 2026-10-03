import type { ReactNode } from 'react'
import { Drawer } from '@base-ui/react/drawer'
import { cn } from '@/lib/utils'

/**
 * Bottom sheet for the phone layout. Swipe down, tap outside or Esc closes it; it keeps the focused field above
 * the iPhone keyboard. Controlled — the parent owns `open`. `footer` holds the main buttons under the scrolling body.
 */
export function Sheet({ open, onOpenChange, title, description, actions, footer, children, className }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  footer?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <Drawer.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
      <Drawer.VirtualKeyboardProvider>
        <Drawer.Portal>
          <Drawer.Backdrop className="fixed inset-0 z-40 min-h-dvh bg-black/35 opacity-[calc(1-var(--drawer-swipe-progress))] transition-opacity duration-300 data-swiping:duration-0 data-starting-style:opacity-0 data-ending-style:opacity-0" />
          <Drawer.Viewport className="fixed inset-0 z-50 flex items-end justify-center pb-[var(--drawer-keyboard-inset,0px)]">
            <Drawer.Popup className={cn('flex max-h-[calc(100dvh-2.5rem-env(safe-area-inset-top)-var(--drawer-keyboard-inset,0px))] w-full max-w-[640px] flex-col rounded-t-3xl bg-card text-card-foreground shadow-[0_-10px_30px_-10px_rgb(0_0_0/0.3)] outline-none [transform:translateY(var(--drawer-swipe-movement-y))] transition-transform duration-[400ms] ease-[cubic-bezier(0.32,0.72,0,1)] data-swiping:select-none data-starting-style:[transform:translateY(100%)] data-ending-style:[transform:translateY(100%)]', className)}>
              <div className="shrink-0 px-4 pt-2 pb-2">
                <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-input" aria-hidden />
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <Drawer.Title className="text-base font-semibold tracking-tight">{title}</Drawer.Title>
                    {description && <Drawer.Description className="text-xs text-muted-foreground">{description}</Drawer.Description>}
                  </div>
                  {actions}
                </div>
              </div>
              <Drawer.Content className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3">{children}</Drawer.Content>
              {footer
                ? <div className="shrink-0 border-t px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">{footer}</div>
                : <div className="h-[env(safe-area-inset-bottom)] shrink-0" />}
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.VirtualKeyboardProvider>
    </Drawer.Root>
  )
}
