import { LogOut } from 'lucide-react'
import { NavLink, Outlet } from 'react-router'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { api, type Me } from '@/lib/api'
import { cn } from '@/lib/utils'

const links = [
  { to: '/', label: 'Overview' },
  { to: '/planning', label: 'Planning' },
  { to: '/balance', label: 'Balance' },
]

export function Layout({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const logout = async () => {
    try { await api.logout() } catch { /* the page forgets the session either way */ }
    window.google?.accounts.id.disableAutoSelect()
    onLogout()
  }
  return (
    <div className="min-h-svh bg-background">
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
      <main className="mx-auto max-w-[1600px] px-8 py-8">
        <Outlet />
      </main>
    </div>
  )
}

function Avatar({ me }: { me: Me }) {
  return me.picture
    ? <img src={me.picture} alt="" referrerPolicy="no-referrer" className="size-7 rounded-full" />
    : <span className="flex size-7 items-center justify-center rounded-full bg-chart-1 text-xs font-semibold text-white">{me.email[0]?.toUpperCase()}</span>
}

export function PageState({ error }: { error?: unknown }) {
  return (
    <div className="py-24 text-center text-sm text-muted-foreground">
      {error ? `โหลดข้อมูลไม่ได้: ${error instanceof Error ? error.message : String(error)}` : 'กำลังโหลด…'}
    </div>
  )
}
