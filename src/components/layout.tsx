import { LogOut } from 'lucide-react'
import { NavLink, Outlet } from 'react-router'
import { Avatar } from '@/components/avatar'
import { AppShell } from '@/components/mobile/shell'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { api, type Me } from '@/lib/api'
import { useIsMobile } from '@/lib/use-is-mobile'
import { cn } from '@/lib/utils'

const links = [
  { to: '/', label: 'Overview' },
  { to: '/planning', label: 'Planning' },
  { to: '/balance', label: 'Balance' },
  { to: '/tax', label: 'ภาษี' },
]

export function Layout({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const mobile = useIsMobile()
  const logout = async () => {
    try { await api.logout() } catch { /* the page forgets the session either way */ }
    window.google?.accounts.id.disableAutoSelect()
    onLogout()
  }
  const desktopHeader = (
      <header className="sticky top-0 z-10 border-b bg-background/85 backdrop-blur">
        <div className="flex h-14 items-center gap-6 px-8">
          <span className="font-semibold tracking-tight">money-plan</span>
          <nav className="flex gap-1 text-sm">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end
                className={({ isActive }) => cn('rounded-md px-3 py-1.5 transition-colors', isActive ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground')}>
                {l.label}
              </NavLink>
            ))}
          </nav>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" className="ml-auto h-9 gap-2 px-2 text-sm text-muted-foreground" aria-label="เมนูบัญชี" />}>
              <span>{me.email}</span>
              <Avatar me={me} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="truncate text-sm text-foreground">
                  {me.name ?? me.email}
                  <span className="block text-xs font-normal text-muted-foreground">{me.email}</span>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout}><LogOut /> ออกจากระบบ</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
  )
  return <AppShell me={me} onLogout={logout} mobile={mobile} desktopHeader={desktopHeader}><Outlet /></AppShell>
}

export function PageState({ error }: { error?: unknown }) {
  return (
    <div className="py-24 text-center text-sm text-muted-foreground">
      {error ? `โหลดข้อมูลไม่ได้: ${error instanceof Error ? error.message : String(error)}` : 'กำลังโหลด…'}
    </div>
  )
}
