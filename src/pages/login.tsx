import { useEffect, useRef, useState } from 'react'
import { CircleAlert } from 'lucide-react'
import { api, ApiError, type AuthConfig, type Me } from '@/lib/api'
import { loadGoogle } from '@/lib/google'

type Problem = { title: string; detail?: string }
const notAllowed = (email: string): Problem => ({ title: `${email} ยังไม่ได้รับสิทธิ์`, detail: 'ขอให้ Chin เพิ่มอีเมลนี้ก่อน แล้วลองใหม่อีกครั้ง' })
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function LoginPage({ onLogin, denied }: { onLogin: (me: Me) => void; denied?: string | null }) {
  const button = useRef<HTMLDivElement>(null)
  const [config, setConfig] = useState<AuthConfig | null>(null)
  const [problem, setProblem] = useState<Problem | null>(denied ? notAllowed(denied) : null)

  useEffect(() => {
    api.authConfig().then(setConfig, (e) => setProblem({ title: 'ติดต่อเซิร์ฟเวอร์ไม่ได้', detail: message(e) }))
  }, [])

  useEffect(() => {
    if (!config?.googleClientId) return
    let alive = true
    loadGoogle().then((g) => {
      if (!alive || !button.current) return
      g.initialize({
        client_id: config.googleClientId,
        ux_mode: 'popup',
        callback: ({ credential }) => {
          setProblem(null)
          api.loginGoogle(credential).then(onLogin, (e: unknown) =>
            setProblem(e instanceof ApiError && e.body.error === 'not_allowed' ? notAllowed(String(e.body.email)) : { title: 'เข้าสู่ระบบไม่สำเร็จ', detail: message(e) }))
        },
      })
      g.renderButton(button.current, { theme: 'outline', size: 'large', shape: 'pill', text: 'signin_with', locale: 'th', width: 260 })
    }, (e) => setProblem({ title: 'โหลดปุ่ม Google ไม่ได้', detail: message(e) }))
    return () => { alive = false }
  }, [config, onLogin])

  return (
    <div className="grid min-h-svh place-items-center bg-[radial-gradient(ellipse_at_top,var(--hero-from),var(--background)_60%)] px-4">
      <div className="w-full max-w-[380px] rounded-2xl border bg-card p-7 text-center shadow-[var(--card-shadow)]">
        <div className="mx-auto mb-3 grid size-11 place-items-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">฿</div>
        <h1 className="text-xl font-semibold tracking-tight">money-plan</h1>
        <p className="mt-1 text-sm text-muted-foreground">วางแผนเงินรายเดือน · งบดุลส่วนตัว · สรุปการเงินของคุณ</p>
        <div ref={button} className="mt-5 flex min-h-11 justify-center" />
        {config && !config.googleClientId && <p className="mt-2 text-sm text-warning">ยังไม่ได้ตั้ง GOOGLE_CLIENT_ID (ดู README)</p>}
        <p className="mt-3 text-xs text-muted-foreground">เฉพาะอีเมลที่ได้รับเชิญ · ข้อมูลของแต่ละคนแยกกัน คนอื่นมองไม่เห็น</p>
        {problem && (
          <div role="alert" className="mt-4 flex gap-2 rounded-xl bg-critical/10 p-3 text-left text-sm text-critical">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span><span className="font-medium">{problem.title}</span>{problem.detail && <span className="block">{problem.detail}</span>}</span>
          </div>
        )}
      </div>
    </div>
  )
}
