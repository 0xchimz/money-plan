import { createContext, useContext, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useLocation } from 'react-router'
import { ClipboardList, LayoutDashboard, LogOut, Scale } from 'lucide-react'
import { Avatar } from '@/components/avatar'
import { Sheet } from '@/components/mobile/sheet'
import { Button } from '@/components/ui/button'
import type { Me } from '@/lib/api'
import { cn } from '@/lib/utils'

export const MOBILE_PAGES = [
  { to: '/', label: 'ภาพรวม', icon: LayoutDashboard },
  { to: '/planning', label: 'แผนเงิน', icon: ClipboardList },
  { to: '/balance', label: 'งบดุล', icon: Scale },
]

type Slots = { inline: HTMLElement | null; below: HTMLElement | null }
const SlotContext = createContext<Slots>({ inline: null, below: null })

/** Page controls in the phone header: `children` sit right of the title, `below` gets its own full-width row. Renders nothing outside MobileShell. */
export function TopBarSlot({ children, below }: { children?: ReactNode; below?: ReactNode }) {
  const slots = useContext(SlotContext)
  return (
    <>
      {children != null && slots.inline && createPortal(children, slots.inline)}
      {below != null && slots.below && createPortal(below, slots.below)}
    </>
  )
}

export function MobileShell({ me, onLogout, children }: { me: Me; onLogout: () => void; children: ReactNode }) {
  const [inline, setInline] = useState<HTMLElement | null>(null)
  const [below, setBelow] = useState<HTMLElement | null>(null)
  const [account, setAccount] = useState(false)
  const { pathname } = useLocation()
  const page = MOBILE_PAGES.find((p) => p.to === pathname) ?? MOBILE_PAGES[0]
  return (
    <SlotContext value={{ inline, below }}>
      <div className="min-h-svh bg-background">
        <header className="sticky top-0 z-20 border-b bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur">
          <div className="mx-auto flex h-13 max-w-[640px] items-center gap-2 pl-4 pr-1.5">
            <h1 className="shrink-0 text-base font-semibold tracking-tight">{page.label}</h1>
            <div ref={setInline} className="flex min-w-0 flex-1 items-center justify-end gap-1" />
            <button type="button" onClick={() => setAccount(true)} aria-label="บัญชี" className="grid size-11 shrink-0 place-items-center rounded-full">
              <Avatar me={me} />
            </button>
          </div>
          <div ref={setBelow} className="mx-auto max-w-[640px] px-3 pb-2 empty:hidden" />
        </header>
        <main className="mx-auto max-w-[640px] px-3 pt-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">{children}</main>
        <nav aria-label="เมนูหลัก" className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <div className="mx-auto grid h-16 max-w-[640px] grid-cols-3">
            {MOBILE_PAGES.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} end
                className={({ isActive }) => cn('flex flex-col items-center justify-center gap-0.5 text-[11px]', isActive ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                <Icon className="size-5" aria-hidden />{label}
              </NavLink>
            ))}
          </div>
        </nav>
        <Sheet open={account} onOpenChange={setAccount} title="บัญชี">
          <div className="flex items-center gap-3 py-2">
            <Avatar me={me} className="size-10 text-sm" />
            <div className="min-w-0">
              <div className="truncate font-medium">{me.name ?? me.email}</div>
              <div className="truncate text-sm text-muted-foreground">{me.email}</div>
            </div>
          </div>
          <Button variant="ghost" className="h-11 w-full justify-start text-critical" onClick={onLogout}><LogOut /> ออกจากระบบ</Button>
        </Sheet>
      </div>
    </SlotContext>
  )
}
