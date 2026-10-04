import { useCallback, useEffect, useState } from 'react'
import { Route, Routes } from 'react-router'
import { Layout, PageState } from '@/components/layout'
import { api, ApiError, setForbiddenHandler, setUnauthorizedHandler, type Me } from '@/lib/api'
import { BalancePage } from '@/pages/balance'
import { LoginPage } from '@/pages/login'
import { OverviewPage } from '@/pages/overview'
import { PlanningPage } from '@/pages/planning'
import { TaxPage } from '@/pages/tax'

/** Who is logged in decides between the login page and the app */
export function App() {
  const [me, setMe] = useState<Me | 'anon' | null>(null)
  const [denied, setDenied] = useState<string | null>(null)
  const [error, setError] = useState<unknown>()

  useEffect(() => {
    setUnauthorizedHandler(() => setMe('anon'))
    setForbiddenHandler((email) => { setDenied(email); setMe('anon') })
    api.me().then(setMe, (e: unknown) => {
      if (e instanceof ApiError && e.status === 403) {
        setDenied(String(e.body.email ?? ''))
        setMe('anon')
      } else if (e instanceof ApiError && e.status === 401) setMe('anon')
      else setError(e)
    })
  }, [])
  const onLogin = useCallback((m: Me) => {
    setDenied(null)
    setMe(m)
  }, [])

  if (me === null) return <PageState error={error} />
  if (me === 'anon') return <LoginPage onLogin={onLogin} denied={denied} />
  return (
    <Routes>
      <Route element={<Layout me={me} onLogout={() => setMe('anon')} />}>
        <Route index element={<OverviewPage />} />
        <Route path="planning" element={<PlanningPage />} />
        <Route path="balance" element={<BalancePage />} />
        <Route path="tax" element={<TaxPage />} />
      </Route>
    </Routes>
  )
}
